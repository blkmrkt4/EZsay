/**
 * Citation artifact detection.
 *
 * AI-generated reference lists carry tell-tale artifacts: dangling "Wikipedia"
 * fragments, "(Accessed: [insert date])" placeholders, "Various coverage"
 * non-references, editor instructions left in brackets.
 *
 * Patterns live in the phrase library (`library_entries`, category
 * `citation_artifact`) so admins grow the list without code deploys —
 * the same source-of-truth rule as the main scan engine (constraint #8).
 */

import { db } from "@/db";
import { libraryEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { GraphFlag } from "./graph";

export interface ArtifactPattern {
  id: string;
  entryType: "exact_phrase" | "regex_pattern" | "semantic_pattern";
  value: string;
  severity: "high" | "medium" | "low";
  explanation: string;
}

/** Loads active citation-artifact patterns from the phrase library. */
export async function loadCitationArtifacts(): Promise<ArtifactPattern[]> {
  const rows = await db
    .select()
    .from(libraryEntries)
    .where(
      and(
        eq(libraryEntries.status, "active"),
        eq(libraryEntries.category, "citation_artifact"),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    entryType: r.entryType,
    value: r.value,
    severity: r.severity,
    explanation: r.explanation,
  }));
}

export interface ArtifactFlag extends GraphFlag {
  libraryEntryId: string;
}

/**
 * Checks one citation text against the artifact patterns.
 * Regex matches get a removal-based suggested fix; exact phrases flag only
 * (the fix is a rewrite, not a deletion).
 */
export function checkCitationArtifacts(
  text: string,
  patterns: ArtifactPattern[],
): ArtifactFlag[] {
  const flags: ArtifactFlag[] = [];

  for (const p of patterns) {
    if (p.entryType === "exact_phrase") {
      if (text.toLowerCase().includes(p.value.toLowerCase())) {
        flags.push({
          type: "ai_artifact",
          message: p.explanation,
          severity: p.severity === "high" ? "error" : "warning",
          suggestedFix: null,
          libraryEntryId: p.id,
        });
      }
    } else if (p.entryType === "regex_pattern") {
      let re: RegExp;
      try {
        re = new RegExp(p.value, "i");
      } catch {
        continue; // bad pattern in the library — skip, never crash the scan
      }
      if (re.test(text)) {
        const cleaned = text.replace(new RegExp(p.value, "gi"), "").replace(/\s{2,}/g, " ").trim();
        flags.push({
          type: "ai_artifact",
          message: p.explanation,
          severity: p.severity === "high" ? "error" : "warning",
          suggestedFix: cleaned !== text && cleaned.length > 10 ? cleaned : null,
          libraryEntryId: p.id,
        });
      }
    }
    // semantic_pattern entries are not applicable to citation artifacts.
  }

  return flags;
}

/**
 * Removes every regex-pattern artifact from a citation string in one pass.
 * Used to build the suggested corrected text; exact-phrase artifacts are
 * left in place (they need a rewrite, not a deletion).
 */
export function cleanCitationArtifacts(text: string, patterns: ArtifactPattern[]): string {
  let result = text;
  for (const p of patterns) {
    if (p.entryType !== "regex_pattern") continue;
    try {
      result = result.replace(new RegExp(p.value, "gi"), "");
    } catch {
      continue;
    }
  }
  return result
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")   // orphaned space before punctuation
    .replace(/\.(\s*\.)+/g, ".")     // doubled periods left by removals
    .trim();
}
