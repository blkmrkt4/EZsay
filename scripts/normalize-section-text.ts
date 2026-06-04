/**
 * One-time migration: normalizes whitespace artifacts in existing section text.
 *
 * Fixes two PDF extraction artifacts:
 * 1. Soft line breaks (single \n mid-paragraph) → space
 * 2. Multiple consecutive spaces (justified text) → single space
 *
 * Run: npx tsx scripts/normalize-section-text.ts
 * Requires: DATABASE_URL in .env or .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sections } from "../db/schema";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Set it in .env or .env.local");
  process.exit(1);
}

function normalizeText(text: string): string {
  return text
    .replace(/([^\n])\n(?!\n)/g, "$1 ") // unwrap soft line breaks
    .replace(/[ \t]{2,}/g, " ");         // collapse multiple spaces/tabs
}

async function main() {
  const client = postgres(connectionString!);
  const db = drizzle(client);

  const allSections = await db.select().from(sections);
  console.log(`Found ${allSections.length} sections to check.`);

  let updated = 0;

  for (const section of allSections) {
    const newRaw = normalizeText(section.rawText);
    const newCurrent = normalizeText(section.currentText);

    if (newRaw !== section.rawText || newCurrent !== section.currentText) {
      await db
        .update(sections)
        .set({ rawText: newRaw, currentText: newCurrent })
        .where(eq(sections.id, section.id));
      updated++;
    }
  }

  console.log(`Normalized ${updated} of ${allSections.length} sections.`);
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
