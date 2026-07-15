import { db } from "@/db";
import { userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

type DocType = "academic" | "professional" | "casual" | "legal";

/**
 * Loads the user's merged style preferences: universal row (documentType null)
 * overlaid with the document-type-specific row. This merge was previously
 * inlined in every LLM route (suggest, evaluate, scan, export) — new code
 * should call this instead.
 */
export async function loadMergedStylePreferences(
  userId: string,
  docType?: string | null,
): Promise<Record<string, unknown>> {
  const [universal] = await db
    .select()
    .from(userStylePreferences)
    .where(and(eq(userStylePreferences.userId, userId), isNull(userStylePreferences.documentType)))
    .limit(1);

  const [typeSpecific] = docType
    ? await db
        .select()
        .from(userStylePreferences)
        .where(
          and(
            eq(userStylePreferences.userId, userId),
            eq(userStylePreferences.documentType, docType as DocType),
          ),
        )
        .limit(1)
    : [undefined];

  return {
    ...((universal?.preferences as Record<string, unknown>) ?? {}),
    ...((typeSpecific?.preferences as Record<string, unknown>) ?? {}),
  };
}
