/**
 * Source discovery for in-text citations with no reference entry.
 *
 * A `no_reference_entry` finding means the writer cited "(Tuchman, 1978)" but
 * the reference list has no matching entry. This module searches the web for
 * the cited author + year + the idea attributed in the surrounding sentence,
 * and — when a real publication matches — drafts the full reference-list
 * entry in the document's citation style so the user can add it in one click.
 *
 * "Not found" here is a genuine signal: the citation may be invented. The
 * result is stored on the citation row so the card can say "we searched and
 * couldn't find this" instead of leaving the user guessing.
 */

import { searchForEntry } from "./verify";
import { callOpenRouter } from "@/lib/routing/openrouter";

export interface InlineSourceResult {
  verdict: "source_found" | "source_not_found" | "uncertain";
  confidence: number;
  explanation: string;
  /** The drafted reference-list entry, formatted in the document's style. */
  correctCitation: string | null;
  sourceUrl: string | null;
  queriesUsed: string[];
  modelUsed: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface FindSourceConfig {
  system: string;
  userTemplate: string;
  contextText: string;
  model: string;
  fallbacks: string[];
  temperature: number;
  maxTokens: number;
}

const CONTEXT_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "When", "After", "Before", "However",
  "Although", "But", "And", "She", "He", "They", "His", "Her", "Their", "One", "It",
]);

/** Author name(s) and year pulled out of an in-text citation string. */
export function parseInlineCitation(text: string): { author: string; year: string | null } {
  const yearMatch = text.match(/\b((?:1[5-9]|20)\d{2})[a-z]?\b/);
  const author = text
    .replace(/[()]/g, " ")
    .replace(/\b(?:1[5-9]|20)\d{2}[a-z]?\b/g, " ")
    .replace(/\bet\s+al\.?/gi, " ")
    .replace(/['’]s\b/g, "") // possessive: "Tuchman's" → "Tuchman"
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { author, year: yearMatch?.[1] ?? null };
}

/**
 * Distinctive words from the writer's sentence — proper nouns first (they
 * disambiguate best), longest content words as fallback. The cited author's
 * own name is excluded; it is already in every query.
 */
export function contextKeywords(contextSentence: string, author: string): string {
  const authorLower = author.toLowerCase();
  const properNouns = [
    ...new Set([...contextSentence.matchAll(/\b[A-Z][a-z]{2,}\b/g)].map((m) => m[0])),
  ].filter((w) => !CONTEXT_STOPWORDS.has(w) && !authorLower.includes(w.toLowerCase()));
  const contentWords = [
    ...new Set(
      contextSentence
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 5 && !authorLower.includes(t)),
    ),
  ].sort((a, b) => b.length - a.length);
  return [...properNouns.slice(0, 3), ...contentWords.slice(0, 3)].slice(0, 4).join(" ");
}

function fillTemplate(template: string, tokens: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(`[${key}]`).join(value);
  }
  return result;
}

export function parseFindSourceResponse(content: string): Pick<
  InlineSourceResult,
  "verdict" | "confidence" | "explanation" | "correctCitation" | "sourceUrl"
> {
  const foundM = content.match(/FOUND:\s*(yes|no|uncertain)/i);
  const confM = content.match(/CONFIDENCE:\s*([\d.]+)/i);
  const entryM = content.match(/REFERENCE_ENTRY:\s*([\s\S]*?)(?=\nSOURCE_URL:|\nEXPLANATION:|$)/i);
  const urlM = content.match(/SOURCE_URL:\s*(.+)/i);
  const explM = content.match(/EXPLANATION:\s*([\s\S]*?)$/i);

  const found = foundM?.[1]?.toLowerCase();
  const verdict =
    found === "yes" ? "source_found" : found === "no" ? "source_not_found" : "uncertain";

  const entry = entryM?.[1]?.trim();
  const url = urlM?.[1]?.trim();

  return {
    verdict,
    confidence: confM ? parseFloat(confM[1]) : 0.5,
    explanation: explM?.[1]?.trim() ?? content.trim().slice(0, 400),
    correctCitation:
      verdict === "source_found" && entry && entry.toLowerCase() !== "n/a" ? entry : null,
    sourceUrl: url && url.toLowerCase() !== "none" ? url : null,
  };
}

const emptyTelemetry = { modelUsed: null, inputTokens: 0, outputTokens: 0, latencyMs: 0 };

/**
 * Searches for the publication behind an in-text citation and, if found,
 * drafts its reference-list entry: queries → search → assess.
 */
export async function findSourceForInlineCitation(
  citationText: string,
  contextSentence: string,
  style: string,
  cfg: FindSourceConfig,
): Promise<InlineSourceResult> {
  const { author, year } = parseInlineCitation(citationText);
  const keywords = contextKeywords(contextSentence, author);

  // Two complementary queries: with the cited year (the straight lookup) and
  // without it (finds the real publication when the cited year is wrong).
  const queries = [...new Set([
    [author, year, keywords].filter(Boolean).join(" ").trim(),
    keywords ? [author, keywords].filter(Boolean).join(" ").trim() : "",
  ].filter((q) => q.length > 0))];

  const { results, searchFailed } = await searchForEntry(queries);

  if (searchFailed) {
    return {
      verdict: "uncertain",
      confidence: 0,
      explanation: "Web search was unavailable — the source could not be looked up. Try again later.",
      correctCitation: null,
      sourceUrl: null,
      queriesUsed: queries,
      ...emptyTelemetry,
    };
  }

  if (results.length === 0) {
    return {
      verdict: "source_not_found",
      confidence: 0.6,
      explanation: `No publication matching ${citationText} was found across ${queries.length} independent searches. The citation may be invented.`,
      correctCitation: null,
      sourceUrl: null,
      queriesUsed: queries,
      ...emptyTelemetry,
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
          CITATION: citationText,
          CLAIM: contextSentence || "(no surrounding sentence captured)",
          STYLE: style.toUpperCase(),
          SEARCH_RESULTS: searchContext,
        }),
      },
    ],
    cfg.model,
    cfg.fallbacks,
    cfg.temperature,
    cfg.maxTokens,
  );

  const parsed = parseFindSourceResponse(assess.content);
  return {
    ...parsed,
    queriesUsed: queries,
    modelUsed: assess.modelUsed,
    inputTokens: assess.inputTokens,
    outputTokens: assess.outputTokens,
    latencyMs: assess.latencyMs,
  };
}
