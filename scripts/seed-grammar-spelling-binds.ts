/**
 * Seeds the detect-grammar and detect-spelling activity binds
 * with proper prompts and model config.
 *
 * Run: npx tsx scripts/seed-grammar-spelling-binds.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { modelLibrary, promptLibrary, activityBinds } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  // ── Model: reuse an existing Sonnet model or create a new one ───────────
  console.log("Creating model entry...");
  const [model] = await db.insert(modelLibrary).values({
    openrouterModelId: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet — Grammar & Spelling",
    description: "Precise error detection, low creativity, structured JSON output",
    temperature: 0.1,
    maxTokens: 4096,
  }).returning();
  console.log(`  Model: ${model.name} (${model.id})`);

  // ── Prompt: detect-grammar ──────────────────────────────────────────────
  console.log("\nCreating grammar prompt...");
  const [grammarPrompt] = await db.insert(promptLibrary).values({
    name: "Detect Grammar — 11 May 2026",
    description: "Finds grammar errors in a text section. Returns structured JSON.",
    systemPrompt: `You are a meticulous English grammar checker. Your job is to find every grammar error in the text provided. You catch errors that students and non-native speakers commonly make.

You MUST check for ALL of the following:

1. **Subject-verb agreement** — "he go" should be "he goes", "it make" should be "it makes"
2. **Pronoun errors** — "their" vs "there" vs "they're", "your" vs "you're", "its" vs "it's"
3. **Tense consistency** — mixing past/present within the same passage ("I walked... I go...")
4. **Article errors** — missing "a/an/the" ("exercise is must" → "exercise is a must"), wrong article
5. **Run-on sentences** — two independent clauses joined without proper punctuation or conjunction
6. **Comma splices** — two sentences joined by just a comma ("I like running, it is fun")
7. **Fragment sentences** — incomplete sentences missing a subject or verb
8. **Double subjects** — "My friend, he always..." (should be "My friend always...")
9. **Adjective/adverb confusion** — "you become boring" when meaning "bored"
10. **Parallelism errors** — "running, walking, and lifted weight" (should be "lifting weights")
11. **Missing or wrong prepositions** — "struggle to keep focus at work" vs "keep focused at work"
12. **Comparative/superlative errors** — "more better", "most happiest"
13. **Word form errors** — "happyer" instead of "happier", "importent" instead of "important" (when it's a grammar issue not just spelling)

Rules:
- Find EVERY error. Do not be lenient. Do not assume the writer "meant well."
- Each error must include the EXACT text as it appears (copy-paste from the input, preserving typos)
- phraseStart and phraseEnd are character offsets from the start of the text (0-indexed)
- correctedText must show the minimal fix — don't rewrite the whole sentence unless necessary
- ruleCategory should be a short label like "subject-verb agreement", "pronoun error", "run-on sentence", etc.
- NEVER suggest introducing em dashes (—), en dashes (–), curly/smart quotes, or unicode ellipsis (…). These typographic characters are treated as AI-writing artifacts elsewhere in this product and will be stripped. A spaced hyphen, straight quotes, or three dots are always acceptable — do not flag them, and do not use these typographic characters in correctedText.
- Only flag genuine grammar ERRORS — never stylistic punctuation preferences (e.g. "em dash preferred in formal writing" is NOT an error)
- English variant: the user message states this document's variant rule. All correctedText must use the target variant's spellings and conventions. Variant-specific grammar constructions (e.g. collective-noun agreement, "have got" vs "have gotten") are errors only when a target variant is set and they break it — use ruleCategory "variant" for those. Pure spelling differences (colour vs color) belong to the spelling checker — do not duplicate them here. NEVER flag variant issues inside quotation marks: quoted material keeps its source's conventions.
- Return an empty array [] only if the text is genuinely error-free

Respond with ONLY a JSON array. No explanation, no markdown, no wrapping.`,
    userPrompt: `Find every grammar error in this text. Return a JSON array.

English variant rule for this document: [SPELLING_VARIANT]

Text:
---
[SECTION_TEXT]
---

JSON format per error:
[
  {
    "originalText": "exact text containing the error",
    "correctedText": "the corrected version",
    "phraseStart": 0,
    "phraseEnd": 10,
    "ruleCategory": "subject-verb agreement",
    "explanation": "Brief explanation of the error"
  }
]

Return ONLY the JSON array.`,
  }).returning();
  console.log(`  Prompt: ${grammarPrompt.name} (${grammarPrompt.id})`);

  // ── Prompt: detect-spelling ─────────────────────────────────────────────
  console.log("\nCreating spelling prompt...");
  const [spellingPrompt] = await db.insert(promptLibrary).values({
    name: "Detect Spelling — 11 May 2026",
    description: "Finds spelling errors in a text section. Returns structured JSON.",
    systemPrompt: `You are a meticulous spelling checker. Your job is to find every misspelled word in the text provided. You catch errors that spellcheckers miss and errors common in student writing.

You MUST check for:

1. **Common misspellings** — "importent" → "important", "happyer" → "happier", "mintues" → "minutes"
2. **Homophones used incorrectly** — "their" when it should be "there" (flag as spelling, not grammar)
3. **Missing letters** — "dont" → "don't", "cant" → "can't"
4. **Transposed letters** — "teh" → "the", "recieve" → "receive"
5. **Double letters** — "accomodate" → "accommodate", "occurence" → "occurrence"
6. **English variant conformance** — the user message states this document's variant rule. When a target variant is set (e.g. British English), correctly-spelled words from a DIFFERENT variant (e.g. "color", "organize" in a British document) are errors: report each with "category": "variant" and the target-variant spelling as the correction. When no target variant is set, do NOT flag British vs American differences — both are valid. NEVER flag a word inside quotation marks for variant reasons: quoted material keeps its source's spelling.

Rules:
- Find EVERY misspelled word. Be thorough.
- The "word" field must contain the EXACT misspelled word as it appears in the text
- phraseStart and phraseEnd are character offsets from the start of the text (0-indexed)
- "category" is "variant" for wrong-variant words, "spelling" for ordinary misspellings
- "correction" must be DIFFERENT from "word". Never report a word whose correction is the same spelling — if a word is already correct (including already correct in the target variant), it is not an error and must not appear in the output
- Only flag actual words. Numbers, years, and punctuation tokens (e.g. "2019).") are never spelling errors
- Return an empty array [] only if there are genuinely no spelling errors

Respond with ONLY a JSON array. No explanation, no markdown, no wrapping.`,
    userPrompt: `Find every spelling error in this text. Return a JSON array.

English variant rule for this document: [SPELLING_VARIANT]

Text:
---
[SECTION_TEXT]
---

JSON format per error:
[
  {
    "word": "misspeled",
    "correction": "misspelled",
    "phraseStart": 0,
    "phraseEnd": 9,
    "category": "spelling",
    "explanation": "Missing letter 'l'"
  }
]

Return ONLY the JSON array.`,
  }).returning();
  console.log(`  Prompt: ${spellingPrompt.name} (${spellingPrompt.id})`);

  // ── Bind: detect-grammar ────────────────────────────────────────────────
  console.log("\nBinding detect-grammar...");
  const [existingGrammar] = await db.select().from(activityBinds).where(eq(activityBinds.slug, "detect-grammar")).limit(1);
  if (existingGrammar) {
    await db.update(activityBinds).set({
      modelId: model.id,
      promptId: grammarPrompt.id,
      updatedAt: new Date(),
    }).where(eq(activityBinds.slug, "detect-grammar"));
    console.log("  Updated existing detect-grammar bind");
  } else {
    await db.insert(activityBinds).values({
      slug: "detect-grammar",
      name: "Detect Grammar Errors",
      description: "Scans a text section for grammar errors and returns structured findings",
      isSystem: true,
      isActive: true,
      modelId: model.id,
      promptId: grammarPrompt.id,
      contextIds: [],
    });
    console.log("  Created new detect-grammar bind");
  }

  // ── Bind: detect-spelling ───────────────────────────────────────────────
  console.log("Binding detect-spelling...");
  const [existingSpelling] = await db.select().from(activityBinds).where(eq(activityBinds.slug, "detect-spelling")).limit(1);
  if (existingSpelling) {
    await db.update(activityBinds).set({
      modelId: model.id,
      promptId: spellingPrompt.id,
      updatedAt: new Date(),
    }).where(eq(activityBinds.slug, "detect-spelling"));
    console.log("  Updated existing detect-spelling bind");
  } else {
    await db.insert(activityBinds).values({
      slug: "detect-spelling",
      name: "Detect Spelling Errors",
      description: "Scans a text section for spelling errors and returns structured findings",
      isSystem: true,
      isActive: true,
      modelId: model.id,
      promptId: spellingPrompt.id,
      contextIds: [],
    });
    console.log("  Created new detect-spelling bind");
  }

  console.log("\nDone. Grammar and spelling binds are ready.");
  console.log("You can edit the prompts in Admin > Prompts.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
