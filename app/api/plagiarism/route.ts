import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, plagiarismResults, llmCallLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { callOpenRouter, loadBind } from "@/lib/routing/openrouter";
import { webSearch } from "@/lib/search/tavily";
import { rateLimit } from "@/lib/rate-limit";
import { requireSubscription } from "@/lib/stripe/require-subscription";

const QUERY_SYSTEM = `You generate web search queries for plagiarism checking.

Given a list of numbered paragraphs from a document, create a targeted search query for EACH paragraph that would find the original source if the paragraph was copied from somewhere.

Rules:
- Create a query for EVERY paragraph — do not skip any
- Extract the most distinctive phrase or claim from each paragraph
- Remove filler words, keep specific names, dates, statistics, and unique phrasing
- For very short paragraphs (titles, headers), use the text as-is

Respond with a JSON array matching the paragraph numbers:
[{"num": 1, "query": "search query here"}, {"num": 2, "query": "..."}, ...]

Return ONLY the JSON array.`;

const ASSESS_SYSTEM = `You assess whether a passage from a student document matches web content found via search.

Plagiarism is using someone else's WORDS or ideas WITHOUT attribution. A passage that names its source with an in-text citation — e.g. "(Christie, 1986)" or "Tuchman's (1978) concept of symbolic annihilation" — and paraphrases the cited ideas is CORRECT academic practice, not plagiarism, even when its phrasing resembles how that theory is normally described in scholarship. Describing a cited theory in standard academic terms is expected; do not flag it.

Given the original passage and search results, determine:
- "plagiarism" — substantial verbatim or near-verbatim wording matches a source and the passage does NOT attribute that source
- "close_match" — the specific WORDING (not just the concept) is near-verbatim to a particular source the passage does not attribute. Requires actual matching phrases visible in the search results — "sounds like academic discourse" or "mirrors how this is typically presented" is NOT sufficient. Never use close_match for a passage whose ideas are attributed with an in-text citation unless its wording is copied nearly word-for-word from a DIFFERENT, uncited source.
- "cited" — the passage attributes its ideas to a source via in-text citation and paraphrases legitimately. This is proper academic writing; nothing to fix.
- "common_knowledge" — basic, universally known facts (dates, definitions, widely documented events) that any informed person would state in nearly identical terms
- "coincidence" — surface similarity but different meaning or context
- "quotation" — the passage is a properly attributed direct quote

Respond in EXACTLY this format:
VERDICT: [plagiarism/close_match/cited/common_knowledge/coincidence/quotation]
CONFIDENCE: [0.0 to 1.0]
EXPLANATION: [2-3 sentences explaining your assessment]
TOP_URL: [the most relevant matching URL, or "none"]
TOP_TITLE: [title of that page, or "none"]
TOP_SNIPPET: [the matching snippet from that page, or "none"]`;

// Last-resort defaults only — the live config is the "plagiarism-queries" /
// "plagiarism-assess" activity binds (constraint #7: models are admin-managed).
const QUERY_FALLBACK_CONFIG = {
  system: QUERY_SYSTEM,
  model: "google/gemini-3-flash-preview",
  fallbacks: ["openai/gpt-5.4-nano"],
  temperature: 0.1,
  maxTokens: 4096,
};
const ASSESS_FALLBACK_CONFIG = {
  system: ASSESS_SYSTEM,
  model: "google/gemini-3-flash-preview",
  fallbacks: ["openai/gpt-5.4-mini", "deepseek/deepseek-v4-flash"],
  temperature: 0.2,
  maxTokens: 1024,
};

type PlagLLMConfig = typeof ASSESS_FALLBACK_CONFIG;

async function loadPlagConfig(slug: string, fallback: PlagLLMConfig): Promise<PlagLLMConfig> {
  try {
    const b = await loadBind(slug);
    return {
      system: b.systemPrompt || fallback.system,
      model: b.model.openrouterModelId,
      fallbacks: b.fallbacks.length > 0 ? b.fallbacks : fallback.fallbacks,
      temperature: b.model.temperature,
      maxTokens: b.model.maxTokens,
    };
  } catch {
    return fallback;
  }
}

const MIN_SEARCH_SCORE = 0.4;
const MIN_PARAGRAPH_WORDS = 8; // Skip very short paragraphs (titles, single words)

/**
 * GET — Load existing plagiarism results for a document.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return NextResponse.json({ success: false, error: "documentId required" }, { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  const results = await db
    .select()
    .from(plagiarismResults)
    .where(eq(plagiarismResults.documentId, documentId));

  return NextResponse.json({ success: true, data: results });
}

/**
 * POST — Comprehensive plagiarism check.
 *
 * Pipeline:
 * 1. Split document into every paragraph (deterministic, nothing skipped)
 * 2. LLM generates search queries for all paragraphs in one batch call
 * 3. Web search each paragraph
 * 4. LLM assesses each paragraph that has search results
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Paywall: plagiarism checking spends OpenRouter + web-search credits, so it
  // is a paid feature. Gate it like suggest/evaluate/citations so anonymous and
  // free-tier sessions can't trigger paid API calls.
  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  // Rate limit: 5 plagiarism checks per minute per user
  const rl = rateLimit(`plagiarism:${user.id}`, 5, 60_000);
  if (rl.limited) {
    return NextResponse.json({ success: false, error: "Too many plagiarism checks. Please wait a moment." }, { status: 429 });
  }

  const { documentId } = await request.json();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  // Load sections
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  const fullText = docSections
    .filter((s) => !s.isLocked)
    .map((s) => s.currentText)
    .join("\n\n");

  if (!fullText.trim()) {
    return NextResponse.json({ success: false, error: "Document has no text" }, { status: 400 });
  }

  // Cost guard for re-checks: paragraphs whose text is unchanged since the
  // last plagiarism pass reuse their stored verdict instead of paying for a
  // fresh search + assessment. Keyed by exact paragraph text.
  const previousResults = await db
    .select()
    .from(plagiarismResults)
    .where(eq(plagiarismResults.documentId, documentId));
  const previousByText = new Map(
    previousResults
      .filter((r) => r.verdict !== "error")
      .map((r) => [r.passageText, r] as const),
  );

  // Clear previous results
  await db.delete(plagiarismResults).where(eq(plagiarismResults.documentId, documentId));

  // ── Step 1: Deterministic paragraph extraction ──────────────────────
  // Split into every paragraph. Nothing is skipped or selected by LLM.
  const allParagraphs = fullText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Filter out paragraphs that are too short to meaningfully search
  // but track them so we know what was skipped
  const paragraphs: { text: string; index: number }[] = [];
  const skippedShort: number[] = [];

  for (let i = 0; i < allParagraphs.length; i++) {
    const wordCount = allParagraphs[i].split(/\s+/).length;
    if (wordCount >= MIN_PARAGRAPH_WORDS) {
      paragraphs.push({ text: allParagraphs[i], index: i });
    } else {
      skippedShort.push(i);
    }
  }

  console.log(`[plagiarism] ${allParagraphs.length} total paragraphs, ${paragraphs.length} to check, ${skippedShort.length} too short`);

  if (paragraphs.length === 0) {
    return NextResponse.json({
      success: true,
      data: { passagesChecked: 0, matchesFound: 0, results: [] },
    });
  }

  // ── Step 2: Generate search queries for ALL paragraphs (one LLM call) ─
  console.log("[plagiarism] Step 2: Generating search queries...");
  // Only paragraphs without a reusable previous result need a search query.
  const paragraphsNeedingQueries = paragraphs
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !previousByText.has(p.text));
  const numberedParagraphs = paragraphsNeedingQueries
    .map(({ p, i }) => `[${i + 1}] ${p.text}`)
    .join("\n\n");

  const queryMap: Map<number, string> = new Map();
  const queryCfg = await loadPlagConfig("plagiarism-queries", QUERY_FALLBACK_CONFIG);
  const assessCfg = await loadPlagConfig("plagiarism-assess", ASSESS_FALLBACK_CONFIG);

  if (paragraphsNeedingQueries.length === 0) {
    console.log("[plagiarism] All paragraphs unchanged since last pass — no query generation needed");
  } else try {
    const queryResult = await callOpenRouter(
      [
        { role: "system", content: queryCfg.system },
        { role: "user", content: `Document type: ${doc.documentType}\n\nParagraphs:\n${numberedParagraphs}` },
      ],
      queryCfg.model,
      queryCfg.fallbacks,
      queryCfg.temperature,
      queryCfg.maxTokens,
    );

    await db.insert(llmCallLog).values({
      activityType: "plagiarism_queries",
      modelUsed: queryResult.modelUsed,
      inputTokens: queryResult.inputTokens,
      outputTokens: queryResult.outputTokens,
      latencyMs: queryResult.latencyMs ?? 0,
      outcome: "pending",
    });

    const jsonMatch = queryResult.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: { num: number; query: string }[] = JSON.parse(jsonMatch[0]);
      for (const entry of parsed) {
        queryMap.set(entry.num, entry.query);
      }
    }

    console.log(`[plagiarism] Generated ${queryMap.size} search queries`);
  } catch (err) {
    console.error("[plagiarism] Query generation failed:", err);
    // Fallback: use first 50 chars of each paragraph as search query
    for (let i = 0; i < paragraphs.length; i++) {
      queryMap.set(i + 1, paragraphs[i].text.slice(0, 80));
    }
    console.log("[plagiarism] Falling back to raw text queries");
  }

  // ── Step 3 & 4: Search and assess with bounded concurrency ──────────
  const results: (typeof plagiarismResults.$inferSelect)[] = [];
  let matchesFound = 0;
  const CONCURRENCY = 2;

  let reusedCount = 0;

  async function checkParagraph(para: typeof paragraphs[number], idx: number) {
    const searchQuery = queryMap.get(idx + 1) ?? para.text.slice(0, 80);

    const passageStart = fullText.indexOf(para.text);
    const passageEnd = passageStart >= 0 ? passageStart + para.text.length : 0;

    let sectionId: string | null = null;
    for (const sec of docSections) {
      if (sec.currentText.includes(para.text)) {
        sectionId = sec.id;
        break;
      }
    }

    // Unchanged paragraph → reuse the previous verdict, no search, no LLM.
    const previous = previousByText.get(para.text);
    if (previous) {
      reusedCount++;
      if (previous.verdict === "plagiarism") matchesFound++;
      const [inserted] = await db.insert(plagiarismResults).values({
        documentId,
        sectionId,
        passageText: para.text,
        passageStart: Math.max(0, passageStart),
        passageEnd,
        searchQuery: previous.searchQuery,
        searchResults: previous.searchResults,
        verdict: previous.verdict,
        explanation: previous.explanation,
        confidence: previous.confidence,
        topMatchUrl: previous.topMatchUrl,
        topMatchTitle: previous.topMatchTitle,
        topMatchSnippet: previous.topMatchSnippet,
        status: previous.status,
        modelUsed: previous.modelUsed,
      }).returning();
      return inserted;
    }

    console.log(`[plagiarism] Checking ${idx + 1}/${paragraphs.length}: "${para.text.slice(0, 50)}..."`);

    try {
      const searchResults = await webSearch(searchQuery, 5);
      const relevantResults = searchResults.filter((r) => r.score >= MIN_SEARCH_SCORE);

      if (relevantResults.length === 0) {
        const [inserted] = await db.insert(plagiarismResults).values({
          documentId,
          sectionId,
          passageText: para.text,
          passageStart: Math.max(0, passageStart),
          passageEnd,
          searchQuery,
          searchResults: searchResults,
          verdict: "coincidence",
          explanation: "No relevant web matches found.",
          confidence: 0.95,
          status: "dismissed",
        }).returning();
        return inserted;
      }

      const searchContext = relevantResults
        .map((r, i) => `[${i + 1}] URL: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.content}`)
        .join("\n\n");

      // Surface the passage's own in-text citations so the assessor can't
      // miss that the ideas are attributed (parenthetical + narrative forms).
      const inTextCitations = para.text.match(
        /\([A-Z][^()]{0,60}?(?:1[5-9]|20)\d{2}[a-z]?(?:[^()]{0,20})?\)|\b[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-zÀ-ÿ'’-]+)?(?:'s)?\s*\((?:1[5-9]|20)\d{2}[a-z]?\)/g
      );
      const citationNote = inTextCitations?.length
        ? `\n\nNOTE: this passage contains in-text citations: ${[...new Set(inTextCitations)].join("; ")}`
        : "";

      const assessResult = await callOpenRouter(
        [
          { role: "system", content: assessCfg.system },
          { role: "user", content: `PASSAGE FROM DOCUMENT:\n"${para.text}"${citationNote}\n\nWEB SEARCH RESULTS:\n${searchContext}` },
        ],
        assessCfg.model,
        assessCfg.fallbacks,
        assessCfg.temperature,
        assessCfg.maxTokens,
      );

      await db.insert(llmCallLog).values({
        activityType: "plagiarism_assess",
        modelUsed: assessResult.modelUsed,
        inputTokens: assessResult.inputTokens,
        outputTokens: assessResult.outputTokens,
        latencyMs: assessResult.latencyMs ?? 0,
        outcome: "pending",
      });

      const parsed = parseAssessment(assessResult.content);

      if (parsed.verdict === "plagiarism") {
        matchesFound++;
      }

      const [inserted] = await db.insert(plagiarismResults).values({
        documentId,
        sectionId,
        passageText: para.text,
        passageStart: Math.max(0, passageStart),
        passageEnd,
        searchQuery,
        searchResults: relevantResults,
        verdict: parsed.verdict,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
        topMatchUrl: parsed.topUrl,
        topMatchTitle: parsed.topTitle,
        topMatchSnippet: parsed.topSnippet,
        status: "open",
        modelUsed: assessResult.modelUsed,
      }).returning();

      console.log(`[plagiarism] Paragraph ${idx + 1}: verdict=${parsed.verdict}, confidence=${parsed.confidence}`);
      return inserted;
    } catch (err) {
      console.error(`[plagiarism] Error on paragraph ${idx + 1}:`, err);

      const [inserted] = await db.insert(plagiarismResults).values({
        documentId,
        sectionId,
        passageText: para.text,
        passageStart: Math.max(0, passageStart),
        passageEnd,
        searchQuery,
        searchResults: [],
        verdict: "error",
        explanation: err instanceof Error ? err.message : "Search or assessment failed",
        status: "open",
      }).returning();
      return inserted;
    }
  }

  // Process paragraphs with bounded concurrency
  for (let i = 0; i < paragraphs.length; i += CONCURRENCY) {
    const batch = paragraphs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((para, j) => checkParagraph(para, i + j))
    );
    results.push(...batchResults);
  }

  const totalChecked = results.length;
  const cleanCount = results.filter((r) => r.verdict === "coincidence").length;

  // Calculate and persist plagiarism score
  // plagiarism = full confidence weight, close_match = 0.15x weight
  const plagOnly = results.filter((r) => r.verdict === "plagiarism");
  const closeMatchOnly = results.filter((r) => r.verdict === "close_match");
  const checkedNonError = results.filter((r) => r.verdict !== "error").length;
  let plagiarismScore: number | null = null;
  if (checkedNonError > 0) {
    const plagWeight = plagOnly.reduce((s, r) => s + (r.confidence ?? 0.5), 0);
    const closeWeight = closeMatchOnly.reduce((s, r) => s + (r.confidence ?? 0.5) * 0.15, 0);
    const rawPlag = Math.round(
      ((plagWeight + closeWeight) / checkedNonError) * 100
    );
    plagiarismScore = Math.max(0, Math.min(100, rawPlag));

    await db
      .update(documents)
      .set({ plagiarismScore, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }

  console.log(`[plagiarism] Done: ${totalChecked} paragraphs checked (${reusedCount} unchanged, reused), ${matchesFound} plagiarism matches, ${cleanCount} clean, ${skippedShort.length} skipped (too short), score=${plagiarismScore}`);

  return NextResponse.json({
    success: true,
    data: {
      passagesChecked: totalChecked,
      skippedShort: skippedShort.length,
      matchesFound,
      results: results.filter((r) => r.verdict !== "coincidence" || r.status === "open"),
    },
  });
}

function parseAssessment(response: string): {
  verdict: "plagiarism" | "close_match" | "cited" | "common_knowledge" | "coincidence" | "quotation";
  confidence: number;
  explanation: string;
  topUrl: string | null;
  topTitle: string | null;
  topSnippet: string | null;
} {
  const verdictMatch = response.match(/VERDICT:\s*(plagiarism|close_match|cited|common_knowledge|coincidence|quotation)/i);
  const confMatch = response.match(/CONFIDENCE:\s*([\d.]+)/i);
  const explMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\nTOP_URL:|$)/i);
  const urlMatch = response.match(/TOP_URL:\s*(.+)/i);
  const titleMatch = response.match(/TOP_TITLE:\s*(.+)/i);
  const snippetMatch = response.match(/TOP_SNIPPET:\s*([\s\S]*?)$/i);

  const topUrl = urlMatch?.[1]?.trim();
  const topTitle = titleMatch?.[1]?.trim();
  const topSnippet = snippetMatch?.[1]?.trim();

  return {
    verdict: (verdictMatch?.[1]?.toLowerCase() as "plagiarism" | "close_match" | "cited" | "common_knowledge" | "coincidence" | "quotation") ?? "coincidence",
    confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
    explanation: explMatch?.[1]?.trim() ?? response.trim(),
    topUrl: topUrl && topUrl !== "none" ? topUrl : null,
    topTitle: topTitle && topTitle !== "none" ? topTitle : null,
    topSnippet: topSnippet && topSnippet !== "none" ? topSnippet : null,
  };
}
