/**
 * AI Artifact Detector
 *
 * Scans text for formatting artifacts from the Style Training library (44 items).
 * Each detection maps to a specific style training item by name.
 * Returns findings with counts, positions, and the item name for cross-referencing preferences.
 */

export interface ArtifactInstance {
  start: number;       // character offset in text
  end: number;
  matchedText: string;
}

export interface ArtifactFinding {
  item: string;         // Matches style_training.item exactly
  category: string;     // Matches style_training.category exactly
  count: number;        // How many instances found
  penalty: number;      // Score deduction (0-20)
  detail: string;       // Human-readable explanation
  instances: ArtifactInstance[];
}

export interface ArtifactResult {
  score: number;        // 0-100 (100 = clean)
  findings: ArtifactFinding[];
}

// AI-indicativeness tiers — how strongly each artifact signals AI authorship
const INDICATIVENESS: Record<string, number> = {
  "Helpful-assistant closers": 2, "Offer-more closers": 2, "TL;DR boxes": 2,
  "Bolded summary line at end": 2, "Recap paragraphs": 1.8,
  "Standard emojis": 1.5, "Section-opener emojis": 1.5, "Sparkles emoji": 1.5,
  "Bold lead-ins on bullets": 1.5, "Code blocks for non-code": 1.5,
  "Vague attribution phrases": 1.5, "Inline backticks": 1.5,
  "Invented parenthetical citations": 1.5, "Footnote markers without footnotes": 1.5,
  "Bracket citation markers": 1.5,
  "Curly/smart double quotes": 0.7, "Curly/smart single quotes": 0.7,
  "Curly apostrophes mid-word": 0.7, "Non-breaking spaces": 0.7,
  "Hair spaces / thin spaces": 0.7, "Double spaces after periods": 0.7,
  "Trailing whitespace": 0.7,
};

/** Collect all regex matches with positions */
function matchAll(text: string, pattern: RegExp): ArtifactInstance[] {
  const instances: ArtifactInstance[] = [];
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    instances.push({ start: m.index, end: m.index + m[0].length, matchedText: m[0] });
    if (m[0].length === 0) re.lastIndex++;
  }
  return instances;
}

/**
 * Detect AI formatting artifacts in text.
 * @param skipItems - Set of item names to exclude (from style training "always_keep")
 */
export function detectArtifacts(text: string, skipItems?: Set<string>): ArtifactResult {
  const findings: ArtifactFinding[] = [];

  if (!text || text.trim().length < 20) {
    return { score: 100, findings: [] };
  }

  function add(item: string, category: string, instances: ArtifactInstance[], penalty: number, detail: string) {
    if (skipItems?.has(item)) return;
    if (instances.length === 0) return;
    findings.push({ item, category, count: instances.length, penalty, detail, instances });
  }

  const lines = text.split("\n");
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const sentenceCount = sentences.length;

  // ── Punctuation ─────────────────────────────────────────────────────

  const emDashes = matchAll(text, /\u2014/g);
  if (emDashes.length > 0) {
    const rate = emDashes.length / (wordCount / 100);
    add("Em dashes", "Punctuation", emDashes, Math.min(20, Math.round(rate * 4)), `${emDashes.length} em dashes (${rate.toFixed(1)} per 100 words)`);
  }

  const enDashes = matchAll(text, /\u2013/g);
  add("En dashes (used as separators)", "Punctuation", enDashes, Math.min(8, enDashes.length * 2), `${enDashes.length} en dashes`);

  const unicodeEllipsis = matchAll(text, /\u2026/g);
  add("Unicode ellipsis", "Punctuation", unicodeEllipsis, Math.min(8, unicodeEllipsis.length * 2), `${unicodeEllipsis.length} unicode ellipsis`);

  const curlyDoubles = matchAll(text, /[\u201C\u201D]/g);
  add("Curly/smart double quotes", "Punctuation", curlyDoubles, Math.min(6, Math.round(curlyDoubles.length / 4)), `${curlyDoubles.length} curly double quotes`);

  const curlyQuotePairs = matchAll(text, /\u2018[^]*?\u2019/g);
  add("Curly/smart single quotes", "Punctuation", curlyQuotePairs, Math.min(4, curlyQuotePairs.length), `${curlyQuotePairs.length} curly single quote pairs`);

  const curlyApostrophes = matchAll(text, /(?<=\w)\u2019(?=\w)/g);
  add("Curly apostrophes mid-word", "Punctuation", curlyApostrophes, Math.min(4, Math.round(curlyApostrophes.length / 3)), `${curlyApostrophes.length} curly apostrophes`);

  const nbsp = matchAll(text, /\u00A0/g);
  add("Non-breaking spaces", "Punctuation", nbsp, Math.min(6, Math.round(nbsp.length / 2)), `${nbsp.length} non-breaking spaces`);

  const hairSpaces = matchAll(text, /[\u200A\u2009\u2008]/g);
  add("Hair spaces / thin spaces", "Punctuation", hairSpaces, Math.min(6, Math.round(hairSpaces.length / 2)), `${hairSpaces.length} hair/thin spaces`);

  const doubleSpaces = matchAll(text, /\.\s{2,}/g);
  add("Double spaces after periods", "Punctuation", doubleSpaces, Math.min(4, Math.round(doubleSpaces.length / 2)), `${doubleSpaces.length} double spaces`);

  // Trailing whitespace — line-level, instances track line positions
  const trailingInstances: ArtifactInstance[] = [];
  let lineOffset = 0;
  for (const line of lines) {
    const trailing = line.match(/(\s+)$/);
    if (trailing && line.trim().length > 0) {
      trailingInstances.push({ start: lineOffset + line.length - trailing[1].length, end: lineOffset + line.length, matchedText: trailing[1] });
    }
    lineOffset += line.length + 1;
  }
  if (trailingInstances.length > 3) {
    add("Trailing whitespace", "Punctuation", trailingInstances, Math.min(4, Math.round(trailingInstances.length / 3)), `${trailingInstances.length} lines with trailing whitespace`);
  }

  // ── Emojis & Decorative Symbols ─────────────────────────────────────

  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu;
  const allEmojis = matchAll(text, emojiPattern);
  add("Standard emojis", "Emojis & Decorative Symbols", allEmojis, Math.min(15, allEmojis.length * 3), `${allEmojis.length} emoji characters`);

  const sparkles = matchAll(text, /\u2728/g);
  add("Sparkles emoji", "Emojis & Decorative Symbols", sparkles, Math.min(8, sparkles.length * 3), `${sparkles.length} sparkles`);

  const checks = matchAll(text, /[\u2713\u2714\u2705]/g);
  add("Checkmarks", "Emojis & Decorative Symbols", checks, Math.min(6, checks.length * 2), `${checks.length} checkmarks`);

  const crosses = matchAll(text, /[\u2717\u2718\u274C]/g);
  add("Cross marks", "Emojis & Decorative Symbols", crosses, Math.min(6, crosses.length * 2), `${crosses.length} cross marks`);

  const arrows = matchAll(text, /[\u2192\u21D2\u279C\u27F6\u2190\u2194\u21E8]/g);
  add("Arrow characters", "Emojis & Decorative Symbols", arrows, Math.min(6, arrows.length * 2), `${arrows.length} arrows`);

  const stars = matchAll(text, /[\u2605\u2606\u2B50]/g);
  add("Star bullets", "Emojis & Decorative Symbols", stars, Math.min(6, stars.length * 2), `${stars.length} stars`);

  const dingbats = matchAll(text, /[\u2756\u25C6\u25C7\u276F\u25B8\u2022\u25CF\u25CB]/g);
  add("Decorative dingbats", "Emojis & Decorative Symbols", dingbats, Math.min(6, dingbats.length), `${dingbats.length} dingbats`);

  // Section-opener emojis — line-level
  const sectionEmojiInstances: ArtifactInstance[] = [];
  lineOffset = 0;
  for (const line of lines) {
    if (emojiPattern.test(line.trim().slice(0, 3))) {
      sectionEmojiInstances.push({ start: lineOffset, end: lineOffset + 2, matchedText: line.trim().slice(0, 2) });
    }
    lineOffset += line.length + 1;
  }
  add("Section-opener emojis", "Emojis & Decorative Symbols", sectionEmojiInstances, Math.min(10, sectionEmojiInstances.length * 3), `${sectionEmojiInstances.length} lines starting with emoji`);

  // ── Structural Formatting ───────────────────────────────────────────

  const hruleInstances: ArtifactInstance[] = [];
  lineOffset = 0;
  for (const line of lines) {
    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      hruleInstances.push({ start: lineOffset, end: lineOffset + line.length, matchedText: line.trim() });
    }
    lineOffset += line.length + 1;
  }
  add("Horizontal rules", "Structural Formatting", hruleInstances, Math.min(8, hruleInstances.length * 3), `${hruleInstances.length} horizontal rules`);

  const headerCount = lines.filter((l) => /^#{1,6}\s/.test(l.trim())).length;
  const headerRatio = headerCount / Math.max(1, lines.filter((l) => l.trim().length > 0).length);
  if (headerCount > 3 && headerRatio > 0.15) {
    const headerInstances = matchAll(text, /^#{1,6}\s.*/gm);
    add("Excessive headers", "Structural Formatting", headerInstances, Math.min(10, Math.round((headerRatio - 0.15) * 40)), `${headerCount} headers (${Math.round(headerRatio * 100)}% of lines)`);
  }

  const boldBullets = matchAll(text, /^\s*[-*]\s+\*\*[^*]+\*\*[:\s]/gm);
  if (boldBullets.length > 2) {
    add("Bold lead-ins on bullets", "Structural Formatting", boldBullets, Math.min(10, (boldBullets.length - 2) * 3), `${boldBullets.length} bullets with bold lead-ins`);
  }

  const deepNestedInstances: ArtifactInstance[] = [];
  lineOffset = 0;
  for (const line of lines) {
    if (/^\s{6,}[-*]\s/.test(line)) {
      deepNestedInstances.push({ start: lineOffset, end: lineOffset + line.length, matchedText: line });
    }
    lineOffset += line.length + 1;
  }
  add("Deep nested bullet lists", "Structural Formatting", deepNestedInstances, Math.min(8, deepNestedInstances.length * 3), `${deepNestedInstances.length} deeply nested items`);

  const numberedItems = matchAll(text, /^\s*\d+[.)]\s/gm);
  if (numberedItems.length > 5) {
    add("Numbered lists for non-sequential items", "Structural Formatting", numberedItems, Math.min(8, Math.round((numberedItems.length - 5) * 1.5)), `${numberedItems.length} numbered items`);
  }

  const blockquoteInstances: ArtifactInstance[] = [];
  lineOffset = 0;
  for (const line of lines) {
    if (/^\s*>\s/.test(line)) {
      blockquoteInstances.push({ start: lineOffset, end: lineOffset + line.length, matchedText: line });
    }
    lineOffset += line.length + 1;
  }
  if (blockquoteInstances.length > 1) {
    add("Blockquotes for emphasis", "Structural Formatting", blockquoteInstances, Math.min(6, (blockquoteInstances.length - 1) * 2), `${blockquoteInstances.length} blockquotes`);
  }

  const bulletInstances = matchAll(text, /^\s*[-*]\s/gm);
  const bulletRatio = bulletInstances.length / Math.max(1, sentenceCount);
  if (bulletRatio > 0.2) {
    add("Bullet lists generally", "Structural Formatting", bulletInstances, Math.min(12, Math.round((bulletRatio - 0.2) * 25)), `${bulletInstances.length} bullets (${Math.round(bulletRatio * 100)}% of content)`);
  }

  // ── Markdown Artifacts ──────────────────────────────────────────────

  const boldMarkers = matchAll(text, /\*\*[^*]+\*\*|__[^_]+__/g);
  if (boldMarkers.length > 2) {
    add("Bold markers", "Markdown Artifacts", boldMarkers, Math.min(10, (boldMarkers.length - 2) * 2), `${boldMarkers.length} bold phrases`);
  }

  const italicMarkers = matchAll(text, /(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_)/g);
  if (italicMarkers.length > 3) {
    add("Italic markers", "Markdown Artifacts", italicMarkers, Math.min(6, Math.round((italicMarkers.length - 3) * 1.5)), `${italicMarkers.length} italic phrases`);
  }

  const backtickInstances = matchAll(text, /`[^`]+`/g);
  add("Inline backticks", "Markdown Artifacts", backtickInstances, Math.min(8, backtickInstances.length * 2), `${backtickInstances.length} backtick terms`);

  const codeBlockInstances = matchAll(text, /```[\s\S]*?```/g);
  add("Code blocks for non-code", "Markdown Artifacts", codeBlockInstances, Math.min(8, codeBlockInstances.length * 4), `${codeBlockInstances.length} code blocks`);

  // Double line breaks
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const singleBreakParagraphs = text.split(/\n(?!\n)/).filter((p) => p.trim().length > 10);
  if (paragraphs.length > 3 && singleBreakParagraphs.length < paragraphs.length * 0.3) {
    add("Double line breaks between every paragraph", "Markdown Artifacts", [{ start: 0, end: 0, matchedText: "(document-wide)" }], 4, `All ${paragraphs.length} paragraphs double-spaced`);
  }

  // ── Citation & Reference Patterns ───────────────────────────────────

  const vagueAttribution = matchAll(text, /\b(according to (recent|some|many|various) (studies|research|experts|sources|reports))\b/gi);
  add("Vague attribution phrases", "Citation & Reference Patterns", vagueAttribution, Math.min(10, vagueAttribution.length * 4), `${vagueAttribution.length} vague attributions`);

  const inlineUrls = matchAll(text, /\(https?:\/\/[^\s)]+\)/g);
  add("Inline URL references", "Citation & Reference Patterns", inlineUrls, Math.min(6, inlineUrls.length * 2), `${inlineUrls.length} inline URLs`);

  // Invented parenthetical citations (no references section)
  const hasRefSection = /\b(references|bibliography|works cited)\b/i.test(text);
  if (!hasRefSection) {
    const parenCitations = matchAll(text, /\([A-Z][a-z]+(?:\s(?:et\s+al\.|&\s+[A-Z][a-z]+))?,\s*\d{4}\)/g);
    add("Invented parenthetical citations", "Citation & Reference Patterns", parenCitations, Math.min(10, parenCitations.length * 3), `${parenCitations.length} citations with no reference section`);
  }

  const footnoteMarkers = matchAll(text, /[\u00B9\u00B2\u00B3\u2074-\u2079]/g);
  const hasFootnoteSection = /\b(footnotes?|endnotes?|notes)\b/i.test(text);
  if (!hasFootnoteSection && footnoteMarkers.length > 0) {
    add("Footnote markers without footnotes", "Citation & Reference Patterns", footnoteMarkers, Math.min(8, footnoteMarkers.length * 3), `${footnoteMarkers.length} markers, no footnote section`);
  }

  if (!hasRefSection) {
    const bracketCitations = matchAll(text, /\[\d+\]/g);
    if (bracketCitations.length > 2) {
      add("Bracket citation markers", "Citation & Reference Patterns", bracketCitations, Math.min(8, (bracketCitations.length - 2) * 2), `${bracketCitations.length} bracket citations, no bibliography`);
    }
  }

  // Tables for prose
  const tableRows: ArtifactInstance[] = [];
  lineOffset = 0;
  for (const line of lines) {
    if (/^\|.*\|.*\|/.test(line.trim())) {
      tableRows.push({ start: lineOffset, end: lineOffset + line.length, matchedText: line.trim() });
    }
    lineOffset += line.length + 1;
  }
  if (tableRows.length > 3) {
    add("Tables for prose content", "Structural Formatting", tableRows, Math.min(8, (tableRows.length - 3) * 2), `${tableRows.length} table rows`);
  }

  // ── Closing & Sign-off Patterns ─────────────────────────────────────

  const recapPhrases = matchAll(text, /\b(in summary|to summarize|to sum up|in conclusion|to conclude|as we('ve| have) (seen|discussed|explored))\b/gi);
  if (recapPhrases.length > 1) {
    add("Recap paragraphs", "Closing & Sign-off Patterns", recapPhrases, Math.min(8, recapPhrases.length * 3), `${recapPhrases.length} recap phrases`);
  }

  const assistantClosers = matchAll(text, /\b(i hope this helps|hope that helps|happy to (help|assist|clarify)|feel free to (ask|reach out))\b/gi);
  add("Helpful-assistant closers", "Closing & Sign-off Patterns", assistantClosers, Math.min(15, assistantClosers.length * 8), `${assistantClosers.length} assistant sign-offs`);

  const offerMore = matchAll(text, /\b(let me know if you('d| would) like|if you (need|want) (more|any|further)|don't hesitate to)\b/gi);
  add("Offer-more closers", "Closing & Sign-off Patterns", offerMore, Math.min(15, offerMore.length * 8), `${offerMore.length} "let me know" closers`);

  const tldr = matchAll(text, /\btl;?dr\b/gi);
  add("TL;DR boxes", "Closing & Sign-off Patterns", tldr, Math.min(8, tldr.length * 5), `${tldr.length} TL;DR sections`);

  const boldSummary = matchAll(text, /\*\*(bottom line|key takeaway|in short|the point)\*\*/gi);
  add("Bolded summary line at end", "Closing & Sign-off Patterns", boldSummary, Math.min(8, boldSummary.length * 4), `${boldSummary.length} bolded summaries`);

  // ── Spacing & Layout Tells ──────────────────────────────────────────

  // One-sentence paragraphs
  const oneSentParagraphs: ArtifactInstance[] = [];
  let paraOffset = 0;
  for (const para of paragraphs) {
    const pSentences = para.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (pSentences.length === 1 && para.trim().length > 15) {
      const idx = text.indexOf(para, paraOffset);
      if (idx >= 0) {
        oneSentParagraphs.push({ start: idx, end: idx + para.length, matchedText: para });
        paraOffset = idx + 1;
      }
    }
  }
  if (oneSentParagraphs.length > 3 && paragraphs.length > 5) {
    const ratio = oneSentParagraphs.length / paragraphs.length;
    if (ratio > 0.4) {
      add("One-sentence paragraphs (repeated)", "Spacing & Layout Tells", oneSentParagraphs, Math.min(10, Math.round(ratio * 15)), `${oneSentParagraphs.length} of ${paragraphs.length} paragraphs are single sentences`);
    }
  }

  // Uniform paragraph length
  if (paragraphs.length >= 4) {
    const paraLengths = paragraphs.map((p) => p.split(/\s+/).length);
    const mean = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
    if (mean > 0) {
      const variance = paraLengths.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / paraLengths.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.2) {
        add("Uniform paragraph length", "Spacing & Layout Tells", [{ start: 0, end: 0, matchedText: "(document-wide)" }], Math.min(10, Math.round((0.2 - cv) * 50)), `Paragraph lengths very uniform (CV=${cv.toFixed(2)})`);
      }
    }
  }

  // Blank lines around every header
  const headerLines = lines.map((l, i) => ({ line: l, idx: i })).filter(({ line }) => /^#{1,6}\s/.test(line.trim()));
  if (headerLines.length >= 3) {
    const allPadded = headerLines.every(({ idx }) => {
      const before = idx > 0 ? lines[idx - 1].trim() === "" : true;
      const after = idx < lines.length - 1 ? lines[idx + 1].trim() === "" : true;
      return before && after;
    });
    if (allPadded) {
      const instances: ArtifactInstance[] = [];
      let lo = 0;
      for (let li = 0; li < lines.length; li++) {
        if (headerLines.some((h) => h.idx === li)) {
          instances.push({ start: lo, end: lo + lines[li].length, matchedText: lines[li] });
        }
        lo += lines[li].length + 1;
      }
      add("Blank lines around every header", "Spacing & Layout Tells", instances, Math.min(6, instances.length), `All ${headerLines.length} headers padded with blank lines`);
    }
  }

  // ── Score calculation — weighted by AI-indicativeness tier ───────────

  const totalPenalty = findings.reduce((sum, f) => {
    const tier = INDICATIVENESS[f.item] ?? 1;
    return sum + Math.round(f.penalty * tier);
  }, 0);
  const score = Math.max(0, 100 - totalPenalty);

  return { score, findings };
}
