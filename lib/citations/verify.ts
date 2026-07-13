/**
 * Citation existence verification — phase 2 of the citations system.
 *
 * For each reference entry: build 2–3 targeted search queries from the parsed
 * fields (exact title / author+year+keywords / author+outlet), merge the
 * results, and have the assess model return a FIELD-LEVEL diff — author, year,
 * title, and source each checked independently. This is what distinguishes
 * "fabricated" from "real book, wrong author/year" (the Boyle/Humphries case):
 * a single mushed query can't tell those apart, independent field checks can.
 *
 * The assess prompt and model are admin-managed via the `citation-verify`
 * activity bind; the caller passes the resolved config in.
 */

import { parseRefEntry } from "./graph";
import { webSearch, type SearchResult } from "@/lib/search/tavily";
import { callOpenRouter } from "@/lib/routing/openrouter";

export interface FieldCheck {
  status: "ok" | "wrong" | "unknown";
  correct: string | null;
}

export interface VerificationResult {
  verdict: "verified" | "wrong_details" | "fabricated" | "uncertain";
  confidence: number;
  explanation: string;
  correctCitation: string | null;
  sourceUrl: string | null;
  fields: {
    author: FieldCheck;
    year: FieldCheck;
    title: FieldCheck;
    source: FieldCheck;
  } | null;
  plausibilityNote: string | null;
  /** Telemetry for the UI/logs — which searches ran. */
  queriesUsed: string[];
  modelUsed: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * Builds up to three complementary search queries for a reference entry.
 * Each query attacks a different failure mode:
 *  1. exact-title search — finds the real author/year when the title exists
 *     under a different attribution
 *  2. author + year + title keywords — the straightforward existence check
 *  3. author + source/outlet — finds the author's real work when the title
 *     is invented
 */
export function buildQueriesForEntry(text: string): string[] {
  const parsed = parseRefEntry(text);
  const queries: string[] = [];

  const title = parsed.title?.replace(/["'’‘“”]/g, "").trim() ?? null;
  const author = parsed.firstAuthor?.trim() ?? null;
  const year = parsed.year;

  if (title && title.length >= 15) {
    queries.push(`"${title.slice(0, 90)}"`);
  }
  if (author && title) {
    const keywords = title.split(/\s+/).slice(0, 6).join(" ");
    queries.push([author, year, keywords].filter(Boolean).join(" "));
  }
  if (author && queries.length < 2) {
    // Weak parse — fall back to author + the entry's own leading text.
    queries.push(`${author} ${year ?? ""} ${text.slice(0, 70).replace(/["'’‘“”]/g, "")}`.trim());
  }
  if (queries.length === 0) {
    queries.push(text.slice(0, 90));
  }

  // Dedupe while preserving order.
  return [...new Set(queries)].slice(0, 3);
}

/** Runs all queries and merges results: dedupe by URL, best score wins. */
export async function searchForEntry(
  queries: string[],
  perQueryResults = 4,
): Promise<{ results: SearchResult[]; searchFailed: boolean }> {
  const settled = await Promise.allSettled(queries.map((q) => webSearch(q, perQueryResults)));

  const byUrl = new Map<string, SearchResult>();
  let anySucceeded = false;
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    anySucceeded = true;
    for (const r of s.value) {
      const existing = byUrl.get(r.url);
      if (!existing || r.score > existing.score) byUrl.set(r.url, r);
    }
  }

  const results = [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  return { results, searchFailed: !anySucceeded };
}

function parseField(content: string, name: string): FieldCheck {
  const m = content.match(new RegExp(`FIELD_${name}:\\s*(ok|wrong|unknown)\\s*(?:\\|\\s*(.+))?`, "i"));
  if (!m) return { status: "unknown", correct: null };
  const correct = m[2]?.trim();
  return {
    status: m[1].toLowerCase() as FieldCheck["status"],
    correct: correct && correct.toLowerCase() !== "n/a" ? correct : null,
  };
}

/** Parses the assess model's line-format response. Tolerates missing FIELD_ lines. */
export function parseAssessResponse(content: string): Omit<VerificationResult, "queriesUsed" | "modelUsed" | "inputTokens" | "outputTokens" | "latencyMs"> {
  const verdictMatch = content.match(/VERDICT:\s*(verified|wrong_details|fabricated|unverified|uncertain)/i);
  const confMatch = content.match(/CONFIDENCE:\s*([\d.]+)/i);
  const explMatch = content.match(/EXPLANATION:\s*([\s\S]*?)(?=\nCORRECT_CITATION:|\nSOURCE_URL:|$)/i);
  const correctMatch = content.match(/CORRECT_CITATION:\s*([\s\S]*?)(?=\nSOURCE_URL:|$)/i);
  const urlMatch = content.match(/SOURCE_URL:\s*(.+)/i);
  const plausMatch = content.match(/PLAUSIBILITY:\s*(.+)/i);

  let verdict = (verdictMatch?.[1]?.toLowerCase() ?? "uncertain") as VerificationResult["verdict"] | "unverified";
  if (verdict === "unverified") verdict = "fabricated"; // legacy prompt wording

  const hasFields = /FIELD_(AUTHOR|YEAR|TITLE|SOURCE):/i.test(content);
  const fields = hasFields
    ? {
        author: parseField(content, "AUTHOR"),
        year: parseField(content, "YEAR"),
        title: parseField(content, "TITLE"),
        source: parseField(content, "SOURCE"),
      }
    : null;

  const correctCitation = correctMatch?.[1]?.trim();
  const sourceUrl = urlMatch?.[1]?.trim();
  const plausibility = plausMatch?.[1]?.trim();

  return {
    verdict,
    confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
    explanation: explMatch?.[1]?.trim() ?? content.trim().slice(0, 500),
    correctCitation: correctCitation && correctCitation.toLowerCase() !== "n/a" ? correctCitation : null,
    sourceUrl: sourceUrl && sourceUrl.toLowerCase() !== "none" ? sourceUrl : null,
    fields,
    plausibilityNote: plausibility && plausibility.toLowerCase() !== "none" ? plausibility : null,
  };
}

export interface AssessConfig {
  system: string;
  userTemplate: string;
  contextText: string;
  model: string;
  fallbacks: string[];
  temperature: number;
  maxTokens: number;
}

function fillTemplate(template: string, tokens: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(`[${key}]`).join(value);
  }
  return result;
}

/** Verifies one reference entry end-to-end: queries → search → assess. */
export async function verifyEntry(
  rawText: string,
  cfg: AssessConfig,
): Promise<VerificationResult> {
  const queries = buildQueriesForEntry(rawText);
  const { results, searchFailed } = await searchForEntry(queries);

  if (searchFailed) {
    return {
      verdict: "uncertain",
      confidence: 0,
      explanation: "Web search was unavailable — verification could not run. Try again later.",
      correctCitation: null,
      sourceUrl: null,
      fields: null,
      plausibilityNote: null,
      queriesUsed: queries,
      modelUsed: null,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }

  if (results.length === 0) {
    return {
      verdict: "fabricated",
      confidence: 0.6,
      explanation: `No matching publication found across ${queries.length} independent searches (exact title, author + year, author + keywords). The citation may be invented.`,
      correctCitation: null,
      sourceUrl: null,
      fields: null,
      plausibilityNote: null,
      queriesUsed: queries,
      modelUsed: null,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }

  const searchContext = results
    .map((r, idx) => `[${idx + 1}] URL: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.content}`)
    .join("\n\n");

  const assess = await callOpenRouter(
    [
      { role: "system", content: cfg.contextText + cfg.system },
      {
        role: "user",
        content: fillTemplate(cfg.userTemplate, {
          CITATION: rawText,
          SEARCH_RESULTS: searchContext,
        }),
      },
    ],
    cfg.model,
    cfg.fallbacks,
    cfg.temperature,
    cfg.maxTokens,
  );

  const parsed = parseAssessResponse(assess.content);
  return {
    ...parsed,
    queriesUsed: queries,
    modelUsed: assess.modelUsed,
    inputTokens: assess.inputTokens,
    outputTokens: assess.outputTokens,
    latencyMs: assess.latencyMs,
  };
}
