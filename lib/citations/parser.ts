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
    const trimmed = lines[i].trim().toLowerCase();
    if (REFERENCE_HEADERS.includes(trimmed)) {
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
 * Locks citation sections.
 */
export function parseAndSplit(rawText: string): ParsedDocument {
  const inlineCitations = findInlineCitations(rawText);
  const refSections = findReferenceSections(rawText);
  const allCitations = [...inlineCitations, ...refSections];

  // Find the reference section start (if any) — everything after is locked
  const refStart = refSections.length > 0 ? refSections[0].start : rawText.length;

  // Split the non-reference text into sections
  const mainText = rawText.slice(0, refStart);

  // Split by double newlines (paragraph breaks) or headings
  const rawParagraphs = mainText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const sections: { text: string; isLocked: boolean }[] = [];

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    // Check if this paragraph is just a citation reference
    const isCitation = REFERENCE_HEADERS.includes(trimmed.toLowerCase());

    sections.push({
      text: trimmed,
      isLocked: isCitation,
    });
  }

  // Add the reference section as a locked section if it exists
  if (refStart < rawText.length) {
    sections.push({
      text: rawText.slice(refStart).trim(),
      isLocked: true,
    });
  }

  return { sections, citations: allCitations };
}
