/**
 * The corruption-prevention decision logic for accepting a flag's
 * replacement text — extracted from app/api/flags/resolve/route.ts
 * (behavior-preserving; see git history "Fix document corruption:
 * flags/resolve no longer blind-splices at stale offsets").
 *
 * Replacement semantics (this caused real document corruption when it was a
 * blind offset splice):
 *
 * - ai_artifact flags: the option/manual text is a NARROW replacement for
 *   the artifact instance ("(remove)" sentinel = delete). Replace the
 *   flagged span, verified against the CURRENT text and re-anchored by
 *   search if earlier edits moved it. Refuse if the text is gone.
 *
 * - every other flag: generated options are FULL-SECTION rewrites (the
 *   suggest prompts interpolate [SECTION_TEXT] only), and both editors
 *   prefill manual edits with the full section text — so the replacement
 *   IS the new section text. Never splice it into a narrow span: that
 *   pastes a whole paragraph mid-word and duplicates everything around it.
 *
 * Pulled into its own module so it's testable without a database — the
 * route calls it verbatim, so a test exercising this module is exercising
 * the actual shipped logic, not a re-implementation.
 */

import { validateReplacementBlocking } from "@/lib/analysis/corruption-checker";

export interface FlagSpan {
  flaggedPhrase: string;
  phraseStart: number;
  phraseEnd: number;
}

export type FlagReplacementResult =
  | { ok: true; newSectionText: string }
  | { ok: false; reason: "stale_flag"; error: string }
  | { ok: false; reason: "suspect_replacement"; error: string }
  | { ok: false; reason: "corrupt_replacement"; error: string };

/**
 * Locate the span to replace in the CURRENT text: stored offsets when they
 * still match the flagged phrase, else the occurrence nearest the original
 * position (earlier edits shift text), else null — never splice blind.
 */
export function locateSpan(
  text: string,
  phrase: string,
  storedStart: number,
  storedEnd: number,
): { start: number; end: number } | null {
  if (
    storedStart >= 0 &&
    storedEnd <= text.length &&
    text.slice(storedStart, storedEnd) === phrase
  ) {
    return { start: storedStart, end: storedEnd };
  }
  let best = -1;
  let bestDist = Infinity;
  let idx = text.indexOf(phrase);
  while (idx !== -1) {
    const dist = Math.abs(idx - storedStart);
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
    idx = text.indexOf(phrase, idx + 1);
  }
  return best === -1 ? null : { start: best, end: best + phrase.length };
}

/**
 * Compute the new section text for an accepted flag, or refuse with a typed
 * reason. Encapsulates the full "is this safe to apply" decision: span
 * location/re-anchoring for artifact flags, the truncated-option guard, and
 * the blocking corruption check — in that order, matching the route exactly.
 */
export function computeFlagReplacement(params: {
  patternType: string;
  currentSectionText: string;
  replacementRaw: string;
  /** True when the replacement came from a generated option (id present),
   * false for a manual edit — gates the truncation guard (manual condensing
   * is a deliberate user choice, exempt from the truncated-LLM heuristic). */
  isOptionBased: boolean;
  span: FlagSpan;
}): FlagReplacementResult {
  const { patternType, currentSectionText, replacementRaw, isOptionBased, span } = params;

  let candidate: string;
  if (patternType === "ai_artifact") {
    const replacement = replacementRaw === "(remove)" ? "" : replacementRaw;
    const located = locateSpan(currentSectionText, span.flaggedPhrase, span.phraseStart, span.phraseEnd);
    if (!located) {
      return {
        ok: false,
        reason: "stale_flag",
        error: "This text has changed since the scan — the suggestion no longer applies.",
      };
    }
    candidate =
      currentSectionText.slice(0, located.start) +
      replacement +
      currentSectionText.slice(located.end);
  } else {
    // Whole-section replacement. Guard against a pathologically small OPTION
    // wiping a large section (truncated LLM output). Manual edits are
    // exempt — a user may deliberately condense a section hard.
    if (isOptionBased && replacementRaw.trim().length < 40 && currentSectionText.trim().length > 300) {
      return {
        ok: false,
        reason: "suspect_replacement",
        error: "The replacement looks truncated and was not applied.",
      };
    }
    candidate = replacementRaw;
  }

  // BLOCKING corruption check — conservative patterns only (line-anchored
  // LLM markers, code fences, markdown bold): a match here REFUSES the
  // accept, so prose-plausible phrases like "the verdict: guilty" must not
  // trigger it.
  const corruption = validateReplacementBlocking(currentSectionText, candidate);
  if (corruption) {
    return {
      ok: false,
      reason: "corrupt_replacement",
      error: `The replacement looked corrupted and was not applied (${corruption}).`,
    };
  }

  return { ok: true, newSectionText: candidate };
}
