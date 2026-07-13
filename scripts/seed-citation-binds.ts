/**
 * Seeds model_library, prompt_library, and activity_binds rows for the
 * citation activities, moving the previously hardcoded prompts and models
 * into admin-panel control (constraint #7).
 *
 * Idempotent and non-destructive: creates missing rows, and only wires a
 * bind's model/prompt/fallbacks when those fields are currently null —
 * admin customisations are never overwritten.
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-citation-binds.ts
 */

import { db } from "@/db";
import { activityBinds, modelLibrary, promptLibrary } from "@/db/schema";
import { eq } from "drizzle-orm";

// ── Prompts (moved verbatim from app/api/citations/route.ts) ────────────────

const VERIFY_QUERY_SYSTEM = `You generate web search queries to verify academic citations.

For each numbered citation, create a search query that would find the original publication if it exists. Include the author's surname, year, and the most distinctive words from the title.

Respond with a JSON array:
[{"num": 1, "query": "search query here"}, ...]

Return ONLY the JSON array.`;

const VERIFY_ASSESS_V2_SYSTEM = `You verify whether an academic or media citation is real by comparing it against web search results, checking each field independently.

Verdicts:
- "verified" — a matching publication exists: author, year, and title are all consistent with the search results
- "wrong_details" — the publication clearly exists but one or more cited fields are wrong (wrong year, wrong author or author order, wrong title wording, wrong journal/publisher/outlet). This includes cases where the TITLE exists but is attributed to the wrong author, or the AUTHOR exists but with a different title — check title and author INDEPENDENTLY.
- "fabricated" — no plausible matching publication can be found; the citation appears invented
- "uncertain" — search results are insufficient to decide either way

Also sanity-check internal plausibility using your general knowledge: impossible dates (e.g. an article naming a suspect before they were publicly identified, coverage of a sentencing dated before the sentencing occurred), publishers that don't publish in that field, and similar contradictions.

Respond in EXACTLY this format (one line each):
VERDICT: [verified/wrong_details/fabricated/uncertain]
CONFIDENCE: [0.0 to 1.0]
FIELD_AUTHOR: [ok/wrong/unknown] | [correct value or n/a]
FIELD_YEAR: [ok/wrong/unknown] | [correct value or n/a]
FIELD_TITLE: [ok/wrong/unknown] | [correct value or n/a]
FIELD_SOURCE: [ok/wrong/unknown] | [correct journal/publisher/outlet or n/a]
PLAUSIBILITY: [one-sentence note on internal impossibilities, or "none"]
EXPLANATION: [2-4 sentences: what you found, what matches, what doesn't]
CORRECT_CITATION: [fully corrected citation in the same style if fixable, otherwise "n/a"]
SOURCE_URL: [URL of the best matching source if found, otherwise "none"]`;

const VERIFY_ASSESS_SYSTEM = `You verify whether an academic citation is real by comparing it to web search results.

Given the citation and search results, determine:
- "verified" — search results confirm this publication exists with matching author, year, and title
- "wrong_details" — a similar publication exists but some details are wrong (year, author spelling, title, journal)
- "unverified" — no matching publication found in search results
- "uncertain" — partial match, cannot confirm or deny

Respond in EXACTLY this format:
VERDICT: [verified/wrong_details/unverified/uncertain]
CONFIDENCE: [0.0 to 1.0]
EXPLANATION: [2-3 sentences about what you found or didn't find]
CORRECT_CITATION: [the corrected citation text if wrong_details, otherwise "n/a"]
SOURCE_URL: [URL of the matching source if found, otherwise "none"]`;

const QUOTE_CHECK_SYSTEM = `You check whether a quotation is genuine and fairly used, given the source text.

You receive: the quotation as used in the document, the writer's sentence around it (their claim), and an excerpt of the source.

Assess two things INDEPENDENTLY:
1. QUOTE_MATCH — is the quotation actually in the source?
   - verbatim: the exact wording appears
   - near: minor differences (punctuation, one or two words)
   - paraphrase: the idea appears but the wording differs substantially
   - not_found: nothing like it appears in the excerpt
2. CONTEXT — does the writer's claim fairly represent what the source argues?
   - faithful: the claim matches the source's meaning and context
   - misrepresented: the claim distorts, inverts, or overstates what the source says
   - unclear: cannot tell from the excerpt

Be strict about CONTEXT: a quote can be word-for-word accurate and still be used to support a claim the source does not make.

Respond in EXACTLY this format (one line each; SUGGESTED_REWRITE may be a full sentence):
QUOTE_MATCH: [verbatim/near/paraphrase/not_found]
CONTEXT: [faithful/misrepresented/unclear]
CONFIDENCE: [0.0 to 1.0]
ACTUAL_ARGUMENT: [one sentence: what the source actually says on this point, or "n/a"]
SUGGESTED_REWRITE: [if misrepresented: a sentence the writer could use instead that is faithful to the source, or "n/a"]
EXPLANATION: [2-3 sentences]`;

const CONVERT_SYSTEM = `You convert citations from one academic style to another.

Rules:
- Do NOT change any factual content (authors, year, title, journal, DOI, URL, page numbers)
- Only change formatting, punctuation, and structure to match the target style
- Return ONLY the converted citation text, nothing else — no explanation, no prefix

Style formats:
- APA: (Author, Year) inline; Author, A. A. (Year). Title. Journal, Vol(Issue), Pages. for references
- Harvard: (Author Year) inline; Author, A.A. Year, Title, Journal, vol. X, no. Y, pp. Z. for references
- MLA: (Author Page) inline; Author. "Title." Journal, vol. X, no. Y, Year, pp. Z. for references
- Chicago: [1] footnote inline; Author. Title. Journal Vol, no. Issue (Year): Pages. for references
- Oxford: footnote inline; Author, Title (Place: Publisher, Year), Pages. for references`;

// ── Desired configuration ────────────────────────────────────────────────────

const MODELS = [
  { name: "Gemini Flash — Citation Search Queries", openrouterModelId: "google/gemini-2.5-flash", temperature: 0.1, maxTokens: 2048, description: "Fast, cheap query generation for citation verification" },
  { name: "Claude Sonnet — Citation Converter", openrouterModelId: "anthropic/claude-sonnet-4", temperature: 0.2, maxTokens: 512, description: "Citation style conversion, low creativity" },
  { name: "Claude Sonnet — Quote Checker", openrouterModelId: "anthropic/claude-sonnet-4", temperature: 0.2, maxTokens: 1024, description: "Quote verification: verbatim match + misrepresentation check against source text" },
  { name: "Gemini Pro — Fallback", openrouterModelId: "google/gemini-2.5-pro", temperature: 0.2, maxTokens: 1024, description: "Fallback model for citation activities" },
  { name: "GPT-4o — Fallback", openrouterModelId: "openai/gpt-4o", temperature: 0.2, maxTokens: 1024, description: "Second fallback model for citation activities" },
];

const PROMPTS = [
  {
    name: "Citation Verify — Search Queries",
    description: "Generates search queries for citation existence checks",
    systemPrompt: VERIFY_QUERY_SYSTEM,
    userPrompt: "Citations to verify:\n[CITATIONS]",
  },
  {
    name: "Citation Verify — Assess",
    description: "Assesses citation reality against web search results",
    systemPrompt: VERIFY_ASSESS_SYSTEM,
    userPrompt: 'CITATION:\n"[CITATION]"\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  },
  {
    name: "Citation Verify — Assess (field diff)",
    description: "Field-level citation verification: author/year/title/source checked independently, with plausibility sanity check",
    systemPrompt: VERIFY_ASSESS_V2_SYSTEM,
    userPrompt: 'CITATION:\n"[CITATION]"\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  },
  {
    name: "Citation Convert",
    description: "Converts a citation from one style to another",
    systemPrompt: CONVERT_SYSTEM,
    userPrompt: "Convert from [SOURCE_STYLE] to [TARGET_STYLE]:\n[CITATION]",
  },
  {
    name: "Citation Quote Check",
    description: "Verifies a quotation against fetched source text: verbatim match + faithful-use check",
    systemPrompt: QUOTE_CHECK_SYSTEM,
    userPrompt: 'DOCUMENT QUOTE:\n"[QUOTE]"\n\nWRITER\'S SENTENCE:\n[CLAIM]\n\nSOURCE EXCERPT:\n[EXCERPT]',
  },
];

const BINDS: {
  slug: string;
  name: string;
  description: string;
  modelName: string | null; // null = leave the bind's existing model alone
  promptName: string;
}[] = [
  {
    slug: "citation-verify-queries",
    name: "Citation Search Queries",
    description: "Generate web search queries for citation verification",
    modelName: "Gemini Flash — Citation Search Queries",
    promptName: "Citation Verify — Search Queries",
  },
  {
    slug: "citation-verify",
    name: "Citation Verification",
    description: "Verify citation accuracy via web search",
    modelName: null, // existing bind already carries a model
    promptName: "Citation Verify — Assess",
  },
  {
    slug: "citation-convert",
    name: "Citation Style Conversion",
    description: "Convert citations between academic styles",
    modelName: "Claude Sonnet — Citation Converter",
    promptName: "Citation Convert",
  },
  {
    slug: "citation-quote-check",
    name: "Citation Quote Check",
    description: "Verify quotations against fetched source text",
    modelName: "Claude Sonnet — Quote Checker",
    promptName: "Citation Quote Check",
  },
];

async function ensureModel(name: string): Promise<string> {
  const [existing] = await db.select().from(modelLibrary).where(eq(modelLibrary.name, name)).limit(1);
  if (existing) return existing.id;
  const spec = MODELS.find((m) => m.name === name);
  if (!spec) throw new Error(`No model spec for ${name}`);
  const [created] = await db.insert(modelLibrary).values(spec).returning();
  console.log(`  + model: ${name}`);
  return created.id;
}

async function ensurePrompt(name: string): Promise<string> {
  const [existing] = await db.select().from(promptLibrary).where(eq(promptLibrary.name, name)).limit(1);
  if (existing) return existing.id;
  const spec = PROMPTS.find((p) => p.name === name);
  if (!spec) throw new Error(`No prompt spec for ${name}`);
  const [created] = await db.insert(promptLibrary).values(spec).returning();
  console.log(`  + prompt: ${name}`);
  return created.id;
}

async function main() {
  const fallback1 = await ensureModel("Gemini Pro — Fallback");
  const fallback2 = await ensureModel("GPT-4o — Fallback");

  for (const spec of BINDS) {
    let [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, spec.slug)).limit(1);
    if (!bind) {
      [bind] = await db
        .insert(activityBinds)
        .values({ slug: spec.slug, name: spec.name, description: spec.description, isSystem: true })
        .returning();
      console.log(`  + bind: ${spec.slug}`);
    }

    const updates: Partial<typeof bind> = {};
    if (!bind.modelId && spec.modelName) updates.modelId = await ensureModel(spec.modelName);
    if (!bind.promptId) updates.promptId = await ensurePrompt(spec.promptName);
    if (!bind.fallbackModelId1) updates.fallbackModelId1 = fallback1;
    if (!bind.fallbackModelId2) updates.fallbackModelId2 = fallback2;

    if (Object.keys(updates).length > 0) {
      await db.update(activityBinds).set(updates).where(eq(activityBinds.id, bind.id));
      console.log(`  ~ wired ${spec.slug}: ${Object.keys(updates).join(", ")}`);
    } else {
      console.log(`  = ${spec.slug} already fully configured`);
    }
  }

  // Upgrade: point citation-verify at the field-diff assess prompt (v2) —
  // but only when its current prompt is one of the known seeded prompts, so
  // an admin's custom prompt is never overwritten.
  const [verifyBind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, "citation-verify")).limit(1);
  if (verifyBind?.promptId) {
    const [currentPrompt] = await db.select().from(promptLibrary).where(eq(promptLibrary.id, verifyBind.promptId)).limit(1);
    const knownSeeded = ["Citation Verification", "Citation Verify — Assess"];
    if (currentPrompt && knownSeeded.includes(currentPrompt.name)) {
      const v2Id = await ensurePrompt("Citation Verify — Assess (field diff)");
      await db.update(activityBinds).set({ promptId: v2Id }).where(eq(activityBinds.id, verifyBind.id));
      console.log(`  ~ upgraded citation-verify prompt: "${currentPrompt.name}" → field diff (v2)`);
    }
  }

  console.log("Citation binds seeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
