/**
 * English-variant resolution and prompt-token building.
 *
 * A document's target variant is resolved per-document:
 *   1. documents.intake.english_variant  (the intake questionnaire answer)
 *   2. userStylePreferences english_variant / legacy british_spelling
 *   3. null — no enforcement (British and American both valid, legacy behaviour)
 *
 * An explicit "american" choice IS a target (flag "colour"); only the total
 * absence of a choice means no enforcement.
 *
 * IMPORTANT: executeActivity leaves unmatched [PLACEHOLDER]s literally in the
 * prompt text, so any prompt containing [SPELLING_VARIANT] must ALWAYS receive
 * the token — variantToken(null) returns the neutral no-enforcement text.
 */

export type EnglishVariant =
  | "american"
  | "british"
  | "australian"
  | "canadian"
  | "irish"
  | "south_african";

const VARIANT_VALUES = new Set<string>([
  "american",
  "british",
  "australian",
  "canadian",
  "irish",
  "south_african",
]);

export const VARIANT_LABELS: Record<EnglishVariant, string> = {
  american: "American English",
  british: "British English",
  australian: "Australian English",
  canadian: "Canadian English",
  irish: "Irish English",
  south_african: "South African English",
};

const VARIANT_CONVENTIONS: Record<EnglishVariant, string> = {
  american: "American English spelling and conventions (e.g. organized, color, analyze, center, -ize endings)",
  british: "British English spelling and conventions (e.g. organised, colour, analyse, centre, -ise endings)",
  australian: "Australian English spelling and conventions (follows British spelling: organised, colour, analyse, with local idiom)",
  canadian: "Canadian English spelling and conventions (e.g. colour, centre, but -ize endings like American English)",
  irish: "Irish English spelling and conventions (follows British spelling conventions)",
  south_african: "South African English spelling and conventions (follows British spelling conventions)",
};

/**
 * Resolve the target variant for a document. Intake answer wins over the
 * user's style preferences (which may themselves come from a parsed style
 * guide). Returns null when nothing was ever chosen — no enforcement.
 */
export function resolveEnglishVariant(
  intake?: Record<string, unknown> | null,
  stylePrefs?: Record<string, unknown> | null,
): EnglishVariant | null {
  const fromIntake = intake?.english_variant;
  if (typeof fromIntake === "string" && VARIANT_VALUES.has(fromIntake)) {
    return fromIntake as EnglishVariant;
  }
  const fromPrefs = stylePrefs?.english_variant;
  if (typeof fromPrefs === "string" && VARIANT_VALUES.has(fromPrefs)) {
    return fromPrefs as EnglishVariant;
  }
  if (stylePrefs?.british_spelling === true) return "british";
  return null;
}

/**
 * The text substituted for [SPELLING_VARIANT] in prompts. Always returns a
 * non-empty instruction so the placeholder never leaks raw into LLM input.
 */
export function variantToken(variant: EnglishVariant | null): string {
  if (!variant) {
    return "No target English variant is set for this document. Treat British and American spellings as both valid; do not flag or change words for being in one variant or the other.";
  }
  return `This document must conform to ${VARIANT_CONVENTIONS[variant]}. Correctly-spelled words from a different English variant are errors and must be corrected to the target variant. EXCEPTION: never flag or change spelling inside quotation marks — quoted material keeps its source variant.`;
}

// One-sided marker patterns for auto-detection. Each pattern matches ONLY its
// own variant's form (no overlap with the counterpart). Fixed, unambiguous,
// common markers only. Used solely to pre-select the intake question.
const BRITISH_MARKERS: RegExp[] = [
  /\bcolours?\b/gi,
  /\bcentres?\b/gi,
  /\banalys(e|es|ed|ing)\b/gi,
  /\borganis(e|es|ed|ing|ation|ations)\b/gi,
  /\brecognis(e|es|ed|ing)\b/gi,
  /\bemphasis(e|es|ed|ing)\b/gi,
  /\bcharacteris(e|es|ed|ing)\b/gi,
  /\bbehaviours?\b/gi,
  /\bfavour(s|ed|ing|able)?\b/gi,
  /\bfavourite\b/gi,
  /\blabours?\b/gi,
  /\bprogrammes?\b/gi,
  /\bdefences?\b/gi,
  /\blicences?\b/gi,
  /\btravell(ed|ing|er|ers)\b/gi,
  /\bmodell(ed|ing)\b/gi,
  /\bwhilst\b/gi,
  /\bgrey\b/gi,
  /\bfulfil\b/gi,
];

const AMERICAN_MARKERS: RegExp[] = [
  /\bcolors?\b/gi,
  /\bcenters?\b/gi,
  /\banalyz(e|es|ed|ing)\b/gi,
  /\borganiz(e|es|ed|ing|ation|ations)\b/gi,
  /\brecogniz(e|es|ed|ing)\b/gi,
  /\bemphasiz(e|es|ed|ing)\b/gi,
  /\bcharacteriz(e|es|ed|ing)\b/gi,
  /\bbehaviors?\b/gi,
  /\bfavor(s|ed|ing|able)?\b/gi,
  /\bfavorite\b/gi,
  /\blabors?\b/gi,
  /\bdefenses?\b/gi,
  /\blicenses?\b/gi,
  /\btravel(ed|ing)\b/gi,
  /\bmodel(ed|ing)\b/gi,
  /\bgray\b/gi,
  /\bfulfill\b/gi,
];

function countAll(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

/**
 * Guess the dominant variant from document text. Returns null when the signal
 * is too weak (<3 markers) or too mixed (<70% majority). British-family
 * variants (australian/irish/south_african) are indistinguishable from
 * british by spelling alone, so this only ever returns british or american.
 */
export function detectEnglishVariant(text: string): "british" | "american" | null {
  if (!text) return null;
  const british = countAll(text, BRITISH_MARKERS);
  const american = countAll(text, AMERICAN_MARKERS);
  const total = british + american;
  if (total < 3) return null;
  if (british / total >= 0.7) return "british";
  if (american / total >= 0.7) return "american";
  return null;
}
