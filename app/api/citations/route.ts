import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { citations, documents, sections, llmCallLog, libraryEntries } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { callOpenRouter, loadBind } from "@/lib/routing/openrouter";
import { webSearch } from "@/lib/search/tavily";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { buildCitationGraph, type GraphFlag } from "@/lib/citations/graph";
import {
  loadCitationArtifacts,
  checkCitationArtifacts,
  cleanCitationArtifacts,
} from "@/lib/citations/artifacts";

/**
 * GET: Load all citations for a document.
 * POST: Run structural check on citations, or trigger live verification.
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

  try {
    // Verify ownership
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
      .limit(1);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const docCitations = await db
      .select()
      .from(citations)
      .where(eq(citations.documentId, documentId));

    return NextResponse.json({ success: true, data: docCitations });
  } catch (err) {
    console.error("Citations load failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load citations." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "structural_check") {
      return handleStructuralCheck(body, user.id);
    }

    if (action === "resolve") {
      return handleResolve(body, user.id);
    }

    if (action === "verify_all") {
      return handleVerifyAll(body, user.id);
    }

    if (action === "convert_all") {
      return handleConvertAll(body, user.id);
    }

    if (action === "compute_score") {
      return handleComputeScore(body, user.id);
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Citations action failed:", err);
    return NextResponse.json(
      { success: false, error: "Citations operation failed. Please try again." },
      { status: 500 }
    );
  }
}

async function handleStructuralCheck(
  body: { documentId: string },
  userId: string
) {
  const { documentId } = body;

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  // Build the document-wide citation graph: reference entries, in-text
  // citations, quotes — linked, with reconciliation findings attached.
  const graph = buildCitationGraph(doc.rawText);
  const artifactPatterns = await loadCitationArtifacts();

  if (graph.entries.length === 0 && graph.inline.length === 0) {
    return NextResponse.json({
      success: true,
      data: { citations: [], message: "No citations detected in document." },
    });
  }

  const detectedStyle = detectCitationStyle([
    ...graph.inline.map((c) => c.text),
    ...graph.entries.map((e) => e.text),
  ]);

  // Reference entries: style/format checks + artifact patterns + graph findings.
  const entryRecords = graph.entries.map((entry) => {
    const artifactFlags = checkCitationArtifacts(entry.text, artifactPatterns);
    const structuralFlags: GraphFlag[] = [
      ...checkStructure(entry.text, detectedStyle),
      ...artifactFlags,
      ...entry.flags,
    ];
    // Suggested correction: strip artifacts first, then apply format fixes.
    const cleaned = artifactFlags.length > 0 ? cleanCitationArtifacts(entry.text, artifactPatterns) : entry.text;
    const formatFixed = buildCorrectedText(cleaned, checkStructure(cleaned, detectedStyle));
    const correctedText = formatFixed ?? (cleaned !== entry.text ? cleaned : null);
    return { entry, structuralFlags, correctedText };
  });

  // Clear previous citations, then insert reference entries first so inline
  // and quote rows can point at their entry's row id.
  await db.delete(citations).where(eq(citations.documentId, documentId));

  const insertedEntries = graph.entries.length
    ? await db
        .insert(citations)
        .values(
          entryRecords.map((r) => ({
            documentId,
            rawText: r.entry.text,
            style: detectedStyle,
            entryType: "reference_entry",
            structuralFlags: r.structuralFlags,
            verificationFlags: null,
            correctedText: r.correctedText,
            status: r.structuralFlags.length > 0 ? ("open" as const) : ("resolved" as const),
          }))
        )
        .returning()
    : [];

  // In-text citations and quotes are stored only when they carry findings —
  // healthy ones exist transiently in the graph and would only add noise.
  const flaggedInline = graph.inline.filter((c) => c.flags.length > 0);
  const flaggedQuotes = graph.quotes.filter((q) => q.flags.length > 0);

  const insertedFindings = flaggedInline.length + flaggedQuotes.length > 0
    ? await db
        .insert(citations)
        .values([
          ...flaggedInline.map((c) => ({
            documentId,
            rawText: c.text,
            style: detectedStyle,
            entryType: "inline",
            linkedCitationId:
              c.matchedEntryIndex !== null ? insertedEntries[c.matchedEntryIndex]?.id ?? null : null,
            contextSentence: c.contextSentence,
            structuralFlags: c.flags,
            verificationFlags: null,
            status: "open" as const,
          })),
          ...flaggedQuotes.map((q) => ({
            documentId,
            rawText: q.text,
            style: detectedStyle,
            entryType: "quote",
            contextSentence: q.contextSentence,
            structuralFlags: q.flags,
            verificationFlags: null,
            status: "open" as const,
          })),
        ])
        .returning()
    : [];

  // Bump flagCount on matched artifact library entries (acceptance analytics).
  const artifactHits = new Map<string, number>();
  for (const r of entryRecords) {
    for (const f of r.structuralFlags as (GraphFlag & { libraryEntryId?: string })[]) {
      if (f.libraryEntryId) artifactHits.set(f.libraryEntryId, (artifactHits.get(f.libraryEntryId) ?? 0) + 1);
    }
  }
  for (const [libId, count] of artifactHits) {
    db.update(libraryEntries)
      .set({ flagCount: sql`${libraryEntries.flagCount} + ${count}` })
      .where(eq(libraryEntries.id, libId))
      .catch(() => {});
  }

  const score = await computeAndUpdateScore(documentId);

  return NextResponse.json({ success: true, data: [...insertedEntries, ...insertedFindings], score });
}

async function handleResolve(body: {
  citationId: string;
  userAction: "accepted" | "edited" | "verified" | "dismissed";
  correctedText?: string;
}, userId: string) {
  const { citationId, userAction, correctedText } = body;

  // Verify ownership: citation → document → userId
  const [citation] = await db
    .select({ documentId: citations.documentId })
    .from(citations)
    .where(eq(citations.id, citationId))
    .limit(1);
  if (!citation) {
    return NextResponse.json({ success: false, error: "Citation not found" }, { status: 404 });
  }
  const [doc] = await db
    .select({ userId: documents.userId })
    .from(documents)
    .where(and(eq(documents.id, citation.documentId), eq(documents.userId, userId)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // Load the full citation record before updating (need rawText for section replacement)
  const [fullCitation] = await db.select().from(citations).where(eq(citations.id, citationId)).limit(1);

  const [updated] = await db
    .update(citations)
    .set({
      status: userAction === "dismissed" ? "dismissed" : "resolved",
      userAction,
      correctedText: correctedText || null,
    })
    .where(eq(citations.id, citationId))
    .returning();

  // When accepting or editing a fix, also replace the citation in the document text
  if (correctedText && fullCitation && (userAction === "accepted" || userAction === "edited")) {
    const docSections = await db.select().from(sections).where(eq(sections.documentId, fullCitation.documentId));
    for (const section of docSections) {
      if (section.currentText.includes(fullCitation.rawText)) {
        const newText = section.currentText.replaceAll(fullCitation.rawText, correctedText);
        if (newText !== section.currentText) {
          await db.update(sections).set({ currentText: newText }).where(eq(sections.id, section.id));
        }
      }
    }
  }

  // Recompute score after resolving
  let score: number | null = null;
  if (updated) score = await computeAndUpdateScore(updated.documentId);

  return NextResponse.json({ success: true, data: updated, score });
}

// ── Helper functions ───────────────────────────────────────────────────────
// Extraction and reference-section splitting live in lib/citations/graph.ts;
// this route keeps only style detection and per-entry format checks.

type CitationStyle = "apa" | "mla" | "chicago" | "harvard" | "oxford" | "bluebook" | "oscola" | "business";

function detectCitationStyle(citations: string[]): CitationStyle {
  const joined = citations.join(" ");

  // APA: (Author, Year) pattern
  if (/\([A-Z][a-z]+,?\s*\d{4}\)/.test(joined)) return "apa";

  // MLA: (Author Page) no comma, no year
  if (/\([A-Z][a-z]+\s+\d+\)/.test(joined)) return "mla";

  // Chicago: footnote numbers
  if (/\[\d+\]/.test(joined)) return "chicago";

  // Harvard: similar to APA
  if (/\([A-Z][a-z]+\s+\d{4}\)/.test(joined)) return "harvard";

  return "apa"; // default
}

interface StructuralFlag {
  type: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix: string | null;
}

function checkStructure(citation: string, style: CitationStyle): StructuralFlag[] {
  const flags: StructuralFlag[] = [];

  if (style === "apa" || style === "harvard") {
    // Check for year
    if (!/\d{4}/.test(citation)) {
      flags.push({
        type: "missing_year",
        message: "No publication year found.",
        severity: "error",
        suggestedFix: null,
      });
    }

    // Check for author
    if (!/[A-Z]/.test(citation)) {
      flags.push({
        type: "missing_author",
        message: "No author name detected.",
        severity: "error",
        suggestedFix: null,
      });
    }

    // Reference list entries: check for period after year
    if (citation.length > 30 && /\d{4}/.test(citation)) {
      if (!/\d{4}\)?\.\s/.test(citation)) {
        // Auto-fix: insert period after year (or after closing paren if year is in parens)
        const fixed = citation.replace(/(\d{4}\)?)\s/, "$1. ");
        flags.push({
          type: "format_period",
          message: "Period expected after year in APA format.",
          severity: "warning",
          suggestedFix: fixed !== citation ? fixed : null,
        });
      }

      // Check for URL or DOI if it looks like a web source
      if (/http|www|doi/i.test(citation) && !/https?:\/\//.test(citation)) {
        // Auto-fix: prepend https:// to bare www or http URLs
        const fixed = citation.replace(/\b(www\.)/gi, "https://$1");
        flags.push({
          type: "malformed_url",
          message: "URL appears incomplete or malformed.",
          severity: "warning",
          suggestedFix: fixed !== citation ? fixed : null,
        });
      }
    }
  }

  if (style === "mla") {
    // MLA: author last, first format
    if (citation.length > 30 && !/,/.test(citation.split(".")[0] || "")) {
      // Auto-fix: try to swap "First Last" → "Last, First" in the author segment
      const authorSegment = citation.split(".")[0]?.trim() ?? "";
      const parts = authorSegment.split(/\s+/);
      let fixed: string | null = null;
      if (parts.length === 2) {
        const swapped = `${parts[1]}, ${parts[0]}`;
        fixed = citation.replace(authorSegment, swapped);
      }
      flags.push({
        type: "author_format",
        message: 'MLA requires "Last, First" author format.',
        severity: "warning",
        suggestedFix: fixed,
      });
    }
  }

  return flags;
}

/**
 * Given structural flags for a citation, pick the best auto-fix.
 * Applies all fixable flags sequentially to produce a single corrected text.
 */
function buildCorrectedText(citation: string, flags: StructuralFlag[]): string | null {
  let result = citation;
  let changed = false;
  for (const flag of flags) {
    if (flag.suggestedFix) {
      // Re-apply the same fix type to the evolving result
      if (flag.type === "format_period" && !/\d{4}\)?\.\s/.test(result)) {
        const fixed = result.replace(/(\d{4}\)?)\s/, "$1. ");
        if (fixed !== result) { result = fixed; changed = true; }
      } else if (flag.type === "malformed_url" && /\b(www\.)/i.test(result) && !/https?:\/\//.test(result)) {
        const fixed = result.replace(/\b(www\.)/gi, "https://$1");
        if (fixed !== result) { result = fixed; changed = true; }
      } else if (flag.type === "author_format") {
        const authorSegment = result.split(".")[0]?.trim() ?? "";
        const parts = authorSegment.split(/\s+/);
        if (parts.length === 2 && !/,/.test(authorSegment)) {
          const swapped = `${parts[1]}, ${parts[0]}`;
          result = result.replace(authorSegment, swapped);
          changed = true;
        }
      }
    }
  }
  return changed ? result : null;
}

// ── LLM config via activity binds ──────────────────────────────────────────
// Prompts and models are managed in the admin panel (activity binds). The
// constants below are LAST-RESORT fallbacks used only if a bind hasn't been
// seeded — normal operation reads everything from the database (constraint #7).

interface CitationLLMConfig {
  system: string;
  userTemplate: string;
  contextText: string;
  model: string;
  fallbacks: string[];
  temperature: number;
  maxTokens: number;
}

interface CitationLLMFallback {
  system: string;
  user: string;
  model: string;
  fallbacks: string[];
  temperature: number;
  maxTokens: number;
}

async function loadCitationConfig(slug: string, fb: CitationLLMFallback): Promise<CitationLLMConfig> {
  try {
    const b = await loadBind(slug);
    return {
      system: b.systemPrompt || fb.system,
      userTemplate: b.userPrompt || fb.user,
      contextText: b.contextText,
      model: b.model.openrouterModelId,
      fallbacks: b.fallbacks.length > 0 ? b.fallbacks : fb.fallbacks,
      temperature: b.model.temperature,
      maxTokens: b.model.maxTokens,
    };
  } catch {
    return {
      system: fb.system,
      userTemplate: fb.user,
      contextText: "",
      model: fb.model,
      fallbacks: fb.fallbacks,
      temperature: fb.temperature,
      maxTokens: fb.maxTokens,
    };
  }
}

/** Fills [TOKEN] placeholders in a prompt template. */
function fillTemplate(template: string, tokens: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(`[${key}]`).join(value);
  }
  return result;
}

// ── Citation verification ─────────────────────────────────────────────────

const VERIFY_QUERY_SYSTEM = `You generate web search queries to verify academic citations.

For each numbered citation, create a search query that would find the original publication if it exists. Include the author's surname, year, and the most distinctive words from the title.

Respond with a JSON array:
[{"num": 1, "query": "search query here"}, ...]

Return ONLY the JSON array.`;

const VERIFY_ASSESS_SYSTEM = `You verify whether an academic citation is real by comparing it to web search results.

Given the citation and search results, determine:
- "verified" — search results confirm this publication exists with matching author, year, and title
- "wrong_details" — a similar publication exists but some details are wrong (year, author spelling, title, journal)
- "unverified" — no matching publication found in search results
- "uncertain" — partial match, cannot confirm or deny

Respond in EXACTLY this format:
VERDICT: [verified/wrong_details/unverified/uncertain]
CONFIDENCE: [0.0 to 1.0]
EXPLANATION: [2-3 sentences about what you found or didn't find]
CORRECT_CITATION: [the corrected citation text if wrong_details, otherwise "n/a"]
SOURCE_URL: [URL of the matching source if found, otherwise "none"]`;

const VERIFY_QUERY_FALLBACK: CitationLLMFallback = {
  system: VERIFY_QUERY_SYSTEM,
  user: "Citations to verify:\n[CITATIONS]",
  model: "google/gemini-2.5-flash",
  fallbacks: ["google/gemini-2.5-flash-lite"],
  temperature: 0.1,
  maxTokens: 2048,
};

const VERIFY_ASSESS_FALLBACK: CitationLLMFallback = {
  system: VERIFY_ASSESS_SYSTEM,
  user: 'CITATION:\n"[CITATION]"\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  model: "anthropic/claude-sonnet-4",
  fallbacks: ["google/gemini-2.5-pro", "openai/gpt-4o"],
  temperature: 0.2,
  maxTokens: 1024,
};

async function handleVerifyAll(body: { documentId: string }, userId: string) {
  const { documentId } = body;

  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId))).limit(1);
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  // Only reference-list entries are verifiable against the web — inline and
  // quote rows are document-consistency findings, not lookups.
  const docCitations = await db
    .select()
    .from(citations)
    .where(and(eq(citations.documentId, documentId), eq(citations.entryType, "reference_entry")));
  if (docCitations.length === 0) {
    return NextResponse.json({ success: true, data: { verified: 0, total: 0 } });
  }

  console.log(`[citations/verify] Verifying ${docCitations.length} citations...`);

  const queryCfg = await loadCitationConfig("citation-verify-queries", VERIFY_QUERY_FALLBACK);
  const assessCfg = await loadCitationConfig("citation-verify", VERIFY_ASSESS_FALLBACK);

  // Step 1: Generate search queries for all citations (one LLM call)
  const numberedCitations = docCitations.map((c, i) => `[${i + 1}] ${c.rawText}`).join("\n");
  const queryMap = new Map<number, string>();

  try {
    const queryResult = await callOpenRouter(
      [
        { role: "system", content: queryCfg.contextText + queryCfg.system },
        { role: "user", content: fillTemplate(queryCfg.userTemplate, { CITATIONS: numberedCitations }) },
      ],
      queryCfg.model,
      queryCfg.fallbacks,
      queryCfg.temperature,
      queryCfg.maxTokens,
    );

    await db.insert(llmCallLog).values({
      activityType: "citation_verify_queries",
      modelUsed: queryResult.modelUsed,
      inputTokens: queryResult.inputTokens,
      outputTokens: queryResult.outputTokens,
      latencyMs: queryResult.latencyMs ?? 0,
      outcome: "pending",
    });

    const jsonMatch = queryResult.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: { num: number; query: string }[] = JSON.parse(jsonMatch[0]);
      for (const entry of parsed) queryMap.set(entry.num, entry.query);
    }
  } catch (err) {
    console.error("[citations/verify] Query generation failed:", err);
    // Fallback: use the raw citation text as the query
    docCitations.forEach((c, i) => queryMap.set(i + 1, c.rawText.slice(0, 100)));
  }

  // Step 2 & 3: Search and assess each citation
  let verifiedCount = 0;
  let unverifiedCount = 0;
  let wrongDetailsCount = 0;

  for (let i = 0; i < docCitations.length; i++) {
    const citation = docCitations[i];
    const query = queryMap.get(i + 1) ?? citation.rawText.slice(0, 80);

    console.log(`[citations/verify] ${i + 1}/${docCitations.length}: "${citation.rawText.slice(0, 50)}..."`);

    try {
      const searchResults = await webSearch(query, 5);
      const relevantResults = searchResults.filter((r) => r.score >= 0.3);

      if (relevantResults.length === 0) {
        // No results — mark as unverified
        await db.update(citations).set({
          verificationFlags: {
            verdict: "unverified",
            confidence: 0.7,
            explanation: "No matching publication found in web search results.",
            correctCitation: null,
            sourceUrl: null,
          },
        }).where(eq(citations.id, citation.id));
        unverifiedCount++;
        continue;
      }

      // Assess with LLM
      const searchContext = relevantResults
        .map((r, idx) => `[${idx + 1}] URL: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.content}`)
        .join("\n\n");

      const assessResult = await callOpenRouter(
        [
          { role: "system", content: assessCfg.contextText + assessCfg.system },
          {
            role: "user",
            content: fillTemplate(assessCfg.userTemplate, {
              CITATION: citation.rawText,
              SEARCH_RESULTS: searchContext,
            }),
          },
        ],
        assessCfg.model,
        assessCfg.fallbacks,
        assessCfg.temperature,
        assessCfg.maxTokens,
      );

      await db.insert(llmCallLog).values({
        activityType: "citation_verify",
        modelUsed: assessResult.modelUsed,
        inputTokens: assessResult.inputTokens,
        outputTokens: assessResult.outputTokens,
        latencyMs: assessResult.latencyMs ?? 0,
        outcome: "pending",
      });

      // Parse response
      const verdictMatch = assessResult.content.match(/VERDICT:\s*(verified|wrong_details|unverified|uncertain)/i);
      const confMatch = assessResult.content.match(/CONFIDENCE:\s*([\d.]+)/i);
      const explMatch = assessResult.content.match(/EXPLANATION:\s*([\s\S]*?)(?=\nCORRECT_CITATION:|$)/i);
      const correctMatch = assessResult.content.match(/CORRECT_CITATION:\s*([\s\S]*?)(?=\nSOURCE_URL:|$)/i);
      const urlMatch = assessResult.content.match(/SOURCE_URL:\s*(.+)/i);

      const verdict = verdictMatch?.[1]?.toLowerCase() ?? "uncertain";
      const correctCitation = correctMatch?.[1]?.trim();
      const sourceUrl = urlMatch?.[1]?.trim();

      await db.update(citations).set({
        verificationFlags: {
          verdict,
          confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
          explanation: explMatch?.[1]?.trim() ?? assessResult.content.trim(),
          correctCitation: correctCitation && correctCitation !== "n/a" ? correctCitation : null,
          sourceUrl: sourceUrl && sourceUrl !== "none" ? sourceUrl : null,
        },
      }).where(eq(citations.id, citation.id));

      if (verdict === "verified") verifiedCount++;
      else if (verdict === "wrong_details") wrongDetailsCount++;
      else if (verdict === "unverified") unverifiedCount++;

      console.log(`[citations/verify] ${i + 1}: verdict=${verdict}`);

      // Small delay
      if (i < docCitations.length - 1) await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`[citations/verify] Error on citation ${i + 1}:`, err);
      await db.update(citations).set({
        verificationFlags: { verdict: "uncertain", confidence: 0, explanation: "Verification failed: " + (err instanceof Error ? err.message : "unknown error"), correctCitation: null, sourceUrl: null },
      }).where(eq(citations.id, citation.id));
    }
  }

  const score = await computeAndUpdateScore(documentId);

  console.log(`[citations/verify] Done: ${verifiedCount} verified, ${wrongDetailsCount} wrong details, ${unverifiedCount} unverified`);

  return NextResponse.json({
    success: true,
    data: { verified: verifiedCount, wrongDetails: wrongDetailsCount, unverified: unverifiedCount, total: docCitations.length, score },
  });
}

// ── Score computation ─────────────────────────────────────────────────────

async function computeAndUpdateScore(documentId: string): Promise<number> {
  const docCitations = await db.select().from(citations).where(eq(citations.documentId, documentId));
  if (docCitations.length === 0) return 100;

  const withIssues = docCitations.filter((c) => {
    // Structural issues
    const structFlags = (c.structuralFlags as StructuralFlag[] | null) || [];
    const hasStructIssue = structFlags.length > 0 && c.status === "open";
    // Verification issues
    const verifyData = c.verificationFlags as { verdict?: string } | null;
    const hasVerifyIssue = verifyData?.verdict === "unverified" || verifyData?.verdict === "wrong_details";
    return hasStructIssue || hasVerifyIssue;
  }).length;

  const score = Math.round(((docCitations.length - withIssues) / docCitations.length) * 100);
  await db.update(documents).set({ citationsScore: score }).where(eq(documents.id, documentId));
  return score;
}

async function handleComputeScore(body: { documentId: string }, userId: string) {
  const { documentId } = body;
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId))).limit(1);
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  const score = await computeAndUpdateScore(documentId);
  return NextResponse.json({ success: true, data: { score } });
}

// ── Citation style conversion ─────────────────────────────────────────────

const CONVERT_SYSTEM = `You convert citations from one academic style to another.

Rules:
- Do NOT change any factual content (authors, year, title, journal, DOI, URL, page numbers)
- Only change formatting, punctuation, and structure to match the target style
- Return ONLY the converted citation text, nothing else — no explanation, no prefix

Style formats:
- APA: (Author, Year) inline; Author, A. A. (Year). Title. Journal, Vol(Issue), Pages. for references
- Harvard: (Author Year) inline; Author, A.A. Year, Title, Journal, vol. X, no. Y, pp. Z. for references
- MLA: (Author Page) inline; Author. "Title." Journal, vol. X, no. Y, Year, pp. Z. for references
- Chicago: [1] footnote inline; Author. Title. Journal Vol, no. Issue (Year): Pages. for references
- Oxford: footnote inline; Author, Title (Place: Publisher, Year), Pages. for references`;

const CONVERT_FALLBACK: CitationLLMFallback = {
  system: CONVERT_SYSTEM,
  user: "Convert from [SOURCE_STYLE] to [TARGET_STYLE]:\n[CITATION]",
  model: "anthropic/claude-sonnet-4",
  fallbacks: ["google/gemini-2.5-pro", "openai/gpt-4o"],
  temperature: 0.2,
  maxTokens: 512,
};

async function handleConvertAll(body: { documentId: string; targetStyle: string }, userId: string) {
  const { documentId, targetStyle } = body;

  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId))).limit(1);
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  const docCitations = await db.select().from(citations).where(eq(citations.documentId, documentId));
  if (docCitations.length === 0) {
    return NextResponse.json({ success: true, data: { converted: 0, citations: [] } });
  }

  const convertCfg = await loadCitationConfig("citation-convert", CONVERT_FALLBACK);

  const docSections = await db.select().from(sections).where(eq(sections.documentId, documentId)).orderBy(sections.index);

  let converted = 0;
  const updatedCitations: typeof docCitations = [];

  for (const citation of docCitations) {
    // Quote rows are quoted prose, not citation strings — nothing to convert.
    if (citation.style === targetStyle || citation.entryType === "quote") {
      updatedCitations.push(citation);
      continue;
    }

    try {
      const result = await callOpenRouter(
        [
          { role: "system", content: convertCfg.contextText + convertCfg.system },
          {
            role: "user",
            content: fillTemplate(convertCfg.userTemplate, {
              SOURCE_STYLE: citation.style.toUpperCase(),
              TARGET_STYLE: targetStyle.toUpperCase(),
              CITATION: citation.rawText,
            }),
          },
        ],
        convertCfg.model,
        convertCfg.fallbacks,
        convertCfg.temperature,
        convertCfg.maxTokens,
      );

      const convertedText = result.content.trim();

      await db.insert(llmCallLog).values({
        activityType: "citation_convert",
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs ?? 0,
        outcome: "pending",
      });

      // Replace in sections
      for (const section of docSections) {
        if (section.currentText.includes(citation.rawText)) {
          const newText = section.currentText.replaceAll(citation.rawText, convertedText);
          if (newText !== section.currentText) {
            await db.update(sections).set({ currentText: newText }).where(eq(sections.id, section.id));
            section.currentText = newText; // Update local copy for subsequent replacements
          }
        }
      }

      // Update citation record
      const [updated] = await db.update(citations).set({
        correctedText: convertedText,
        style: targetStyle as typeof citation.style,
        status: "resolved",
        userAction: "edited",
      }).where(eq(citations.id, citation.id)).returning();

      updatedCitations.push(updated);
      converted++;

      console.log(`[citations/convert] ${citation.rawText.slice(0, 40)}... → ${convertedText.slice(0, 40)}...`);

      // Small delay
      if (converted < docCitations.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      console.error(`[citations/convert] Failed for: ${citation.rawText.slice(0, 40)}...`, err);
      updatedCitations.push(citation);
    }
  }

  const score = await computeAndUpdateScore(documentId);

  return NextResponse.json({
    success: true,
    data: { converted, total: docCitations.length, score, citations: updatedCitations },
  });
}
