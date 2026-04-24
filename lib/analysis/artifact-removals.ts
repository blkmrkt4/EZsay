/**
 * Artifact Removal Strategies
 *
 * Maps each style training item to a replacement function.
 * Used by /api/artifacts/bulk-remove to auto-process "Remove" choices.
 */

/** Given the matched text, return the replacement */
export const ARTIFACT_REPLACEMENTS: Record<string, (matched: string) => string> = {
  // Punctuation
  "Em dashes": () => " - ",
  "En dashes (used as separators)": () => " - ",
  "Unicode ellipsis": () => "...",
  "Curly/smart double quotes": (m) => m === "\u201C" ? '"' : '"',
  "Curly/smart single quotes": (m) => m === "\u2018" ? "'" : "'",
  "Curly apostrophes mid-word": () => "'",
  "Non-breaking spaces": () => " ",
  "Hair spaces / thin spaces": () => " ",
  "Double spaces after periods": () => ". ",
  "Trailing whitespace": () => "",

  // Emojis & Decorative Symbols
  "Standard emojis": () => "",
  "Section-opener emojis": () => "",
  "Sparkles emoji": () => "",
  "Checkmarks": () => "",
  "Cross marks": () => "",
  "Arrow characters": () => " ",
  "Star bullets": () => "- ",
  "Decorative dingbats": () => "",

  // Structural Formatting
  "Horizontal rules": () => "",
  "Bold lead-ins on bullets": (m) => m.replace(/\*\*([^*]+)\*\*/, "$1"),
  "Deep nested bullet lists": (m) => m.replace(/^\s{6,}/, "  "),
  "Blockquotes for emphasis": (m) => m.replace(/^\s*>\s?/, ""),
  "Tables for prose content": (m) => m.replace(/\|/g, " ").trim(),

  // Markdown Artifacts
  "Bold markers": (m) => m.replace(/\*\*/g, "").replace(/__/g, ""),
  "Italic markers": (m) => m.replace(/(?:^[*_]|[*_]$)/g, ""),
  "Inline backticks": (m) => m.replace(/`/g, ""),
  "Code blocks for non-code": (m) => m.replace(/```\n?/g, ""),

  // Citation & Reference Patterns
  "Vague attribution phrases": (m) => m,  // Keep but flag — user decides wording
  "Inline URL references": (m) => m,      // Keep — might be intentional

  // Closing & Sign-off Patterns — remove entire matched phrase
  "Helpful-assistant closers": () => "",
  "Offer-more closers": () => "",
  "TL;DR boxes": () => "",
  "Bolded summary line at end": (m) => m.replace(/\*\*/g, ""),
  "Recap paragraphs": (m) => m,  // Keep — just reduce penalty, user decides
};

/**
 * Human-readable description of what "Remove" does for each artifact.
 * Used in the batch flag UI and Style Training page.
 */
export const REMOVAL_DESCRIPTIONS: Record<string, string> = {
  // Punctuation
  "Em dashes": "Em dash \u2014 will be replaced with a hyphen -",
  "En dashes (used as separators)": "En dash \u2013 will be replaced with a hyphen -",
  "Unicode ellipsis": "Unicode ellipsis \u2026 will be replaced with three dots ...",
  "Curly/smart double quotes": "Curly quotes \u201C \u201D will be replaced with straight quotes \" \"",
  "Curly/smart single quotes": "Curly single quotes \u2018 \u2019 will be replaced with straight quotes ' '",
  "Curly apostrophes mid-word": "Curly apostrophe \u2019 will be replaced with straight apostrophe '",
  "Non-breaking spaces": "Non-breaking spaces will be replaced with normal spaces",
  "Hair spaces / thin spaces": "Hair/thin spaces will be replaced with normal spaces",
  "Double spaces after periods": "Double spaces will be reduced to single spaces",
  "Trailing whitespace": "Trailing whitespace at line ends will be removed",

  // Emojis & Decorative Symbols
  "Standard emojis": "All emoji characters will be removed",
  "Section-opener emojis": "Emojis at the start of headings/lines will be removed",
  "Sparkles emoji": "Sparkles \u2728 will be removed",
  "Checkmarks": "Checkmark characters \u2713 \u2705 will be removed",
  "Cross marks": "Cross mark characters \u2717 \u274C will be removed",
  "Arrow characters": "Arrow characters \u2192 \u21D2 will be replaced with spaces",
  "Star bullets": "Star bullets \u2605 will be replaced with dash bullets -",
  "Decorative dingbats": "Decorative characters \u25C6 \u2756 will be removed",

  // Structural Formatting
  "Horizontal rules": "Horizontal rules (--- ___) will be removed",
  "Bold lead-ins on bullets": "Bold formatting on bullet lead-ins will be stripped: **Speed:** becomes Speed:",
  "Deep nested bullet lists": "Deep nesting (3+ levels) will be flattened to 1 level",
  "Blockquotes for emphasis": "Blockquote markers > will be removed, text kept",
  "Tables for prose content": "Table formatting | will be removed, text kept as prose",
  "Excessive headers": "Cannot auto-remove \u2014 review individually",
  "Numbered lists for non-sequential items": "Cannot auto-remove \u2014 review individually",
  "Bullet lists generally": "Cannot auto-remove \u2014 review individually",

  // Markdown Artifacts
  "Bold markers": "Bold markers **text** will be stripped, leaving plain text",
  "Italic markers": "Italic markers *text* will be stripped, leaving plain text",
  "Inline backticks": "Backtick markers `text` will be stripped, leaving plain text",
  "Code blocks for non-code": "Code block markers ``` will be removed",
  "Double line breaks between every paragraph": "Cannot auto-remove \u2014 structural pattern",

  // Citation & Reference Patterns
  "Vague attribution phrases": "Cannot auto-remove \u2014 rewrite the attribution manually",
  "Inline URL references": "Cannot auto-remove \u2014 URLs may be intentional",
  "Invented parenthetical citations": "Cannot auto-remove \u2014 review citations individually",
  "Footnote markers without footnotes": "Orphan footnote markers \u00B9 \u00B2 will be removed",
  "Bracket citation markers": "Cannot auto-remove \u2014 may be intentional",

  // Closing & Sign-off Patterns
  "Helpful-assistant closers": "Phrases like \"I hope this helps\" will be removed entirely",
  "Offer-more closers": "Phrases like \"Let me know if you'd like\" will be removed entirely",
  "TL;DR boxes": "TL;DR sections will be removed entirely",
  "Bolded summary line at end": "Bold formatting will be stripped: **Bottom line:** becomes Bottom line:",
  "Recap paragraphs": "Cannot auto-remove \u2014 rewrite the recap manually",

  // Spacing & Layout
  "One-sentence paragraphs (repeated)": "Cannot auto-remove \u2014 merge paragraphs manually",
  "Uniform paragraph length": "Cannot auto-remove \u2014 vary paragraph lengths manually",
  "Blank lines around every header": "Cannot auto-remove \u2014 structural pattern",
};

/**
 * Get the replacement for an artifact instance.
 * Falls back to keeping the original text if no strategy defined.
 */
export function getArtifactReplacement(item: string, matchedText: string): string {
  const fn = ARTIFACT_REPLACEMENTS[item];
  return fn ? fn(matchedText) : matchedText;
}

/**
 * Get a human-readable description of what removing this artifact does.
 */
export function getRemovalDescription(item: string): string {
  return REMOVAL_DESCRIPTIONS[item] ?? "Will be removed or replaced";
}
