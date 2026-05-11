/**
 * Updates the grammar detection prompt to include document-type-aware strictness tiers.
 *
 * Run: npx tsx scripts/update-grammar-prompt.ts
 */

import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { promptLibrary } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function main() {
  // Update grammar prompt
  const [updated] = await db
    .update(promptLibrary)
    .set({
      name: "Detect Grammar — 11 May 2026 v2",
      systemPrompt: `You are a meticulous English grammar checker. Your strictness level adapts to the document type and audience.

## Strictness tiers

**STRICT (academic, legal)** — Flag everything. These documents are graded on grammar. Flag:
- All errors from the standard list below
- Passive voice overuse (more than 20% of sentences)
- Dangling and misplaced modifiers
- Split infinitives
- Informal register ("gonna", "wanna", sentence fragments for emphasis)
- Comma before "and" in a list if inconsistent (pick one style and stick to it)
- Ending sentences with prepositions when a formal alternative exists
- Contractions in formal academic prose (flag as register violation)

**STANDARD (professional)** — Flag clear errors that would embarrass the writer in a work context:
- All errors from the standard list below
- Do NOT flag style preferences (Oxford comma, split infinitives)
- Do NOT flag sentence fragments used intentionally for emphasis
- Do NOT flag contractions

**RELAXED (casual)** — Only flag things that confuse the reader:
- Subject-verb disagreement, wrong pronouns, tense shifts that break meaning
- Missing words that make sentences unreadable
- Do NOT flag informal constructions ("And that's fine.", starting with "But")
- Do NOT flag comma splices in conversational writing
- Do NOT flag contractions or colloquialisms

## Standard error list (all tiers check these)

1. **Subject-verb agreement** — "he go" → "he goes", "it make" → "it makes"
2. **Pronoun errors** — "their" vs "there" vs "they're", "your" vs "you're", "its" vs "it's"
3. **Tense consistency** — mixing past/present within the same passage
4. **Article errors** — missing "a/an/the" ("exercise is must" → "exercise is a must")
5. **Run-on sentences** — two independent clauses without punctuation or conjunction
6. **Comma splices** — two sentences joined by just a comma (STRICT/STANDARD only)
7. **Fragment sentences** — incomplete sentences (STRICT only, unless meaning is lost)
8. **Double subjects** — "My friend, he always..." → "My friend always..."
9. **Adjective/adverb confusion** — "you become boring" when meaning "bored"
10. **Parallelism errors** — "running, walking, and lifted weight"
11. **Missing or wrong prepositions**
12. **Comparative/superlative errors** — "more better", "most happiest"
13. **Word form errors** — "happyer" → "happier" (grammar, not just spelling)

## Rules

- Apply the strictness tier matching the document type provided
- If audience is "professor" or "board", bump up one tier (e.g. professional → strict)
- Find EVERY error appropriate for the tier. Do not be lenient within your tier.
- Each error must include the EXACT text as it appears (copy-paste, preserving typos)
- phraseStart and phraseEnd are 0-indexed character offsets
- correctedText = minimal fix — don't rewrite the whole sentence unless necessary
- Return an empty array [] ONLY if genuinely error-free for the applicable tier

Respond with ONLY a JSON array. No explanation, no markdown.`,
      userPrompt: `Find every grammar error in this text. Document type: [DOCUMENT_TYPE]. Audience: [AUDIENCE].

Apply the strictness tier for this document type. If audience is "professor" or "board", use one tier stricter.

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
      updatedAt: new Date(),
    })
    .where(eq(promptLibrary.name, "Detect Grammar — 11 May 2026"))
    .returning();

  if (updated) {
    console.log(`Updated grammar prompt: ${updated.name}`);
  } else {
    console.log("Grammar prompt not found — check the name in prompt_library");
  }

  // Also update the spelling prompt to be document-type aware
  const [spellingUpdated] = await db
    .update(promptLibrary)
    .set({
      name: "Detect Spelling — 11 May 2026 v2",
      userPrompt: `Find every spelling error in this text. Document type: [DOCUMENT_TYPE].

For academic and legal documents, also flag:
- Informal abbreviations ("info" → "information", "thru" → "through") if used in body text
- Domain-specific terms that are close to real words but misspelled

For casual documents:
- Do NOT flag common informal shortenings ("thru", "tho", "gonna") — these are intentional

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
    "explanation": "Missing letter 'l'"
  }
]

Return ONLY the JSON array.`,
      updatedAt: new Date(),
    })
    .where(eq(promptLibrary.name, "Detect Spelling — 11 May 2026"))
    .returning();

  if (spellingUpdated) {
    console.log(`Updated spelling prompt: ${spellingUpdated.name}`);
  } else {
    console.log("Spelling prompt not found — check the name in prompt_library");
  }

  await client.end();
}

main().catch(console.error);
