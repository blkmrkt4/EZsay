/**
 * Adds the [SPELLING_VARIANT] token to the rewrite/evaluate prompts so
 * generated options and manual-rewrite feedback conform to the document's
 * target English variant (British/American/…).
 *
 * The token goes in the USER prompt — executeActivity only interpolates
 * tokens there (system prompts are sent verbatim). buildIntakeTokens always
 * emits SPELLING_VARIANT (a neutral instruction when no variant is set), so
 * the placeholder never leaks raw into LLM input.
 *
 * Idempotent: prompts already containing [SPELLING_VARIANT] are skipped.
 * Prompts are resolved via activityBinds (the bound prompt row), not by name.
 *
 * Run: npx tsx scripts/add-variant-to-prompts.ts
 */

import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { promptLibrary, activityBinds } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const SLUGS = ["suggest-rewrite", "suggest-academic", "suggest-tone", "evaluate-rewrite"];

const VARIANT_RULE = `

English variant requirement: [SPELLING_VARIANT]
All text you produce must follow that rule. Do not change the spelling of words inside quotation marks — quoted material keeps its source's spelling.`;

async function main() {
  for (const slug of SLUGS) {
    const [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, slug)).limit(1);
    if (!bind?.promptId) {
      console.log(`NOT FOUND (no bind/prompt): ${slug}`);
      continue;
    }
    const [prompt] = await db.select().from(promptLibrary).where(eq(promptLibrary.id, bind.promptId)).limit(1);
    if (!prompt) {
      console.log(`NOT FOUND (prompt row missing): ${slug}`);
      continue;
    }
    if ((prompt.userPrompt ?? "").includes("[SPELLING_VARIANT]")) {
      console.log(`Already has [SPELLING_VARIANT]: ${slug} (${prompt.name})`);
      continue;
    }
    await db.update(promptLibrary).set({
      userPrompt: (prompt.userPrompt ?? "") + VARIANT_RULE,
      updatedAt: new Date(),
    }).where(eq(promptLibrary.id, prompt.id));
    console.log(`Updated: ${slug} (${prompt.name})`);
  }

  await client.end();
  console.log("\nDone. Rewrite/evaluate prompts now carry the English-variant requirement.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
