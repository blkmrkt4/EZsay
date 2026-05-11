/**
 * Text-level formatting transformations applied before DOCX rendering.
 * Each function is a pure transform: string in, string out.
 */

type Preferences = Record<string, unknown>;

/**
 * Applies all text-level style rules to a section of text.
 */
export function applyTextFormatting(text: string, prefs: Preferences): string {
  let result = text;

  // Spaces after period
  const spacesAfterPeriod = prefs.spaces_after_period as string | undefined;
  if (spacesAfterPeriod === "two") {
    // Normalize to two spaces after sentence-ending punctuation
    result = result.replace(/([.!?])[ ]+/g, "$1  ");
  } else {
    // Default: one space
    result = result.replace(/([.!?])[ ]{2,}/g, "$1 ");
  }

  // Quotation style
  const quoteStyle = prefs.quotation_style as string | undefined;
  if (quoteStyle === "single") {
    // Convert double curly quotes to single curly quotes
    result = result.replace(/\u201C/g, "\u2018").replace(/\u201D/g, "\u2019");
    // Convert straight double quotes to single curly
    result = result.replace(/"([^"]*?)"/g, "\u2018$1\u2019");
  } else {
    // Default: double — convert single curly to double curly
    result = result.replace(/\u2018/g, "\u201C").replace(/\u2019(?=[a-zA-Z])/g, "\u201C");
    // Convert straight quotes to curly doubles
    result = result.replace(/"([^"]*?)"/g, "\u201C$1\u201D");
  }

  // Em dash style
  const emDashStyle = prefs.em_dash_style as string | undefined;
  if (emDashStyle === "spaced") {
    // Ensure spaces around em dashes
    result = result.replace(/(\S)\u2014(\S)/g, "$1 \u2014 $2");
    result = result.replace(/(\S)\u2014/g, "$1 \u2014");
    result = result.replace(/\u2014(\S)/g, "\u2014 $1");
  } else if (emDashStyle === "en_dash") {
    // Replace em dashes with en dashes (spaced)
    result = result.replace(/\s*\u2014\s*/g, " \u2013 ");
  } else {
    // Default: no spaces (closed em dash)
    result = result.replace(/\s*\u2014\s*/g, "\u2014");
  }

  // Ellipsis style
  const ellipsisStyle = prefs.ellipsis_style as string | undefined;
  if (ellipsisStyle === "unicode") {
    result = result.replace(/\.{3}/g, "\u2026");
    result = result.replace(/\.\s\.\s\./g, "\u2026");
  } else if (ellipsisStyle === "spaced") {
    result = result.replace(/\u2026/g, ". . .");
    result = result.replace(/\.{3}/g, ". . .");
  } else {
    // Default: three dots
    result = result.replace(/\u2026/g, "...");
    result = result.replace(/\.\s\.\s\./g, "...");
  }

  return result;
}
