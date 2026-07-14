/**
 * Citation detection and locking.
 *
 * Runs before any other processing. Identifies citation content
 * so it's never flagged, modified, or scored in the editing flow.
 */

export interface CitationSpan {
  start: number;
  end: number;
  text: string;
  type: "inline" | "reference_section" | "footnote";
}

export interface ParsedDocument {
  sections: { text: string; isLocked: boolean }[];
  citations: CitationSpan[];
}

import { looksLikeReferenceEntry } from "./graph";

// Reference section headers — case insensitive
const REFERENCE_HEADERS = [
  "references",
  "bibliography",
  "works cited",
  "notes",
  "footnotes",
  "endnotes",
  "sources",
  "reference list",
];

// A header line may carry a suffix: "References – Part A", "References: Essay 1".
// Real documents (multi-part portfolios) also have MULTIPLE reference sections
// with body text in between, so header matching must be per-line, not
// "first header → end of document".
const REF_HEADER_LINE = new RegExp(
  `^(?:${REFERENCE_HEADERS.join("|")})(?:\\s*[–—:\\-].{0,60})?$`,
  "i",
);

/** Whether a line is a reference-section heading (with optional suffix). */
export function isReferenceHeader(line: string): boolean {
  return REF_HEADER_LINE.test(line.trim());
}

/**
 * Walks paragraphs with a small state machine and returns which are citation
 * content: a reference header starts a locked run; paragraphs that look like
 * bibliography entries stay locked; the first paragraph that doesn't ends the
 * run (handles "References – Part A" followed by the Part B essay).
 */
export function classifyReferenceParagraphs(paragraphs: string[]): boolean[] {
  const locked: boolean[] = [];
  let inRefs = false;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (isReferenceHeader(trimmed)) {
      inRefs = true;
      locked.push(true);
      continue;
    }
    if (inRefs && looksLikeReferenceEntry(trimmed)) {
      locked.push(true);
      continue;
    }
    if (inRefs) inRefs = false;
    locked.push(false);
  }
  return locked;
}

/**
 * Identifies inline citations in text.
 * Matches: (Author, Year), (Author Year), [1], [1-3], [1,2,3], footnote markers
 */
function findInlineCitations(text: string): CitationSpan[] {
  const spans: CitationSpan[] = [];

  // APA / Harvard style: (Author, Year) or (Author Year) or (Author et al., Year)
  const apaRegex = /\([A-Z][a-zA-Z'-]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-zA-Z'-]+))?,?\s*\d{4}[a-z]?(?:,\s*p{1,2}\.\s*\d+(?:-\d+)?)?\)/g;
  let match;
  while ((match = apaRegex.exec(text)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      type: "inline",
    });
  }

  // Numbered citations: [1], [1-3], [1,2,3], [1, 2]
  const numRegex = /\[\d+(?:\s*[-,]\s*\d+)*\]/g;
  while ((match = numRegex.exec(text)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      type: "inline",
    });
  }

  // Superscript-style footnote markers (digit immediately after word, no space)
  // This is approximate — catches patterns like "word1" or "sentence.2"
  const footnoteRegex = /(?<=[.!?'"])\d{1,3}(?=\s|$|[.,;])/g;
  while ((match = footnoteRegex.exec(text)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      type: "footnote",
    });
  }

  return spans;
}

/**
 * Finds reference sections by header and returns the range from header to end.
 */
function findReferenceSections(text: string): CitationSpan[] {
  const spans: CitationSpan[] = [];
  const lines = text.split("\n");
  let refStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isReferenceHeader(lines[i])) {
      // Found a reference section header — everything from here to end is citation content
      refStart = text.indexOf(lines[i]);
      break;
    }
  }

  if (refStart !== -1) {
    spans.push({
      start: refStart,
      end: text.length,
      text: text.slice(refStart),
      type: "reference_section",
    });
  }

  return spans;
}

/**
 * Splits text into sections by paragraph, respecting headings.
 * Locks citation sections — per paragraph, via the reference state machine,
 * so multi-part documents ("References – Part A" mid-document, more essay,
 * then "References – Part B") lock exactly the citation content and nothing
 * else. Constraint #1: locked content is never flagged or modified.
 */
export function parseAndSplit(rawText: string): ParsedDocument {
  const inlineCitations = findInlineCitations(rawText);
  const refSections = findReferenceSections(rawText);
  const allCitations = [...inlineCitations, ...refSections];

  // Split the whole document by paragraph breaks, then normalize each.
  const rawParagraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const normalized = rawParagraphs.map((para) =>
    para
      .trim()
      // Normalize internal whitespace artifacts from PDF extraction:
      // unwrap soft line breaks (PDF line-wrap, not real paragraph breaks)
      // and collapse multiple spaces from justified layouts.
      .replace(/([^\n])\n(?!\n)/g, "$1 ")
      .replace(/[ \t]{2,}/g, " "),
  );

  const lockedFlags = classifyReferenceParagraphs(normalized);

  const sections: { text: string; isLocked: boolean }[] = normalized.map((text, i) => ({
    text,
    isLocked: lockedFlags[i],
  }));

  return { sections, citations: allCitations };
}
