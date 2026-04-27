import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, plagiarismResults, llmCallLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { callOpenRouter } from "@/lib/routing/openrouter";
import { webSearch } from "@/lib/search/tavily";

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

Given the original passage and search results, determine:
- "plagiarism" — the passage closely matches a source without attribution
- "common_knowledge" — the match is widely known facts anyone might write similarly
- "coincidence" — surface similarity but different meaning or context
- "quotation" — the passage is a properly attributed quote

Respond in EXACTLY this format:
VERDICT: [plagiarism/common_knowledge/coincidence/quotation]
CONFIDENCE: [0.0 to 1.0]
EXPLANATION: [2-3 sentences explaining your assessment]
TOP_URL: [the most relevant matching URL, or "none"]
TOP_TITLE: [title of that page, or "none"]
TOP_SNIPPET: [the matching snippet from that page, or "none"]`;

// Models
const QUERY_MODEL = "google/gemini-2.5-flash";
const ASSESS_MODEL = "anthropic/claude-sonnet-4";
const ASSESS_FALLBACKS = ["google/gemini-2.5-pro", "openai/gpt-4o"];

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
  const numberedParagraphs = paragraphs
    .map((p, i) => `[${i + 1}] ${p.text}`)
    .join("\n\n");

  let queryMap: Map<number, string> = new Map();

  try {
    const queryResult = await callOpenRouter(
      [
        { role: "system", content: QUERY_SYSTEM },
        { role: "user", content: `Document type: ${doc.documentType}\n\nParagraphs:\n${numberedParagraphs}` },
      ],
      QUERY_MODEL,
      ["google/gemini-2.5-flash-lite"],
      0.1,
      4096,
    );

    await db.insert(llmCallLog).values({
      activityType: "plagiarism_queries",
      modelUsed: queryResult.modelUsed,
      inputTokens: queryResult.inputTokens,
      outputTokens: queryResult.outputTokens,
      latencyMs: 0,
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

  // ── Step 3 & 4: Search and assess every paragraph ───────────────────
  const results: (typeof plagiarismResults.$inferSelect)[] = [];
  let matchesFound = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const searchQuery = queryMap.get(i + 1) ?? para.text.slice(0, 80);

    console.log(`[plagiarism] Checking ${i + 1}/${paragraphs.length}: "${para.text.slice(0, 50)}..."`);

    // Find position in full text
    const passageStart = fullText.indexOf(para.text);
    const passageEnd = passageStart >= 0 ? passageStart + para.text.length : 0;

    // Find which section
    let sectionId: string | null = null;
    for (const sec of docSections) {
      if (sec.currentText.includes(para.text)) {
        sectionId = sec.id;
        break;
      }
    }

    try {
      // Web search
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

        results.push(inserted);
        continue;
      }

      // LLM assessment
      const searchContext = relevantResults
        .map((r, idx) => `[${idx + 1}] URL: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.content}`)
        .join("\n\n");

      const assessResult = await callOpenRouter(
        [
          { role: "system", content: ASSESS_SYSTEM },
          { role: "user", content: `PASSAGE FROM DOCUMENT:\n"${para.text}"\n\nWEB SEARCH RESULTS:\n${searchContext}` },
        ],
        ASSESS_MODEL,
        ASSESS_FALLBACKS,
        0.2,
        1024,
      );

      await db.insert(llmCallLog).values({
        activityType: "plagiarism_assess",
        modelUsed: assessResult.modelUsed,
        inputTokens: assessResult.inputTokens,
        outputTokens: assessResult.outputTokens,
        latencyMs: 0,
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

      results.push(inserted);
      console.log(`[plagiarism] Paragraph ${i + 1}: verdict=${parsed.verdict}, confidence=${parsed.confidence}`);

      // Small delay between searches
      if (i < paragraphs.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      console.error(`[plagiarism] Error on paragraph ${i + 1}:`, err);

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

      results.push(inserted);
    }
  }

  const totalChecked = results.length;
  const cleanCount = results.filter((r) => r.verdict === "coincidence").length;

  // Calculate and persist plagiarism score
  const plagOnly = results.filter((r) => r.verdict === "plagiarism");
  const checkedNonError = results.filter((r) => r.verdict !== "error").length;
  let plagiarismScore: number | null = null;
  if (checkedNonError > 0) {
    const rawPlag = Math.round(
      (plagOnly.reduce((s, r) => s + (r.confidence ?? 0.5), 0) / checkedNonError) * 100
    );
    plagiarismScore = Math.max(0, Math.min(100, rawPlag));

    await db
      .update(documents)
      .set({ plagiarismScore, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }

  console.log(`[plagiarism] Done: ${totalChecked} paragraphs checked, ${matchesFound} plagiarism matches, ${cleanCount} clean, ${skippedShort.length} skipped (too short), score=${plagiarismScore}`);

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
  verdict: "plagiarism" | "common_knowledge" | "coincidence" | "quotation";
  confidence: number;
  explanation: string;
  topUrl: string | null;
  topTitle: string | null;
  topSnippet: string | null;
} {
  const verdictMatch = response.match(/VERDICT:\s*(plagiarism|common_knowledge|coincidence|quotation)/i);
  const confMatch = response.match(/CONFIDENCE:\s*([\d.]+)/i);
  const explMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\nTOP_URL:|$)/i);
  const urlMatch = response.match(/TOP_URL:\s*(.+)/i);
  const titleMatch = response.match(/TOP_TITLE:\s*(.+)/i);
  const snippetMatch = response.match(/TOP_SNIPPET:\s*([\s\S]*?)$/i);

  const topUrl = urlMatch?.[1]?.trim();
  const topTitle = titleMatch?.[1]?.trim();
  const topSnippet = snippetMatch?.[1]?.trim();

  return {
    verdict: (verdictMatch?.[1]?.toLowerCase() as "plagiarism" | "common_knowledge" | "coincidence" | "quotation") ?? "coincidence",
    confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
    explanation: explMatch?.[1]?.trim() ?? response.trim(),
    topUrl: topUrl && topUrl !== "none" ? topUrl : null,
    topTitle: topTitle && topTitle !== "none" ? topTitle : null,
    topSnippet: topSnippet && topSnippet !== "none" ? topSnippet : null,
  };
}
