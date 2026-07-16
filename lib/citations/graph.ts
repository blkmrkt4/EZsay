/**
 * Citation graph — the document-wide model of citation objects.
 *
 * Extracts three object types (reference entries, in-text citations, quotes),
 * links them together, and runs deterministic reconciliation checks that need
 * the whole document to be visible:
 *   - in-text citation with no matching reference entry
 *   - reference entry never cited in the body
 *   - year mismatch between body and reference list
 *   - in-text author naming inconsistent with the entry's authors
 *   - possible duplicate reference entries
 *   - quotes with no citation nearby (orphan quotes)
 *
 * Everything here is pure string analysis — no DB, no network — so it can run
 * at scan time for free and be unit-tested directly.
 */

export interface GraphFlag {
  type: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix: string | null;
}

export interface ParsedRefEntry {
  text: string;
  /** First author surname, or the organisation name for corporate authors. */
  firstAuthor: string | null;
  /** All person-author surnames found in the entry. */
  surnames: string[];
  isOrg: boolean;
  year: string | null;
  title: string | null;
  flags: GraphFlag[];
  /** How many in-text citations resolved to this entry. */
  citedCount: number;
}

export interface InTextCitation {
  text: string;
  /** Cited surnames (or the org name as a single element). */
  names: string[];
  year: string | null;
  start: number;
  end: number;
  form: "parenthetical" | "narrative";
  contextSentence: string;
  flags: GraphFlag[];
  /** Index into graph.entries when a match was found. */
  matchedEntryIndex: number | null;
}

export interface QuoteSpan {
  text: string;
  start: number;
  end: number;
  contextSentence: string;
  /** The in-text citation attached to this quote, if any. */
  linkedInTextIndex: number | null;
  flags: GraphFlag[];
}

export interface CitationGraph {
  entries: ParsedRefEntry[];
  inline: InTextCitation[];
  quotes: QuoteSpan[];
  /** Where the reference section starts in the raw text (rawText.length if none). */
  referenceSectionStart: number;
}

// ── Reference section splitting ─────────────────────────────────────────────

const REF_HEADER_RE =
  /(?:^|\n)[^\S\n]*(?:References|Bibliography|Works Cited|Reference List)(?:\s*[–—-]\s*[^\n]{0,60})?[^\S\n]*(?::|(?=\n)|$)/i;

/** Splits raw text into body and reference-section text. */
export function splitBodyAndReferences(rawText: string): {
  body: string;
  refText: string;
  refStart: number;
} {
  const match = rawText.match(REF_HEADER_RE);
  if (!match || match.index === undefined) {
    return { body: rawText, refText: "", refStart: rawText.length };
  }
  const refStart = match.index;
  return {
    body: rawText.slice(0, refStart),
    refText: rawText.slice(refStart + match[0].length),
    refStart,
  };
}

/**
 * Whether a line plausibly is a bibliography entry rather than ordinary prose:
 * needs a publication year and an author-shaped token (person or organisation).
 */
export function looksLikeReferenceEntry(line: string): boolean {
  if (!/\b(?:1[5-9]\d{2}|20\d{2})\b/.test(line)) return false;
  return (
    /\b[A-Z][a-zA-ZÀ-ÿ'’-]+,\s*[A-Z]/.test(line) ||
    /\bet\s+al\b/i.test(line) ||
    // Corporate author: "BBC News (2021)", "Ministry of Justice (2022)"
    /^[A-Z][^(\n]{1,60}\(\d{4}[a-z]?\)/.test(line.trim())
  );
}

/** Splits a reference section into individual entries. */
export function splitReferenceEntries(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 10 && looksLikeReferenceEntry(l));

  if (lines.length >= 2) return lines;

  // Run-together text (PDF extraction) — split on author-name boundaries.
  const entryBoundary =
    /\s+(?=[A-Z][a-zA-ZÀ-ÿ'’-]+,\s*[A-Z][a-zA-Z]*[.\s]\s*(?:\d{4}|[A-Z“"']))/g;
  const parts = text
    .split(entryBoundary)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && looksLikeReferenceEntry(s));

  if (parts.length > 1) return parts;

  return text.trim().length > 10 && looksLikeReferenceEntry(text) ? [text.trim()] : [];
}

// ── Entry parsing ────────────────────────────────────────────────────────────

const PERSON_AUTHOR_RE = /([A-Z][A-Za-zÀ-ÿ'’-]+(?:-[A-Z][A-Za-zÀ-ÿ'’]+)?),\s*(?:[A-Z]\.?\s*)+/g;

export function parseRefEntry(text: string): ParsedRefEntry {
  const yearMatch =
    text.match(/\((\d{4})[a-z]?\)/) ?? text.match(/\b((?:1[5-9]|20)\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  // Person authors appear before the year: "Walklate, S. and Fitz-Gibbon, K. (2019)"
  const preYear = yearMatch && yearMatch.index !== undefined ? text.slice(0, yearMatch.index) : text;
  const surnames: string[] = [];
  let m: RegExpExecArray | null;
  const personRe = new RegExp(PERSON_AUTHOR_RE.source, "g");
  while ((m = personRe.exec(preYear)) !== null) surnames.push(m[1]);

  let firstAuthor: string | null = surnames[0] ?? null;
  let isOrg = false;
  if (!firstAuthor) {
    // Corporate author: text before "(year)" — "BBC News (2021)", "The Guardian (2018)"
    const orgMatch = text.match(/^([A-Z][^(\n]{1,60}?)\s*\(\d{4}[a-z]?\)/);
    if (orgMatch) {
      firstAuthor = orgMatch[1].trim().replace(/[.,]$/, "");
      isOrg = true;
    }
  }

  // Title: first quoted segment, else the segment after "(year)" up to a period.
  const quotedTitle = text.match(/['‘“"]([^'’”"]{5,200})['’”"]/);
  let title: string | null = quotedTitle ? quotedTitle[1] : null;
  if (!title && yearMatch) {
    const afterYear = text.slice((yearMatch.index ?? 0) + yearMatch[0].length);
    const seg = afterYear.match(/^\.?\s*([^.]{5,150})/);
    title = seg ? seg[1].trim() : null;
  }

  return { text, firstAuthor, surnames, isOrg, year, title, flags: [], citedCount: 0 };
}

// ── In-text citation extraction ─────────────────────────────────────────────

/** Words that start a sentence but are not part of a narrative citation name. */
const NARRATIVE_STOPWORDS = new Set([
  "In", "As", "By", "See", "From", "According", "When", "While", "Although",
  "However", "Since", "After", "Before", "Like", "Unlike", "Following", "Per",
]);

function sentenceBounds(text: string, index: number): { start: number; end: number } {
  // Walk back to previous sentence end or paragraph break.
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "\n" && text[i - 1] === "\n") { start = i + 1; break; }
    if ((ch === "." || ch === "!" || ch === "?") && /[\s"'’”)]/.test(text[i + 1] ?? " ")) {
      // Don't break on initials like "K." or "p."
      const prev = text.slice(Math.max(0, i - 3), i);
      if (!/\b[A-Z]$/.test(prev) && !/\bpp?$/.test(prev)) { start = i + 1; break; }
    }
  }
  // Walk forward to next sentence end.
  let end = text.length;
  for (let i = index; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n" && text[i + 1] === "\n") { end = i; break; }
    if ((ch === "." || ch === "!" || ch === "?") && /[\s"'’”)]|$/.test(text[i + 1] ?? "")) {
      const prev = text.slice(Math.max(0, i - 3), i);
      if (!/\b[A-Z]$/.test(prev) && !/\bpp?$/.test(prev)) { end = i + 1; break; }
    }
  }
  return { start: Math.max(0, start), end };
}

export function sentenceAt(text: string, index: number): string {
  const { start, end } = sentenceBounds(text, index);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** Strips ", p. 12" / ", pp. 3-5" page suffixes from a citation fragment. */
function stripPages(s: string): string {
  return s.replace(/,?\s*pp?\.\s*[\d–—-]+(?:\s*[–—-]\s*\d+)?/gi, "").trim();
}

export function extractInTextCitations(body: string): InTextCitation[] {
  const results: InTextCitation[] = [];
  const seen = new Set<string>(); // dedupe by span

  // Parenthetical: any paren group containing a year — may hold several
  // citations separated by semicolons: "(Smith, 2019; Jones and Lee, 2020)"
  const parenRe = /\(([^()]*\b(?:1[5-9]|20)\d{2}[a-z]?[^()]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRe.exec(body)) !== null) {
    const inner = m[1];
    const parts = inner.split(";");
    for (const rawPart of parts) {
      const part = stripPages(rawPart.trim());
      const yearMatch = part.match(/\b((?:1[5-9]|20)\d{2})[a-z]?\b/);
      if (!yearMatch) continue;
      const namePart = part
        .slice(0, yearMatch.index)
        .replace(/,\s*$/, "")
        .replace(/\bet\s+al\.?/gi, "")
        .trim();
      if (!namePart || !/[A-Z]/.test(namePart)) continue; // bare "(2019)" — narrative form covers it
      const names = namePart
        .split(/\s+(?:and|&)\s+|,\s*/)
        .map((n) => n.trim())
        .filter((n) => n.length > 1 && /^[A-Z]/.test(n));
      if (names.length === 0) continue;
      const key = `${m.index}:${rawPart}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        text: `(${part})`,
        names: namePart.match(/^[A-Z][^,]*(?:\s[a-z]+\s[A-Z][^,]*)*$/) && names.length > 1 && !/\s(?:and|&)\s/.test(namePart)
          ? [namePart] // e.g. "Ministry of Justice" split by comma incorrectly — keep whole
          : names,
        year: yearMatch[1],
        start: m.index,
        end: m.index + m[0].length,
        form: "parenthetical",
        contextSentence: sentenceAt(body, m.index),
        flags: [],
        matchedEntryIndex: null,
      });
    }
  }

  // Narrative: "Boyle (2019)", "Fitz-Gibbon and Walklate (2019)", "The Mirror (2006)"
  const narrativeRe =
    /\b((?:[A-Z][A-Za-zÀ-ÿ'’-]*\s+){0,3}[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+et\s+al\.?)?)\s*\(((?:1[5-9]|20)\d{2})[a-z]?\)/g;
  while ((m = narrativeRe.exec(body)) !== null) {
    let name = m[1].replace(/\bet\s+al\.?/gi, "").trim();
    // Strip leading sentence words that aren't part of the name.
    const tokens = name.split(/\s+/);
    while (tokens.length > 1 && NARRATIVE_STOPWORDS.has(tokens[0])) tokens.shift();
    name = tokens.join(" ");
    if (!name || !/^[A-Z]/.test(name)) continue;
    const names = name.split(/\s+(?:and|&)\s+/).map((n) => n.trim()).filter(Boolean);
    results.push({
      text: `${name} (${m[2]})`,
      names,
      year: m[2],
      start: m.index,
      end: m.index + m[0].length,
      form: "narrative",
      contextSentence: sentenceAt(body, m.index),
      flags: [],
      matchedEntryIndex: null,
    });
  }

  return results.sort((a, b) => a.start - b.start);
}

// ── Quote extraction ─────────────────────────────────────────────────────────

const MIN_QUOTE_WORDS = 5;

export function extractQuotes(body: string): QuoteSpan[] {
  const quotes: QuoteSpan[] = [];
  // Double quotes (straight or curly). Single/curly-single handled separately
  // with a higher word threshold since they collide with apostrophes.
  const patterns: { re: RegExp; minWords: number }[] = [
    { re: /["“]([^"“”]{10,600}?)["”]/g, minWords: MIN_QUOTE_WORDS },
    { re: /(?<![A-Za-z])‘([^‘’]{10,600}?)’/g, minWords: MIN_QUOTE_WORDS + 1 },
  ];
  for (const { re, minWords } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const inner = m[1].trim();
      const wordCount = inner.split(/\s+/).length;
      if (wordCount < minWords) continue;
      quotes.push({
        text: inner,
        start: m.index,
        end: m.index + m[0].length,
        contextSentence: sentenceAt(body, m.index),
        linkedInTextIndex: null,
        flags: [],
      });
    }
  }
  return quotes.sort((a, b) => a.start - b.start);
}

// ── Matching and reconciliation ──────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/^the\s+/, "")
    .trim();
}

function titleTokens(title: string | null): Set<string> {
  if (!title) return new Set();
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Does this in-text name refer to this entry (ignoring year)? */
function nameMatchesEntry(name: string, entry: ParsedRefEntry): "first" | "other" | null {
  const n = normalizeName(name);
  if (!n) return null;
  if (entry.firstAuthor && normalizeName(entry.firstAuthor) === n) return "first";
  // Org names match loosely: "Mirror" vs "The Mirror", "BBC" vs "BBC News"
  if (entry.isOrg && entry.firstAuthor) {
    const e = normalizeName(entry.firstAuthor);
    if (e.startsWith(n) || n.startsWith(e)) return "first";
  }
  if (entry.surnames.some((s) => normalizeName(s) === n)) return "other";
  return null;
}

/**
 * Builds the full citation graph with reconciliation flags attached.
 */
export function buildCitationGraph(rawText: string): CitationGraph {
  const { body, refText, refStart } = splitBodyAndReferences(rawText);
  const entries = splitReferenceEntries(refText).map(parseRefEntry);
  const inline = extractInTextCitations(body);
  const quotes = extractQuotes(body);

  // Link in-text citations to entries.
  for (const cite of inline) {
    const primaryName = cite.names[0];
    if (!primaryName) continue;

    let matched: { index: number; kind: "first" | "other"; yearOk: boolean } | null = null;
    for (let i = 0; i < entries.length; i++) {
      const kind = nameMatchesEntry(primaryName, entries[i]);
      if (!kind) continue;
      const yearOk = !!cite.year && cite.year === entries[i].year;
      // Prefer exact year matches, then first-author matches.
      if (
        !matched ||
        (yearOk && !matched.yearOk) ||
        (yearOk === matched.yearOk && kind === "first" && matched.kind !== "first")
      ) {
        matched = { index: i, kind, yearOk };
      }
    }

    if (!matched) {
      cite.flags.push({
        type: "no_reference_entry",
        message: `In-text citation ${cite.text} has no matching entry in the reference list.`,
        severity: "error",
        suggestedFix: null,
      });
      continue;
    }

    cite.matchedEntryIndex = matched.index;
    const entry = entries[matched.index];
    entry.citedCount++;

    if (!matched.yearOk && cite.year && entry.year) {
      const flag: GraphFlag = {
        type: "year_mismatch",
        message: `Body cites ${cite.text} but the reference list has ${entry.firstAuthor ?? "this source"} (${entry.year}). One of the two years is wrong.`,
        severity: "error",
        suggestedFix: null,
      };
      cite.flags.push(flag);
      if (!entry.flags.some((f) => f.type === "year_mismatch")) entry.flags.push(flag);
    }

    if (matched.kind === "other") {
      // Concrete fix: swap the cited surname for the entry's first author,
      // keeping the citation's own form ("(Fitz-Gibbon, 2019)" → "(Walklate, 2019)").
      const fixed = entry.firstAuthor ? cite.text.replace(primaryName, entry.firstAuthor) : null;
      cite.flags.push({
        type: "author_inconsistent",
        message: `In-text citation ${cite.text} names an author who is not listed first in the reference entry ("${entry.text.slice(0, 60)}…"). Cite the first author or fix the entry's author order.`,
        severity: "warning",
        suggestedFix: fixed && fixed !== cite.text ? fixed : null,
      });
    }
  }

  // Entries never cited in the body.
  for (const entry of entries) {
    if (entry.citedCount === 0 && entries.length > 0 && inline.length > 0) {
      entry.flags.push({
        type: "never_cited",
        message: "This reference entry is never cited in the body text.",
        severity: "warning",
        suggestedFix: null,
      });
    }
  }

  // Possible duplicate entries: same first author + year, or very similar titles.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const sameAuthorYear =
        a.firstAuthor && b.firstAuthor && a.year && b.year &&
        normalizeName(a.firstAuthor) === normalizeName(b.firstAuthor) && a.year === b.year;
      const similarTitles = jaccard(titleTokens(a.title), titleTokens(b.title)) >= 0.6;
      if (sameAuthorYear || similarTitles) {
        const flag: GraphFlag = {
          type: "possible_duplicate",
          message: `Possible duplicate: this entry and "${(j === i + 1 ? b : a).text.slice(0, 70)}…" may reference the same source.`,
          severity: "warning",
          suggestedFix: null,
        };
        if (!a.flags.some((f) => f.type === "possible_duplicate")) a.flags.push(flag);
        if (!b.flags.some((f) => f.type === "possible_duplicate")) b.flags.push(flag);
      }
    }
  }

  // Link quotes to the nearest in-text citation in or just after their sentence.
  for (const quote of quotes) {
    const { start: sStart, end: sEnd } = sentenceBounds(body, quote.start);
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < inline.length; i++) {
      const c = inline[i];
      // The citation must sit inside the quote's own sentence — never in a
      // following sentence or paragraph, which would silently "cover" an
      // uncited quote with someone else's citation.
      const within = c.start >= sStart && c.start < sEnd;
      if (!within) continue;
      const dist = Math.abs(c.start - quote.end);
      if (dist < bestDist) { best = i; bestDist = dist; }
    }
    quote.linkedInTextIndex = best;
    if (best === null && entries.length > 0) {
      quote.flags.push({
        type: "quote_without_citation",
        message: "Quoted material has no citation in or near its sentence — a marker cannot tell where this quote comes from.",
        severity: "error",
        suggestedFix: null,
      });
    }
  }

  return { entries, inline, quotes, referenceSectionStart: refStart };
}
