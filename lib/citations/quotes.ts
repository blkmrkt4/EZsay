/**
 * Quote verification — phase 4 of the citations system.
 *
 * For a quote linked to a source: fetch the source page, locate the quote
 * (verbatim → near → paraphrase → not found), and ask the assess model
 * whether the writer's surrounding claim fairly represents what the source
 * argues — the "your essay says X, the article argues Y" check.
 *
 * For orphan quotes (no citation): search the quote text itself and propose
 * a candidate source.
 *
 * A failed page fetch is always "uncertain", never "fake" — paywalls and
 * bot-blocks must not read as fabrication.
 */

import { webSearch, fetchPageText } from "@/lib/search/tavily";
import { callOpenRouter } from "@/lib/routing/openrouter";

export interface QuoteCheckResult {
  verdict:
    | "quote_verified"
    | "quote_near_match"
    | "quote_not_found"
    | "quote_misrepresented"
    | "quote_source_found"
    | "uncertain";
  quoteMatch: "verbatim" | "near" | "paraphrase" | "not_found" | "unknown";
  contextVerdict: "faithful" | "misrepresented" | "unclear" | null;
  confidence: number;
  explanation: string;
  actualArgument: string | null;
  suggestedRewrite: string | null;
  sourceUrl: string | null;
  matchedExcerpt: string | null;
  modelUsed: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface QuoteAssessConfig {
  system: string;
  userTemplate: string;
  contextText: string;
  model: string;
  fallbacks: string[];
  temperature: number;
  maxTokens: number;
}

// ── Local matching ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

/**
 * Finds the page window that best contains the quote and scores it by
 * token containment (fraction of quote tokens present in the window).
 */
export function findBestExcerpt(
  pageText: string,
  quote: string,
): { excerpt: string; containment: number; verbatim: boolean } {
  const normPage = normalize(pageText);
  const normQuote = normalize(quote);

  if (normQuote.length > 0 && normPage.includes(normQuote)) {
    const at = normPage.indexOf(normQuote);
    // Map roughly back to the original text by proportional position.
    const ratio = at / Math.max(1, normPage.length);
    const approx = Math.floor(ratio * pageText.length);
    const start = Math.max(0, approx - 400);
    const end = Math.min(pageText.length, approx + normQuote.length + 400);
    return { excerpt: pageText.slice(start, end), containment: 1, verbatim: true };
  }

  const quoteTokens = new Set(tokens(quote));
  if (quoteTokens.size === 0) return { excerpt: pageText.slice(0, 1200), containment: 0, verbatim: false };

  // Slide a window of ~3x the quote length across the page in half-steps.
  const windowSize = Math.max(300, quote.length * 3);
  const step = Math.floor(windowSize / 2);
  let best = { start: 0, containment: 0 };

  for (let start = 0; start < pageText.length; start += step) {
    const window = pageText.slice(start, start + windowSize);
    const windowTokens = new Set(tokens(window));
    let hit = 0;
    for (const t of quoteTokens) if (windowTokens.has(t)) hit++;
    const containment = hit / quoteTokens.size;
    if (containment > best.containment) best = { start, containment };
    if (containment === 1) break;
  }

  const start = Math.max(0, best.start - 200);
  return {
    excerpt: pageText.slice(start, best.start + windowSize + 200),
    containment: best.containment,
    verbatim: false,
  };
}

// ── Assessment ───────────────────────────────────────────────────────────────

function fillTemplate(template: string, tokenMap: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(tokenMap)) {
    result = result.split(`[${key}]`).join(value);
  }
  return result;
}

export function parseQuoteAssessResponse(content: string): Pick<
  QuoteCheckResult,
  "quoteMatch" | "contextVerdict" | "confidence" | "explanation" | "actualArgument" | "suggestedRewrite"
> {
  const matchM = content.match(/QUOTE_MATCH:\s*(verbatim|near|paraphrase|not_found)/i);
  const ctxM = content.match(/CONTEXT:\s*(faithful|misrepresented|unclear)/i);
  const confM = content.match(/CONFIDENCE:\s*([\d.]+)/i);
  const actualM = content.match(/ACTUAL_ARGUMENT:\s*(.+)/i);
  const rewriteM = content.match(/SUGGESTED_REWRITE:\s*([\s\S]*?)(?=\nEXPLANATION:|$)/i);
  const explM = content.match(/EXPLANATION:\s*([\s\S]*?)$/i);

  const clean = (s: string | undefined) => {
    const t = s?.trim();
    return t && t.toLowerCase() !== "n/a" ? t : null;
  };

  return {
    quoteMatch: (matchM?.[1]?.toLowerCase() as QuoteCheckResult["quoteMatch"]) ?? "unknown",
    contextVerdict: (ctxM?.[1]?.toLowerCase() as QuoteCheckResult["contextVerdict"]) ?? null,
    confidence: confM ? parseFloat(confM[1]) : 0.5,
    explanation: explM?.[1]?.trim() ?? content.trim().slice(0, 400),
    actualArgument: clean(actualM?.[1]),
    suggestedRewrite: clean(rewriteM?.[1]),
  };
}

function finalVerdict(
  quoteMatch: QuoteCheckResult["quoteMatch"],
  contextVerdict: QuoteCheckResult["contextVerdict"],
): QuoteCheckResult["verdict"] {
  if (contextVerdict === "misrepresented") return "quote_misrepresented";
  if (quoteMatch === "not_found") return "quote_not_found";
  if (quoteMatch === "verbatim" && contextVerdict === "faithful") return "quote_verified";
  if (quoteMatch === "verbatim" || quoteMatch === "near" || quoteMatch === "paraphrase") {
    return contextVerdict === "faithful" ? "quote_near_match" : "uncertain";
  }
  return "uncertain";
}

const emptyTelemetry = { modelUsed: null, inputTokens: 0, outputTokens: 0, latencyMs: 0 };

/**
 * Verifies one quote against a known source URL.
 */
export async function verifyQuoteAgainstSource(
  quote: string,
  claimSentence: string,
  sourceUrl: string,
  cfg: QuoteAssessConfig,
): Promise<QuoteCheckResult> {
  const pageText = await fetchPageText(sourceUrl);

  if (!pageText) {
    return {
      verdict: "uncertain",
      quoteMatch: "unknown",
      contextVerdict: null,
      confidence: 0,
      explanation:
        "The source page could not be fetched (paywall, blocked, or offline) — the quote could not be checked either way.",
      actualArgument: null,
      suggestedRewrite: null,
      sourceUrl,
      matchedExcerpt: null,
      ...emptyTelemetry,
    };
  }

  const { excerpt, containment, verbatim } = findBestExcerpt(pageText, quote);

  // Nothing remotely like the quote on the page — no LLM needed.
  if (!verbatim && containment < 0.35) {
    return {
      verdict: "quote_not_found",
      quoteMatch: "not_found",
      contextVerdict: null,
      confidence: 0.7,
      explanation:
        "The quoted wording does not appear in the source page — the closest passage shares almost none of its words. The quote may come from a different source or be invented.",
      actualArgument: null,
      suggestedRewrite: null,
      sourceUrl,
      matchedExcerpt: excerpt.slice(0, 300),
      ...emptyTelemetry,
    };
  }

  const assess = await callOpenRouter(
    [
      { role: "system", content: cfg.contextText + cfg.system },
      {
        role: "user",
        content: fillTemplate(cfg.userTemplate, {
          QUOTE: quote,
          CLAIM: claimSentence || "(no surrounding sentence captured)",
          EXCERPT: excerpt,
        }),
      },
    ],
    cfg.model,
    cfg.fallbacks,
    cfg.temperature,
    cfg.maxTokens,
  );

  const parsed = parseQuoteAssessResponse(assess.content);
  return {
    ...parsed,
    verdict: finalVerdict(parsed.quoteMatch, parsed.contextVerdict),
    sourceUrl,
    matchedExcerpt: excerpt.slice(0, 500),
    modelUsed: assess.modelUsed,
    inputTokens: assess.inputTokens,
    outputTokens: assess.outputTokens,
    latencyMs: assess.latencyMs,
  };
}

/** Domains that are never a citable origin for a quotation. */
const NON_CITABLE_HOSTS =
  /(facebook|twitter|x|reddit|pinterest|instagram|tiktok|youtube|quora|tumblr)\.com|goodreads\.com\/quotes/i;

/**
 * Orphan quote: search the quote text itself and propose a candidate source.
 * The surrounding sentence's distinctive words are added to the query —
 * short quotes are often generic phrases that match song lyrics and memes
 * without that context.
 */
const CONTEXT_TERM_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "When", "After", "Before", "However",
  "Although", "But", "And", "She", "He", "They", "His", "Her", "Their", "One", "It",
]);

export async function findSourceForQuote(quote: string, contextSentence?: string): Promise<QuoteCheckResult> {
  // Proper nouns from the surrounding sentence are the best disambiguators
  // (names, places, institutions); fall back to the longest content words.
  let contextTerms = "";
  if (contextSentence) {
    const properNouns = [
      ...new Set([...contextSentence.matchAll(/\b[A-Z][a-z]{2,}\b/g)].map((m) => m[0])),
    ].filter((w) => !CONTEXT_TERM_STOPWORDS.has(w) && !normalize(quote).includes(w.toLowerCase()));
    const fallback = [...new Set(tokens(contextSentence).filter((t) => !tokens(quote).includes(t)))]
      .sort((a, b) => b.length - a.length);
    contextTerms = (properNouns.length > 0 ? properNouns : fallback).slice(0, 3).join(" ");
  }
  const query = `"${quote.slice(0, 80)}" ${contextTerms}`.trim();

  let results: Awaited<ReturnType<typeof webSearch>> = [];
  try {
    results = await webSearch(query, 6);
  } catch {
    results = [];
  }

  const best = results.filter((r) => r.score >= 0.3 && !NON_CITABLE_HOSTS.test(r.url))[0];
  if (!best) {
    return {
      verdict: "quote_not_found",
      quoteMatch: "not_found",
      contextVerdict: null,
      confidence: 0.5,
      explanation:
        "No source containing this quotation was found — it needs a citation the writer can actually produce, or it should be removed or rephrased as the writer's own words.",
      actualArgument: null,
      suggestedRewrite: null,
      sourceUrl: null,
      matchedExcerpt: null,
      ...emptyTelemetry,
    };
  }

  return {
    verdict: "quote_source_found",
    quoteMatch: "unknown",
    contextVerdict: null,
    confidence: Math.min(0.9, best.score),
    explanation: `A likely source for this quotation was found: "${best.title}". Add a citation to it (after confirming it is the real origin).`,
    actualArgument: null,
    suggestedRewrite: null,
    sourceUrl: best.url,
    matchedExcerpt: best.content?.slice(0, 300) ?? null,
    ...emptyTelemetry,
  };
}
