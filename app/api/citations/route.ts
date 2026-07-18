import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { citations, documents, sections, llmCallLog, libraryEntries } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { callOpenRouter, loadBind } from "@/lib/routing/openrouter";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { buildCitationGraph, insertReferenceEntry, removeReferenceEntry, type GraphFlag } from "@/lib/citations/graph";
import { findSourceForInlineCitation } from "@/lib/citations/find-source";
import {
  loadCitationArtifacts,
  checkCitationArtifacts,
  cleanCitationArtifacts,
} from "@/lib/citations/artifacts";
import { verifyEntry } from "@/lib/citations/verify";
import { verifyQuoteAgainstSource, findSourceForQuote } from "@/lib/citations/quotes";

// Verification runs one small batch per request (client-driven loop, same
// pattern as background suggestion generation) — fits the Vercel Hobby 60s cap.
export const maxDuration = 60;

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

    if (action === "verify_all" || action === "verify_batch") {
      return handleVerifyBatch(body, user.id);
    }

    if (action === "verify_quotes") {
      return handleVerifyQuotes(body, user.id);
    }

    if (action === "find_source") {
      return handleFindSource(body, user.id);
    }

    if (action === "add_reference") {
      return handleAddReference(body, user.id);
    }

    if (action === "remove_reference") {
      return handleRemoveReference(body, user.id);
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

  // Analyze the document as it currently stands: editing-flow rewrites live in
  // sections.currentText and never touch documents.rawText. Locked sections
  // are included — they hold the reference list itself.
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(asc(sections.index));
  const currentDocText = docSections.length > 0
    ? docSections.map((s) => s.currentText).join("\n\n")
    : doc.rawText;

  // Build the document-wide citation graph: reference entries, in-text
  // citations, quotes — linked, with reconciliation findings attached.
  const graph = buildCitationGraph(currentDocText);
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

  // Re-checks must not destroy work: web-verification verdicts and the user's
  // accept/edit/verify/dismiss decisions are carried over to the fresh rows by
  // matching on text. A citation the user corrected now appears in the
  // document as its correctedText, so old rows are keyed on both.
  const previousRows = await db
    .select()
    .from(citations)
    .where(eq(citations.documentId, documentId));
  const normText = (t: string) => t.replace(/\s+/g, " ").trim();
  // Quote verdicts also judge whether the writer's sentence fairly represents
  // the source, so a quote's key includes its context sentence — editing the
  // claim around an unchanged quote invalidates the stale context verdict.
  const keyFor = (entryType: string, text: string, context?: string | null) =>
    `${entryType}::${normText(text)}${entryType === "quote" ? `::${normText(context ?? "")}` : ""}`;
  const previousByText = new Map<string, (typeof previousRows)[number]>();
  for (const row of previousRows) {
    previousByText.set(keyFor(row.entryType, row.rawText, row.contextSentence), row);
    if (row.correctedText) {
      previousByText.set(keyFor(row.entryType, row.correctedText, row.contextSentence), row);
    }
  }
  const previousFor = (entryType: string, text: string, context?: string | null) =>
    previousByText.get(keyFor(entryType, text, context));

  // Clear previous citations, then insert reference entries first so inline
  // and quote rows can point at their entry's row id.
  await db.delete(citations).where(eq(citations.documentId, documentId));

  const insertedEntries = graph.entries.length
    ? await db
        .insert(citations)
        .values(
          entryRecords.map((r) => {
            const prev = previousFor("reference_entry", r.entry.text);
            return {
              documentId,
              rawText: r.entry.text,
              style: detectedStyle,
              entryType: "reference_entry",
              structuralFlags: r.structuralFlags,
              verificationFlags: prev?.verificationFlags ?? null,
              correctedText: prev?.userAction ? prev.correctedText : r.correctedText,
              status: prev && prev.status !== "open"
                ? prev.status
                : r.structuralFlags.length > 0 ? ("open" as const) : ("resolved" as const),
              userAction: prev?.userAction ?? null,
            };
          })
        )
        .returning()
    : [];

  // In-text citations are stored only when they carry findings — healthy ones
  // exist transiently in the graph and would only add noise. Quotes are ALL
  // stored (linked to their entry via the in-text citation) so that quote
  // verification has a queue to work through; the UI hides healthy unverified
  // quote rows.
  const flaggedInline = graph.inline.filter((c) => c.flags.length > 0);

  const insertedFindings = flaggedInline.length + graph.quotes.length > 0
    ? await db
        .insert(citations)
        .values([
          ...flaggedInline.map((c) => {
            const prev = previousFor("inline", c.text);
            return {
              documentId,
              rawText: c.text,
              style: detectedStyle,
              entryType: "inline",
              linkedCitationId:
                c.matchedEntryIndex !== null ? insertedEntries[c.matchedEntryIndex]?.id ?? null : null,
              contextSentence: c.contextSentence,
              structuralFlags: c.flags,
              verificationFlags: prev?.verificationFlags ?? null,
              status: prev && prev.status !== "open" ? prev.status : ("open" as const),
              userAction: prev?.userAction ?? null,
              correctedText: prev?.userAction ? prev.correctedText : null,
            };
          }),
          ...graph.quotes.map((q) => {
            const viaInText =
              q.linkedInTextIndex !== null ? graph.inline[q.linkedInTextIndex] : null;
            const entryRowId =
              viaInText && viaInText.matchedEntryIndex !== null
                ? insertedEntries[viaInText.matchedEntryIndex]?.id ?? null
                : null;
            const prev = previousFor("quote", q.text, q.contextSentence);
            return {
              documentId,
              rawText: q.text,
              style: detectedStyle,
              entryType: "quote",
              linkedCitationId: entryRowId,
              contextSentence: q.contextSentence,
              structuralFlags: q.flags,
              verificationFlags: prev?.verificationFlags ?? null,
              status: prev && prev.status !== "open" ? prev.status : ("open" as const),
              userAction: prev?.userAction ?? null,
              correctedText: prev?.userAction ? prev.correctedText : null,
            };
          }),
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

  // When accepting or editing a fix, apply the text change FIRST — previously
  // the citation was marked resolved before checking the text still contained
  // it, so a fix could be silently dropped while the row claimed "resolved".
  if (correctedText && fullCitation && (userAction === "accepted" || userAction === "edited")) {
    const docSections = await db.select().from(sections).where(eq(sections.documentId, fullCitation.documentId));
    let replacedAnywhere = false;
    for (const section of docSections) {
      if (section.currentText.includes(fullCitation.rawText)) {
        const newText = section.currentText.replaceAll(fullCitation.rawText, correctedText);
        if (newText !== section.currentText) {
          // Optimistic guard — never clobber a concurrent write to this section.
          const written = await db
            .update(sections)
            .set({ currentText: newText })
            .where(and(eq(sections.id, section.id), eq(sections.currentText, section.currentText)))
            .returning({ id: sections.id });
          if (written.length > 0) replacedAnywhere = true;
        }
      }
    }
    if (!replacedAnywhere) {
      return NextResponse.json(
        { success: false, error: "This citation no longer appears in the document text — it may have been changed by an earlier edit. Nothing was modified.", code: "stale_citation" },
        { status: 409 },
      );
    }
  }

  const [updated] = await db
    .update(citations)
    .set({
      status: userAction === "dismissed" ? "dismissed" : "resolved",
      userAction,
      correctedText: correctedText || null,
    })
    .where(eq(citations.id, citationId))
    .returning();

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
// Search queries are built deterministically from the parsed entry fields
// (lib/citations/verify.ts) — no LLM query-generation step. The assess prompt
// below is the LAST-RESORT fallback; the live prompt is the citation-verify
// activity bind ("Citation Verify — Assess (field diff)").

const VERIFY_ASSESS_SYSTEM = `You verify whether an academic or media citation is real by comparing it against web search results, checking each field independently.

Verdicts:
- "verified" — a matching publication exists: author, year, and title are all consistent with the search results
- "wrong_details" — the publication clearly exists but one or more cited fields are wrong (wrong year, wrong author or author order, wrong title wording, wrong journal/publisher/outlet). This includes cases where the TITLE exists but is attributed to the wrong author, or the AUTHOR exists but with a different title — check title and author INDEPENDENTLY.
- "fabricated" — no plausible matching publication can be found; the citation appears invented
- "uncertain" — search results are insufficient to decide either way

Also sanity-check internal plausibility using your general knowledge: impossible dates (e.g. an article naming a suspect before they were publicly identified, coverage of a sentencing dated before the sentencing occurred), publishers that don't publish in that field, and similar contradictions.

Respond in EXACTLY this format (one line each):
VERDICT: [verified/wrong_details/fabricated/uncertain]
CONFIDENCE: [0.0 to 1.0]
FIELD_AUTHOR: [ok/wrong/unknown] | [correct value or n/a]
FIELD_YEAR: [ok/wrong/unknown] | [correct value or n/a]
FIELD_TITLE: [ok/wrong/unknown] | [correct value or n/a]
FIELD_SOURCE: [ok/wrong/unknown] | [correct journal/publisher/outlet or n/a]
PLAUSIBILITY: [one-sentence note on internal impossibilities, or "none"]
EXPLANATION: [2-4 sentences: what you found, what matches, what doesn't]
CORRECT_CITATION: [fully corrected citation in the same style if fixable, otherwise "n/a"]
SOURCE_URL: [URL of the best matching source if found, otherwise "none"]`;

const VERIFY_ASSESS_FALLBACK: CitationLLMFallback = {
  system: VERIFY_ASSESS_SYSTEM,
  user: 'CITATION:\n"[CITATION]"\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  model: "anthropic/claude-sonnet-4",
  fallbacks: ["google/gemini-2.5-pro", "openai/gpt-4o"],
  temperature: 0.2,
  maxTokens: 1024,
};

// How many entries one request may verify, and the wall-clock guard after
// which no NEW entry is started (each entry ≈ 2-3 searches + 1 LLM call).
const VERIFY_BATCH_LIMIT = 4;
const VERIFY_TIME_BUDGET_MS = 35_000;

/**
 * Verifies a batch of reference entries. The client loops this action until
 * `remaining` hits 0, showing progress. `reset: true` on the first call
 * clears previous verdicts so Verify All re-checks everything.
 */
async function handleVerifyBatch(
  body: { documentId: string; reset?: boolean; limit?: number },
  userId: string
) {
  const { documentId, reset } = body;
  const limit = Math.min(Math.max(body.limit ?? VERIFY_BATCH_LIMIT, 1), 6);

  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId))).limit(1);
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  if (reset) {
    await db
      .update(citations)
      .set({ verificationFlags: null })
      .where(and(eq(citations.documentId, documentId), eq(citations.entryType, "reference_entry")));
  }

  // Only reference-list entries are verifiable against the web — inline and
  // quote rows are document-consistency findings, not lookups.
  const allEntries = await db
    .select()
    .from(citations)
    .where(and(eq(citations.documentId, documentId), eq(citations.entryType, "reference_entry")));

  const pending = allEntries.filter((c) => c.verificationFlags == null);
  const total = allEntries.length;

  if (pending.length === 0) {
    const score = await computeAndUpdateScore(documentId);
    return NextResponse.json({
      success: true,
      data: { processed: 0, remaining: 0, total, score },
    });
  }

  const assessCfg = await loadCitationConfig("citation-verify", VERIFY_ASSESS_FALLBACK);
  const started = Date.now();
  let processed = 0;

  for (const citation of pending.slice(0, limit)) {
    if (processed > 0 && Date.now() - started > VERIFY_TIME_BUDGET_MS) break;

    console.log(`[citations/verify] "${citation.rawText.slice(0, 50)}..."`);
    try {
      const result = { ...(await verifyEntry(citation.rawText, assessCfg)), verifiedAt: new Date().toISOString() };

      await db.update(citations).set({ verificationFlags: result }).where(eq(citations.id, citation.id));

      if (result.modelUsed) {
        await db.insert(llmCallLog).values({
          activityType: "citation_verify",
          modelUsed: result.modelUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          outcome: "pending",
        });
      }

      console.log(`[citations/verify] verdict=${result.verdict}`);
    } catch (err) {
      console.error(`[citations/verify] Error:`, err);
      await db.update(citations).set({
        verificationFlags: {
          verdict: "uncertain",
          confidence: 0,
          explanation: "Verification failed: " + (err instanceof Error ? err.message : "unknown error"),
          correctCitation: null,
          sourceUrl: null,
          fields: null,
          plausibilityNote: null,
          verifiedAt: new Date().toISOString(),
        },
      }).where(eq(citations.id, citation.id));
    }
    processed++;
  }

  const remaining = pending.length - processed;
  // Only recompute the score once the whole document is verified — partial
  // scores mid-loop would make the header number bounce around.
  const score = remaining === 0 ? await computeAndUpdateScore(documentId) : null;

  return NextResponse.json({
    success: true,
    data: { processed, remaining, total, score },
  });
}

// ── Inline-citation source discovery ────────────────────────────────────────
// For "no matching reference entry" findings: search the web for the cited
// author + year + attributed idea, and draft the reference-list entry when a
// real publication matches. Prompt/model live in the `citation-find-source`
// activity bind; this is the last-resort fallback.

const FIND_SOURCE_FALLBACK: CitationLLMFallback = {
  system: `You determine whether an in-text citation refers to a real publication, using web search results — and when it does, you write its full reference-list entry.

You receive: the in-text citation (author and year as cited), the writer's sentence around it (the idea attributed to the source), the document's citation style, and web search results.

Rules:
- FOUND is "yes" only when a publication plausibly matches BOTH the cited author AND the idea attributed in the writer's sentence.
- If the publication clearly exists but under a different year than cited, still answer "yes" — format the entry with the REAL year and note the discrepancy in the explanation.
- REFERENCE_ENTRY must be complete and formatted in the document's citation style: authors, year, title, journal/publisher/outlet, and DOI or URL when available.
- Never invent details the search results don't support — omit an uncertain field rather than guessing.

Respond in EXACTLY this format (one line each):
FOUND: [yes/no/uncertain]
CONFIDENCE: [0.0 to 1.0]
REFERENCE_ENTRY: [the full reference-list entry in the document's style, or "n/a"]
SOURCE_URL: [URL of the best matching source, or "none"]
EXPLANATION: [2-3 sentences: what was found and how it matches the citation and the writer's claim]`,
  user: 'IN-TEXT CITATION:\n[CITATION]\n\nWRITER\'S SENTENCE:\n[CLAIM]\n\nDOCUMENT CITATION STYLE: [STYLE]\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  model: "anthropic/claude-sonnet-4",
  fallbacks: ["google/gemini-2.5-pro", "openai/gpt-4o"],
  temperature: 0.2,
  maxTokens: 1024,
};

/** Loads a citation row and confirms the requesting user owns its document. */
async function loadOwnedCitation(citationId: string, userId: string) {
  const [citation] = await db.select().from(citations).where(eq(citations.id, citationId)).limit(1);
  if (!citation) return null;
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, citation.documentId), eq(documents.userId, userId)))
    .limit(1);
  return doc ? citation : null;
}

/**
 * Searches the web for the source behind a flagged in-text citation and
 * stores the outcome (found + drafted entry / not found / uncertain) on the
 * citation row, where re-checks preserve it.
 */
async function handleFindSource(body: { citationId: string }, userId: string) {
  const citation = await loadOwnedCitation(body.citationId, userId);
  if (!citation) {
    return NextResponse.json({ success: false, error: "Citation not found" }, { status: 404 });
  }
  if (citation.entryType !== "inline") {
    return NextResponse.json({ success: false, error: "Only in-text citations can be searched" }, { status: 400 });
  }

  const cfg = await loadCitationConfig("citation-find-source", FIND_SOURCE_FALLBACK);
  const result = {
    ...(await findSourceForInlineCitation(
      citation.rawText,
      citation.contextSentence ?? "",
      citation.style,
      cfg,
    )),
    verifiedAt: new Date().toISOString(),
  };

  await db.update(citations).set({ verificationFlags: result }).where(eq(citations.id, citation.id));

  if (result.modelUsed) {
    await db.insert(llmCallLog).values({
      activityType: "citation_find_source",
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      outcome: "pending",
    });
  }

  return NextResponse.json({ success: true, data: result });
}

/**
 * Adds a drafted reference entry to the document's reference list and
 * resolves the finding. Distinct from `resolve` on purpose: resolve's
 * correctedText path REPLACES the citation's rawText in the body — here the
 * in-text citation stays and a new entry is INSERTED into the reference list.
 */
async function handleAddReference(
  body: { citationId: string; entryText: string },
  userId: string
) {
  const entry = (body.entryText ?? "").trim().replace(/\s+/g, " ");
  if (!entry || entry.length > 1000) {
    return NextResponse.json({ success: false, error: "Invalid reference entry" }, { status: 400 });
  }

  const citation = await loadOwnedCitation(body.citationId, userId);
  if (!citation) {
    return NextResponse.json({ success: false, error: "Citation not found" }, { status: 404 });
  }

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, citation.documentId))
    .orderBy(asc(sections.index));
  if (docSections.length === 0) {
    return NextResponse.json({ success: false, error: "Document has no sections" }, { status: 400 });
  }

  // Target: the section holding the reference list — the one whose text
  // contains the References header, else the last locked section (locked runs
  // are the reference list), else start a References block in the last section.
  const hasRefHeader = (t: string) =>
    /(?:^|\n)[^\S\n]*(?:References|Bibliography|Works Cited|Reference List)/i.test(t);
  const target =
    docSections.find((s) => hasRefHeader(s.currentText)) ??
    [...docSections].reverse().find((s) => s.isLocked);

  let sectionId: string;
  let newText: string;
  if (target) {
    sectionId = target.id;
    newText = hasRefHeader(target.currentText)
      ? insertReferenceEntry(target.currentText, entry)
      : target.currentText.trimEnd() + "\n" + entry;
  } else {
    const last = docSections[docSections.length - 1];
    sectionId = last.id;
    newText = last.currentText.trimEnd() + "\n\nReferences\n\n" + entry;
  }

  const asRead = target ? target.currentText : docSections[docSections.length - 1].currentText;
  const written = await db
    .update(sections)
    .set({ currentText: newText })
    .where(and(eq(sections.id, sectionId), eq(sections.currentText, asRead)))
    .returning({ id: sections.id });
  if (written.length === 0) {
    return NextResponse.json(
      { success: false, error: "The document changed while saving — nothing was modified. Please retry.", code: "stale_section" },
      { status: 409 },
    );
  }

  await db
    .update(citations)
    .set({ status: "resolved", userAction: "accepted", correctedText: entry })
    .where(eq(citations.id, citation.id));

  const score = await computeAndUpdateScore(citation.documentId);

  return NextResponse.json({ success: true, data: { entry }, score });
}

/**
 * Deletes a never-cited reference entry from the document's reference list.
 * The inverse of add_reference: removes the entry text (plus hard-wrapped
 * continuation lines) from the section holding it and resolves the row.
 */
async function handleRemoveReference(body: { citationId: string }, userId: string) {
  const citation = await loadOwnedCitation(body.citationId, userId);
  if (!citation) {
    return NextResponse.json({ success: false, error: "Citation not found" }, { status: 404 });
  }
  if (citation.entryType !== "reference_entry") {
    return NextResponse.json({ success: false, error: "Only reference entries can be removed" }, { status: 400 });
  }

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, citation.documentId));
  const target = docSections.find((s) => s.currentText.includes(citation.rawText));
  if (!target) {
    return NextResponse.json(
      { success: false, error: "Could not locate this entry in the current document text." },
      { status: 400 }
    );
  }

  const newText = removeReferenceEntry(target.currentText, citation.rawText);
  if (newText == null) {
    return NextResponse.json(
      { success: false, error: "Could not locate this entry in the current document text." },
      { status: 400 }
    );
  }

  const written = await db
    .update(sections)
    .set({ currentText: newText })
    .where(and(eq(sections.id, target.id), eq(sections.currentText, target.currentText)))
    .returning({ id: sections.id });
  if (written.length === 0) {
    return NextResponse.json(
      { success: false, error: "The document changed while saving — nothing was modified. Please retry.", code: "stale_section" },
      { status: 409 },
    );
  }
  await db
    .update(citations)
    .set({ status: "resolved", userAction: "edited", correctedText: null })
    .where(eq(citations.id, citation.id));

  const score = await computeAndUpdateScore(citation.documentId);
  return NextResponse.json({ success: true, score });
}

// ── Quote verification ──────────────────────────────────────────────────────

const QUOTE_CHECK_FALLBACK: CitationLLMFallback = {
  system: `You check whether a quotation is genuine and fairly used, given the source text.

You receive: the quotation as used in the document, the writer's sentence around it (their claim), and an excerpt of the source.

Assess two things INDEPENDENTLY:
1. QUOTE_MATCH — is the quotation actually in the source? [verbatim/near/paraphrase/not_found]
2. CONTEXT — does the writer's claim fairly represent what the source argues? [faithful/misrepresented/unclear]

Be strict about CONTEXT: a quote can be word-for-word accurate and still be used to support a claim the source does not make.

Respond in EXACTLY this format (one line each):
QUOTE_MATCH: [verbatim/near/paraphrase/not_found]
CONTEXT: [faithful/misrepresented/unclear]
CONFIDENCE: [0.0 to 1.0]
ACTUAL_ARGUMENT: [one sentence: what the source actually says on this point, or "n/a"]
SUGGESTED_REWRITE: [if misrepresented: a faithful replacement sentence, or "n/a"]
EXPLANATION: [2-3 sentences]`,
  user: 'DOCUMENT QUOTE:\n"[QUOTE]"\n\nWRITER\'S SENTENCE:\n[CLAIM]\n\nSOURCE EXCERPT:\n[EXCERPT]',
  model: "anthropic/claude-sonnet-4",
  fallbacks: ["google/gemini-2.5-pro", "openai/gpt-4o"],
  temperature: 0.2,
  maxTokens: 1024,
};

const QUOTE_BATCH_LIMIT = 3;

/**
 * Verifies a batch of quotes against their sources. Client-driven loop like
 * verify_batch. Source resolution per quote:
 *   1. linked reference entry's verified sourceUrl (from existence verification)
 *   2. web search for the quote text itself (also handles orphan quotes —
 *      finding a candidate source is itself the finding)
 */
async function handleVerifyQuotes(
  body: { documentId: string; reset?: boolean; limit?: number },
  userId: string
) {
  const { documentId, reset } = body;
  const limit = Math.min(Math.max(body.limit ?? QUOTE_BATCH_LIMIT, 1), 5);

  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId))).limit(1);
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

  if (reset) {
    await db
      .update(citations)
      .set({ verificationFlags: null })
      .where(and(eq(citations.documentId, documentId), eq(citations.entryType, "quote")));
  }

  const allQuotes = await db
    .select()
    .from(citations)
    .where(and(eq(citations.documentId, documentId), eq(citations.entryType, "quote")));

  const pending = allQuotes.filter((c) => c.verificationFlags == null);
  const total = allQuotes.length;

  if (pending.length === 0) {
    const score = await computeAndUpdateScore(documentId);
    return NextResponse.json({ success: true, data: { processed: 0, remaining: 0, total, score } });
  }

  const cfg = await loadCitationConfig("citation-quote-check", QUOTE_CHECK_FALLBACK);
  const started = Date.now();
  let processed = 0;

  for (const quote of pending.slice(0, limit)) {
    if (processed > 0 && Date.now() - started > VERIFY_TIME_BUDGET_MS) break;

    console.log(`[citations/quotes] "${quote.rawText.slice(0, 50)}..."`);
    try {
      // Resolve a source URL: linked entry's verified source first.
      let sourceUrl: string | null = null;
      if (quote.linkedCitationId) {
        const [entry] = await db.select().from(citations).where(eq(citations.id, quote.linkedCitationId)).limit(1);
        const entryVerify = entry?.verificationFlags as { sourceUrl?: string | null } | null;
        sourceUrl = entryVerify?.sourceUrl ?? null;
      }

      const result = {
        ...(sourceUrl
          ? await verifyQuoteAgainstSource(quote.rawText, quote.contextSentence ?? "", sourceUrl, cfg)
          : await findSourceForQuote(quote.rawText, quote.contextSentence ?? undefined)),
        verifiedAt: new Date().toISOString(),
      };

      await db.update(citations).set({ verificationFlags: result }).where(eq(citations.id, quote.id));

      if (result.modelUsed) {
        await db.insert(llmCallLog).values({
          activityType: "citation_quote_check",
          modelUsed: result.modelUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          outcome: "pending",
        });
      }

      console.log(`[citations/quotes] verdict=${result.verdict}`);
    } catch (err) {
      console.error(`[citations/quotes] Error:`, err);
      await db.update(citations).set({
        verificationFlags: {
          verdict: "uncertain",
          quoteMatch: "unknown",
          contextVerdict: null,
          confidence: 0,
          explanation: "Quote check failed: " + (err instanceof Error ? err.message : "unknown error"),
          actualArgument: null,
          suggestedRewrite: null,
          sourceUrl: null,
          matchedExcerpt: null,
          verifiedAt: new Date().toISOString(),
        },
      }).where(eq(citations.id, quote.id));
    }
    processed++;
  }

  const remaining = pending.length - processed;
  const score = remaining === 0 ? await computeAndUpdateScore(documentId) : null;

  return NextResponse.json({
    success: true,
    data: { processed, remaining, total, score },
  });
}

// ── Score computation ─────────────────────────────────────────────────────

async function computeAndUpdateScore(documentId: string): Promise<number> {
  const allRows = await db.select().from(citations).where(eq(citations.documentId, documentId));

  // Score over rows that carry signal: reference entries always count;
  // inline/quote rows count once they have flags or a verification verdict.
  // Healthy, not-yet-verified quotes are stored (they're the quote-check
  // queue) but must not pad the denominator.
  const docCitations = allRows.filter(
    (c) =>
      c.entryType === "reference_entry" ||
      ((c.structuralFlags as unknown[] | null)?.length ?? 0) > 0 ||
      c.verificationFlags != null,
  );
  if (docCitations.length === 0) return 100;

  const withIssues = docCitations.filter((c) => {
    // Structural issues
    const structFlags = (c.structuralFlags as StructuralFlag[] | null) || [];
    const hasStructIssue = structFlags.length > 0 && c.status === "open";
    // Verification issues ("unverified" is the legacy name for "fabricated")
    const verifyData = c.verificationFlags as { verdict?: string } | null;
    const hasVerifyIssue =
      verifyData?.verdict === "fabricated" ||
      verifyData?.verdict === "unverified" ||
      verifyData?.verdict === "wrong_details" ||
      verifyData?.verdict === "quote_not_found" ||
      verifyData?.verdict === "quote_misrepresented";
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

      // Replace in sections (optimistic guard: skip a section a concurrent
      // writer touched rather than clobbering it; local copy is only updated
      // when the write actually landed)
      for (const section of docSections) {
        if (section.currentText.includes(citation.rawText)) {
          const newText = section.currentText.replaceAll(citation.rawText, convertedText);
          if (newText !== section.currentText) {
            const written = await db
              .update(sections)
              .set({ currentText: newText })
              .where(and(eq(sections.id, section.id), eq(sections.currentText, section.currentText)))
              .returning({ id: sections.id });
            if (written.length > 0) {
              section.currentText = newText; // Update local copy for subsequent replacements
            }
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
