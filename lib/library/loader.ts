import { db } from "@/db";
import { libraryEntries } from "@/db/schema";
import { eq, and, or, arrayContains, inArray } from "drizzle-orm";

export type LoadedEntry = typeof libraryEntries.$inferSelect;

export type Sensitivity = "low" | "medium" | "high";

/**
 * Loads active library entries for a given document type, filtered by sensitivity.
 *
 * Sensitivity maps to the severity field on library entries:
 *   low    = only 'high' severity entries (most obvious AI tells)
 *   medium = 'high' + 'medium' severity (balanced, recommended)
 *   high   = all entries including 'low' severity (aggressive)
 */
export async function loadActiveEntries(
  documentType: string,
  sensitivity: Sensitivity = "medium"
): Promise<LoadedEntry[]> {
  const severities =
    sensitivity === "low" ? ["high"] :
    sensitivity === "medium" ? ["high", "medium"] :
    ["high", "medium", "low"];

  const entries = await db
    .select()
    .from(libraryEntries)
    .where(
      and(
        eq(libraryEntries.status, "active"),
        inArray(libraryEntries.severity, severities as ("high" | "medium" | "low")[]),
        or(
          arrayContains(libraryEntries.documentTypes, ["all"]),
          arrayContains(libraryEntries.documentTypes, [documentType])
        )
      )
    );

  return entries;
}

/**
 * Returns entries grouped by type for the three detection code paths.
 */
export async function loadEntriesByType(
  documentType: string,
  sensitivity: Sensitivity = "medium"
) {
  const entries = await loadActiveEntries(documentType, sensitivity);

  return {
    exactPhrases: entries.filter((e) => e.entryType === "exact_phrase"),
    regexPatterns: entries.filter((e) => e.entryType === "regex_pattern"),
    semanticPatterns: entries.filter((e) => e.entryType === "semantic_pattern"),
  };
}
