/**
 * Quoted-passage detection — the code backstop for the quote exemption rule:
 * variant-conformance findings must never fire inside quotation marks, because
 * verbatim quotes keep their source's spelling (a US quote in a British paper
 * stays American). Prompts carry the same instruction; this catches drift.
 *
 * Covers straight double quotes "…", curly doubles “…”, and curly single
 * pairs ‘…’. Straight single quotes are deliberately skipped — they are
 * indistinguishable from apostrophes.
 */

export interface QuoteRange {
  start: number; // index of the opening quote character
  end: number;   // index just past the closing quote character
}

// An unbalanced quote must not swallow the rest of the document — spans
// longer than this are treated as not-a-quote.
const MAX_QUOTE_SPAN = 600;

export function findQuotedRanges(text: string): QuoteRange[] {
  if (!text) return [];
  const ranges: QuoteRange[] = [];

  // Curly quotes have distinct open/close characters — pair them directly.
  collectPaired(text, "“", "”", ranges); // “ ”
  collectPaired(text, "‘", "’", ranges); // ‘ ’ (apostrophes are mid-word ’, never openers)

  // Straight double quotes toggle open/close.
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (open === -1) {
      open = i;
    } else {
      if (i - open <= MAX_QUOTE_SPAN) {
        ranges.push({ start: open, end: i + 1 });
      }
      open = -1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function collectPaired(text: string, openCh: string, closeCh: string, out: QuoteRange[]): void {
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === openCh) {
      open = i;
    } else if (ch === closeCh && open !== -1) {
      // Skip apostrophe-like closers between word characters when the span
      // would be implausible; a real closing quote after an opener is fine.
      if (i - open <= MAX_QUOTE_SPAN) {
        out.push({ start: open, end: i + 1 });
      }
      open = -1;
    }
  }
}

/** True when [start, end) overlaps any quoted range. */
export function isInsideQuote(ranges: QuoteRange[], start: number, end: number): boolean {
  for (const r of ranges) {
    if (start < r.end && end > r.start) return true;
    if (r.start > end) break; // ranges are sorted
  }
  return false;
}
