import { db } from "@/db";
import { styleProfiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface StyleSignal {
  patternType: string;
  originalPhrase: string;
  replacement: string;
  signalWeight: "manual_rewrite" | "typed_replacement" | "option_selected" | "rejected";
  documentType: string;
  createdAt: string;
}

const WEIGHT_VALUES: Record<string, number> = {
  manual_rewrite: 3,
  typed_replacement: 2,
  option_selected: 1,
  rejected: -0.5,
};

/**
 * Logs a style signal to the user's profile for the given document type.
 * Fire-and-forget — never blocks the editing UI.
 *
 * Style profiles are split by document type (hard constraint #6).
 * Manual rewrites are weight 3 — highest priority (hard constraint #5).
 */
export async function logStyleSignal(
  userId: string,
  documentType: "academic" | "professional" | "casual" | "legal",
  signal: Omit<StyleSignal, "createdAt">
): Promise<void> {
  const fullSignal: StyleSignal = {
    ...signal,
    createdAt: new Date().toISOString(),
  };

  // Find or create the profile for this user + doc type
  const [existing] = await db
    .select()
    .from(styleProfiles)
    .where(
      and(
        eq(styleProfiles.userId, userId),
        eq(styleProfiles.documentType, documentType)
      )
    )
    .limit(1);

  if (existing) {
    const currentSignals = (existing.signals as StyleSignal[]) || [];
    await db
      .update(styleProfiles)
      .set({
        signals: [...currentSignals, fullSignal],
        updatedAt: new Date(),
      })
      .where(eq(styleProfiles.id, existing.id));
  } else {
    await db.insert(styleProfiles).values({
      userId,
      documentType,
      signals: [fullSignal],
    });
  }
}

/**
 * Returns the weight value for a signal type.
 */
export function getSignalWeight(
  signalWeight: StyleSignal["signalWeight"]
): number {
  return WEIGHT_VALUES[signalWeight] ?? 0;
}
