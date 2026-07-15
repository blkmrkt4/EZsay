/**
 * Sanitizes AI-GENERATED text before it is stored or shown as a replacement
 * option. LLMs habitually emit typographic AI artifacts — em dashes, curly
 * quotes, unicode ellipses, markdown markers — which would re-introduce the
 * exact patterns EzSay exists to remove every time a user accepts an option.
 *
 * Applies only to machine-generated text (options, regenerations). NEVER run
 * this on the user's own writing — silent changes to user text are forbidden.
 *
 * Reuses the artifact detector and the same replacement strategies as the
 * bulk-remove flow, restricted to items that are safe to fix mechanically.
 * Items the user has chosen to KEEP (style training preference) are skipped.
 */

import { detectArtifacts } from "./artifact-detector";
import { getArtifactReplacement } from "./artifact-removals";
import { db } from "@/db";
import { styleTraining, userArtifactOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Artifacts a generated OPTION should never introduce — mechanical fixes only. */
const AUTO_SAFE_ITEMS = new Set([
  "Em dashes",
  "En dashes (used as separators)",
  "Unicode ellipsis",
  "Curly/smart double quotes",
  "Curly/smart single quotes",
  "Curly apostrophes mid-word",
  "Non-breaking spaces",
  "Hair spaces / thin spaces",
  "Double spaces after periods",
  "Trailing whitespace",
  "Standard emojis",
  "Section-opener emojis",
  "Sparkles emoji",
  "Checkmarks",
  "Cross marks",
  "Arrow characters",
  "Star bullets",
  "Decorative dingbats",
  "Bold markers",
  "Italic markers",
  "Inline backticks",
  "Code blocks for non-code",
]);

/**
 * Loads the set of artifact items the user wants to KEEP — global style
 * training defaults merged with the user's per-artifact overrides. These are
 * never sanitized out of generated text (e.g. a user who likes em dashes).
 */
export async function loadArtifactKeepSet(userId: string): Promise<Set<string>> {
  try {
    const globalPrefs = await db.select().from(styleTraining);
    const overrides = await db
      .select()
      .from(userArtifactOverrides)
      .where(eq(userArtifactOverrides.userId, userId));
    const overrideMap = new Map(overrides.map((o) => [o.styleTrainingId, o.preference]));
    return new Set(
      globalPrefs
        .filter((g) => (overrideMap.get(g.id) ?? g.preference) === "always_keep")
        .map((g) => g.item),
    );
  } catch {
    return new Set(); // preference load failure must never block generation
  }
}

/**
 * Removes mechanical AI artifacts from generated text.
 * Returns the cleaned text; positions come from the detector and are applied
 * in reverse order so offsets stay valid.
 */
export function sanitizeGeneratedText(text: string, keepItems?: Set<string>): string {
  if (!text) return text;

  const { findings } = detectArtifacts(text, keepItems);
  const fixable = findings.filter((f) => f.item && AUTO_SAFE_ITEMS.has(f.item));

  let result = text;
  if (fixable.length > 0) {
    const instances = fixable
      .flatMap((f) => f.instances.map((inst) => ({ ...inst, item: f.item })))
      .filter((inst) => inst.start >= 0 && inst.end > inst.start)
      .sort((a, b) => b.start - a.start);

    for (const inst of instances) {
      const replacement = getArtifactReplacement(inst.item, inst.matchedText);
      result = result.slice(0, inst.start) + replacement + result.slice(inst.end);
    }
  }

  // Character-level typographic pass — the detector skips very short texts
  // (<20 chars), but generated text of ANY length (e.g. a grammar correction
  // phrase) must not introduce these characters. Mirrors ARTIFACT_REPLACEMENTS
  // for the same items.
  if (!keepItems?.has("Em dashes")) result = result.replace(/\s*—\s*/g, " - ");
  if (!keepItems?.has("En dashes (used as separators)")) result = result.replace(/–/g, " - ");
  if (!keepItems?.has("Unicode ellipsis")) result = result.replace(/…/g, "...");
  if (!keepItems?.has("Curly/smart double quotes")) result = result.replace(/[“”]/g, '"');
  if (!keepItems?.has("Curly apostrophes mid-word")) result = result.replace(/(?<=\w)’(?=\w)/g, "'");
  if (!keepItems?.has("Curly/smart single quotes")) result = result.replace(/[‘’]/g, "'");
  if (!keepItems?.has("Non-breaking spaces")) result = result.replace(/\u00A0/g, " ");
  if (!keepItems?.has("Hair spaces / thin spaces")) result = result.replace(/[\u200A\u2009\u2008]/g, " ");

  // Markdown pass: the detector's thresholds are tuned for whole documents
  // (e.g. bold flagged only above 2 occurrences) — in a short generated
  // replacement, even a single marker is an artifact. Prose options carry no
  // legitimate markdown.
  if (!keepItems?.has("Bold markers")) {
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  }
  if (!keepItems?.has("Inline backticks")) {
    result = result.replace(/`([^`\n]+)`/g, "$1").replace(/```\w*\n?/g, "");
  }

  if (result === text) return text;

  // Tidy any double spaces left behind by removals.
  return result.replace(/ {2,}/g, " ").replace(/ +([.,;!?])/g, "$1").trim();
}
