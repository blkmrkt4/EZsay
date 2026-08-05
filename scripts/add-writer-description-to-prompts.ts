/**
 * Adds the [WRITER_DESCRIPTION] token to the rewrite/evaluate prompts so the
 * "How did you use AI?" brief answer actually calibrates the edits (the token
 * was built by buildIntakeTokens on every call but no active prompt carried
 * the placeholder — collected, converted, then silently discarded).
 *
 * The token goes in the USER prompt — executeActivity only interpolates
 * tokens there. buildIntakeTokens now ALWAYS emits WRITER_DESCRIPTION (a
 * neutral baseline when the question wasn't answered), so the placeholder
 * never leaks raw into LLM input.
 *
 * Idempotent: prompts already containing [WRITER_DESCRIPTION] are skipped.
 * Prompts are resolved via activityBinds (the bound prompt row), not by name.
 *
 * Run: npx tsx scripts/add-writer-description-to-prompts.ts
 */

import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { promptLibrary, activityBinds } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const SLUGS = ["suggest-rewrite", "suggest-academic", "evaluate-rewrite"];

const WRITER_RULE = `

About this writer: [WRITER_DESCRIPTION]
Calibrate to that. The goal is this writer's own voice, not a generic "human" one — if they wrote the text themselves, the patterns you see ARE their voice, so change less and preserve more.`;

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
    if ((prompt.userPrompt ?? "").includes("[WRITER_DESCRIPTION]")) {
      console.log(`Already has [WRITER_DESCRIPTION]: ${slug} (${prompt.name})`);
      continue;
    }
    await db.update(promptLibrary).set({
      userPrompt: (prompt.userPrompt ?? "") + WRITER_RULE,
      updatedAt: new Date(),
    }).where(eq(promptLibrary.id, prompt.id));
    console.log(`Updated: ${slug} (${prompt.name})`);
  }

  await client.end();
  console.log("\nDone. Rewrite/evaluate prompts now calibrate to the writer's AI-usage answer.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
