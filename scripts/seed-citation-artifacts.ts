/**
 * Seeds the phrase library with citation-artifact patterns (category
 * `citation_artifact`). Idempotent: skips any value that already exists.
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-citation-artifacts.ts
 */

import { db } from "@/db";
import { libraryEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const ARTIFACTS: {
  entryType: "exact_phrase" | "regex_pattern";
  value: string;
  severity: "high" | "medium" | "low";
  explanation: string;
}[] = [
  {
    entryType: "regex_pattern",
    value: "(?:\\s|^)Wikipedia\\s*\\.?\\s*$",
    severity: "high",
    explanation:
      "Dangling \"Wikipedia\" at the end of the reference — a copy-paste artifact from AI-generated output. Remove it.",
  },
  {
    entryType: "regex_pattern",
    value: "\\(Accessed:\\s*\\[[^\\]]*\\][^)]*\\)",
    severity: "high",
    explanation:
      "Unfilled access-date placeholder, e.g. \"(Accessed: [insert date])\". Replace with the real date you accessed the source.",
  },
  {
    entryType: "regex_pattern",
    value: "\\[insert[^\\]]{0,40}\\]",
    severity: "high",
    explanation: "Unfilled \"[insert …]\" placeholder left in the text.",
  },
  {
    entryType: "regex_pattern",
    value: "\\[(?:date|url|live url|link|pages?)\\]",
    severity: "high",
    explanation: "Unfilled placeholder token such as [date] or [URL] — fill in the real value.",
  },
  {
    entryType: "regex_pattern",
    value: "\\[(?:pull|retrieve|find|search)[^\\]]{0,60}\\]",
    severity: "high",
    explanation:
      "Editor instruction left inside the reference text (e.g. \"[pull live URL from bbc.co.uk]\"). Complete the instruction and remove it.",
  },
  {
    entryType: "exact_phrase",
    value: "Various coverage",
    severity: "high",
    explanation:
      "\"Various coverage\" is not an acceptable reference — cite a specific article with author, title, and date.",
  },
  {
    entryType: "regex_pattern",
    value: "\\(Accessed:\\s*\\d{1,2}\\s+[A-Za-z]+\\s*\\)",
    severity: "medium",
    explanation:
      "Access date is missing its year, e.g. \"(Accessed: 10 July)\" — use a full date like \"(Accessed: 10 July 2026)\".",
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const artifact of ARTIFACTS) {
    const [existing] = await db
      .select({ id: libraryEntries.id })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.value, artifact.value),
          eq(libraryEntries.category, "citation_artifact"),
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(libraryEntries).values({
      entryType: artifact.entryType,
      value: artifact.value,
      category: "citation_artifact",
      severity: artifact.severity,
      explanation: artifact.explanation,
      documentTypes: ["all"],
      status: "active",
      source: "manual",
    });
    inserted++;
  }

  console.log(`Citation artifacts seeded: ${inserted} inserted, ${skipped} already present.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
