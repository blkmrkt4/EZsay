/**
 * Updates the rewrite suggestion prompts to always fix grammar errors
 * in their output, never preserving them from the original.
 *
 * Run: npx tsx scripts/update-rewrite-prompts.ts
 */

import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { promptLibrary } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const GRAMMAR_RULE = `
CRITICAL: Always fix grammar and spelling errors in your output. Never preserve grammar mistakes from the original text. If the original says "it make you feel healthy", your rewrite must say "it makes you feel healthy". If the original says "importent", write "important". Your output must be grammatically correct even if the original is not. This applies to every option you generate.`;

async function main() {
  // Update "Suggest Rewrite — General"
  const [general] = await db
    .select()
    .from(promptLibrary)
    .where(eq(promptLibrary.name, "Suggest Rewrite — General"))
    .limit(1);

  if (general) {
    const updatedSystem = general.systemPrompt + "\n" + GRAMMAR_RULE;
    await db.update(promptLibrary).set({
      systemPrompt: updatedSystem,
      updatedAt: new Date(),
    }).where(eq(promptLibrary.id, general.id));
    console.log("Updated: Suggest Rewrite — General");
  } else {
    console.log("NOT FOUND: Suggest Rewrite — General");
  }

  // Update "Suggest Rewrite — Academic"
  const [academic] = await db
    .select()
    .from(promptLibrary)
    .where(eq(promptLibrary.name, "Suggest Rewrite — Academic"))
    .limit(1);

  if (academic) {
    const updatedSystem = academic.systemPrompt + "\n" + GRAMMAR_RULE;
    await db.update(promptLibrary).set({
      systemPrompt: updatedSystem,
      updatedAt: new Date(),
    }).where(eq(promptLibrary.id, academic.id));
    console.log("Updated: Suggest Rewrite — Academic");
  } else {
    console.log("NOT FOUND: Suggest Rewrite — Academic");
  }

  // Update "Suggest Tone Edit"
  const [tone] = await db
    .select()
    .from(promptLibrary)
    .where(eq(promptLibrary.name, "Suggest Tone Edit"))
    .limit(1);

  if (tone) {
    const updatedSystem = tone.systemPrompt + "\n" + GRAMMAR_RULE;
    await db.update(promptLibrary).set({
      systemPrompt: updatedSystem,
      updatedAt: new Date(),
    }).where(eq(promptLibrary.id, tone.id));
    console.log("Updated: Suggest Tone Edit");
  } else {
    console.log("NOT FOUND: Suggest Tone Edit");
  }

  await client.end();
  console.log("\nDone. All rewrite prompts now require grammar correction in output.");
}

main().catch(console.error);
