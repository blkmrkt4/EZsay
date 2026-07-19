/**
 * Model reroute — 2026-07 cost/quality pass.
 *
 * Retiers every LLM activity to the cheapest model that clears its quality bar
 * (verified against OpenRouter pricing 2026-07-19):
 *   - Rewrites stay Claude Sonnet (4.6) — the one quality-critical prose task —
 *     with Kimi K2.5 + DeepSeek V4 Flash as fallbacks for acceptance-rate A/B.
 *   - Everything else (evaluate, grammar/spelling, tone, plagiarism, citations)
 *     moves to nano/flash/fast tiers.
 *   - Creates the tone-consistency and plagiarism binds so those routes stop
 *     hardcoding models (constraint #7).
 *   - Retires the never-invoked binds (surface/deep/comprehensive-scan,
 *     suggest-tone, expand-prose) by setting isActive = false.
 *
 * Safety:
 *   - Validates every target model ID against OpenRouter's public /models list
 *     and aborts before writing anything if one is unknown.
 *   - Non-destructive to admin choices: a bind's model is only replaced when it
 *     is currently null or still one of the KNOWN_STALE seeded IDs.
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-model-reroute.ts
 */

import { db } from "@/db";
import { activityBinds, modelLibrary, promptLibrary } from "@/db/schema";
import { eq } from "drizzle-orm";

// ── Target models ────────────────────────────────────────────────────────────

const MODELS = [
  { name: "Sonnet 4.6 — Rewrite Generator", openrouterModelId: "anthropic/claude-sonnet-4.6", temperature: 0.7, maxTokens: 2048, description: "Faithful human-voice rewrites — the quality-critical task. Cached system prefix." },
  { name: "Sonnet 4.6 — Academic Rewrite", openrouterModelId: "anthropic/claude-sonnet-4.6", temperature: 0.6, maxTokens: 2048, description: "Academic-register rewrites, citation-safe" },
  { name: "Kimi K2.5 — Rewrite A/B", openrouterModelId: "moonshotai/kimi-k2.5", temperature: 0.7, maxTokens: 2048, description: "Low-slop prose at 1/7th Sonnet output cost — A/B candidate via llm_call_log acceptance" },
  { name: "DeepSeek V4 Flash — Cheap Prose", openrouterModelId: "deepseek/deepseek-v4-flash", temperature: 0.7, maxTokens: 2048, description: "Near-free rewrite fallback / A/B candidate" },
  { name: "GPT-5 Nano — Rewrite Evaluator", openrouterModelId: "openai/gpt-5-nano", temperature: 0.3, maxTokens: 512, description: "Manual-rewrite evaluation is a short classification — nano tier" },
  { name: "Haiku 4.5 — Evaluator Fallback", openrouterModelId: "anthropic/claude-haiku-4.5", temperature: 0.3, maxTokens: 512, description: "Same-family fallback judge" },
  { name: "Gemini 3 Flash — Fast Detection", openrouterModelId: "google/gemini-3-flash-preview", temperature: 0.1, maxTokens: 4096, description: "Grammar/spelling detection and plagiarism query generation" },
  { name: "GPT-5.4 Mini — Verifier", openrouterModelId: "openai/gpt-5.4-mini", temperature: 0.2, maxTokens: 1024, description: "Structured extraction/comparison over search results (citations) — honesty-committee stakes, so mid-tier not nano" },
  { name: "GPT-5.4 Nano — Utility", openrouterModelId: "openai/gpt-5.4-nano", temperature: 0.2, maxTokens: 512, description: "Citation style conversion and other mechanical transforms" },
  { name: "Gemini 3 Flash — Analyzer", openrouterModelId: "google/gemini-3-flash-preview", temperature: 0.2, maxTokens: 1024, description: "Plagiarism assessment — passage vs search snippets" },
  { name: "Gemini 3 Flash — Tone", openrouterModelId: "google/gemini-3-flash-preview", temperature: 0.3, maxTokens: 4096, description: "Whole-document tone/voice consistency read" },
];

// A bind's current model is replaced only when it is one of these (or null).
const KNOWN_STALE = new Set([
  "anthropic/claude-sonnet-4-20250514",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-4o",
]);

// ── Prompts for the new binds (moved verbatim from the routes) ──────────────

const TONE_SYSTEM = `You are a writing consistency analyser. You check for tone and voice consistency ONLY — not grammar, spelling, or sentence correctness.

CRITICAL RULE: Do NOT flag grammar errors, spelling mistakes, missing articles, subject-verb disagreement, or any other language correctness issue. Those are handled by a separate grammar checker. Your job is ONLY about consistency of tone, voice, and register across the document. If the entire document is written in the same (even if poor) style, that is CONSISTENT and should NOT be flagged.

Examine the document for:

1. **Tone shifts** — places where the formality level CHANGES within the document (formal → casual, academic → conversational, or vice versa). The key word is CHANGES — if the whole document is informal, that is consistent, not a tone shift. Only flag when one part differs from the rest.

2. **Voice inconsistencies** — switches between first person ("I argue"), third person ("the author argues"), and passive voice ("it is argued") within the same section. Some mixing is natural, but abrupt switches are a problem.

3. **Register changes** — academic jargon in one paragraph, then plain language in the next. Or British spelling ("colour") mixed with American ("color"). Again, only flag CHANGES, not a consistently informal register. If the user message specifies a target English variant, spelling from a DIFFERENT variant in unquoted text is a register_change issue even when used consistently — but NEVER flag text inside quotation marks; quoted material keeps its source's spelling.

4. **Contradictions** — where the document makes a claim in one place that conflicts with another claim elsewhere.

5. **Repetition** — where the same idea is restated in a different section without adding new insight.

Things that are NOT tone inconsistency (do NOT flag these):
- Grammar errors ("it make you feel" — that's grammar, not tone)
- Spelling mistakes ("importent" — that's spelling, not tone)
- Missing articles ("exercise is must" — that's grammar, not tone)
- Poor writing quality throughout — if it's consistently poor, it's consistent
- Simple or informal language — if the whole document is casual, that's fine

For each issue found, respond with a JSON array entry:

{"type": "tone_shift" | "voice_inconsistency" | "register_change" | "contradiction" | "repetition",
 "severity": "high" | "medium" | "low",
 "passage": "the exact text where the issue occurs (quote it)",
 "explanation": "what the issue is and why it matters",
 "suggestion": "how to fix it"}

Return ONLY a JSON array. If no issues found, return [].
Do not invent issues — only flag genuine inconsistencies.`;

const PLAGIARISM_QUERY_SYSTEM = `You generate web search queries for plagiarism checking.

Given a list of numbered paragraphs from a document, create a targeted search query for EACH paragraph that would find the original source if the paragraph was copied from somewhere.

Rules:
- Create a query for EVERY paragraph — do not skip any
- Extract the most distinctive phrase or claim from each paragraph
- Remove filler words, keep specific names, dates, statistics, and unique phrasing
- For very short paragraphs (titles, headers), use the text as-is

Respond with a JSON array matching the paragraph numbers:
[{"num": 1, "query": "search query here"}, {"num": 2, "query": "..."}, ...]

Return ONLY the JSON array.`;

const PLAGIARISM_ASSESS_SYSTEM = `You assess whether a passage from a student document matches web content found via search.

Plagiarism is using someone else's WORDS or ideas WITHOUT attribution. A passage that names its source with an in-text citation — e.g. "(Christie, 1986)" or "Tuchman's (1978) concept of symbolic annihilation" — and paraphrases the cited ideas is CORRECT academic practice, not plagiarism, even when its phrasing resembles how that theory is normally described in scholarship. Describing a cited theory in standard academic terms is expected; do not flag it.

Given the original passage and search results, determine:
- "plagiarism" — substantial verbatim or near-verbatim wording matches a source and the passage does NOT attribute that source
- "close_match" — the specific WORDING (not just the concept) is near-verbatim to a particular source the passage does not attribute. Requires actual matching phrases visible in the search results — "sounds like academic discourse" or "mirrors how this is typically presented" is NOT sufficient. Never use close_match for a passage whose ideas are attributed with an in-text citation unless its wording is copied nearly word-for-word from a DIFFERENT, uncited source.
- "cited" — the passage attributes its ideas to a source via in-text citation and paraphrases legitimately. This is proper academic writing; nothing to fix.
- "common_knowledge" — basic, universally known facts (dates, definitions, widely documented events) that any informed person would state in nearly identical terms
- "coincidence" — surface similarity but different meaning or context
- "quotation" — the passage is a properly attributed direct quote

Respond in EXACTLY this format:
VERDICT: [plagiarism/close_match/cited/common_knowledge/coincidence/quotation]
CONFIDENCE: [0.0 to 1.0]
EXPLANATION: [2-3 sentences explaining your assessment]
TOP_URL: [the most relevant matching URL, or "none"]
TOP_TITLE: [title of that page, or "none"]
TOP_SNIPPET: [the matching snippet from that page, or "none"]`;

const PROMPTS = [
  {
    name: "Tone Consistency Analyzer",
    description: "Whole-document tone/voice/register consistency check",
    systemPrompt: TONE_SYSTEM,
    userPrompt: "Document type: [DOCUMENT_TYPE]\n[VARIANT_LINE]\n---\n[FULL_TEXT]\n---",
  },
  {
    name: "Plagiarism Search Queries",
    description: "Batched search-query generation for every paragraph",
    systemPrompt: PLAGIARISM_QUERY_SYSTEM,
    userPrompt: "Document type: [DOCUMENT_TYPE]\n\nParagraphs:\n[PARAGRAPHS]",
  },
  {
    name: "Plagiarism Assess",
    description: "Assesses one passage against its web search results",
    systemPrompt: PLAGIARISM_ASSESS_SYSTEM,
    userPrompt: 'PASSAGE FROM DOCUMENT:\n"[PASSAGE]"[CITATION_NOTE]\n\nWEB SEARCH RESULTS:\n[SEARCH_RESULTS]',
  },
];

// ── New binds (constraint #7: these routes previously hardcoded models) ─────

const NEW_BINDS = [
  { slug: "tone-consistency", name: "Tone Consistency", description: "Whole-document tone/voice consistency analysis", promptName: "Tone Consistency Analyzer" },
  { slug: "plagiarism-queries", name: "Plagiarism Search Queries", description: "Generate search queries for the plagiarism check", promptName: "Plagiarism Search Queries" },
  { slug: "plagiarism-assess", name: "Plagiarism Assessment", description: "Assess a passage against web search results", promptName: "Plagiarism Assess" },
];

// ── Routing table: slug → desired primary/fallback model names ──────────────

const ROUTES: { slug: string; primary: string; fb1: string; fb2: string }[] = [
  { slug: "suggest-rewrite", primary: "Sonnet 4.6 — Rewrite Generator", fb1: "Kimi K2.5 — Rewrite A/B", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "suggest-academic", primary: "Sonnet 4.6 — Academic Rewrite", fb1: "Kimi K2.5 — Rewrite A/B", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "evaluate-rewrite", primary: "GPT-5 Nano — Rewrite Evaluator", fb1: "Haiku 4.5 — Evaluator Fallback", fb2: "Gemini 3 Flash — Fast Detection" },
  { slug: "detect-grammar", primary: "Gemini 3 Flash — Fast Detection", fb1: "DeepSeek V4 Flash — Cheap Prose", fb2: "GPT-5.4 Nano — Utility" },
  { slug: "detect-spelling", primary: "Gemini 3 Flash — Fast Detection", fb1: "DeepSeek V4 Flash — Cheap Prose", fb2: "GPT-5.4 Nano — Utility" },
  { slug: "citation-verify", primary: "GPT-5.4 Mini — Verifier", fb1: "Gemini 3 Flash — Analyzer", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "citation-verify-queries", primary: "Gemini 3 Flash — Fast Detection", fb1: "GPT-5.4 Nano — Utility", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "citation-quote-check", primary: "GPT-5.4 Mini — Verifier", fb1: "Gemini 3 Flash — Analyzer", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "citation-find-source", primary: "GPT-5.4 Mini — Verifier", fb1: "Gemini 3 Flash — Analyzer", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "citation-convert", primary: "GPT-5.4 Nano — Utility", fb1: "Gemini 3 Flash — Analyzer", fb2: "GPT-5.4 Mini — Verifier" },
  { slug: "tone-consistency", primary: "Gemini 3 Flash — Tone", fb1: "GPT-5.4 Mini — Verifier", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "plagiarism-queries", primary: "Gemini 3 Flash — Fast Detection", fb1: "GPT-5.4 Nano — Utility", fb2: "DeepSeek V4 Flash — Cheap Prose" },
  { slug: "plagiarism-assess", primary: "Gemini 3 Flash — Analyzer", fb1: "GPT-5.4 Mini — Verifier", fb2: "DeepSeek V4 Flash — Cheap Prose" },
];

// Never invoked by any route — retired from the UI (kept in DB for history).
const RETIRE_SLUGS = ["surface-scan", "deep-scan", "comprehensive-scan", "suggest-tone", "expand-prose"];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function validateModelIds(): Promise<void> {
  const ids = [...new Set(MODELS.map((m) => m.openrouterModelId))];
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`Could not fetch OpenRouter model list (HTTP ${res.status}) — aborting before any DB write.`);
  const data = (await res.json()) as { data: { id: string }[] };
  const available = new Set(data.data.map((m) => m.id));
  const missing = ids.filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown OpenRouter model ID(s): ${missing.join(", ")} — aborting, nothing was changed.`);
  }
  console.log(`✓ all ${ids.length} target model IDs exist on OpenRouter`);
}

async function ensureModel(name: string): Promise<{ id: string; openrouterModelId: string }> {
  const [existing] = await db.select().from(modelLibrary).where(eq(modelLibrary.name, name)).limit(1);
  if (existing) return { id: existing.id, openrouterModelId: existing.openrouterModelId };
  const spec = MODELS.find((m) => m.name === name);
  if (!spec) throw new Error(`No model spec for ${name}`);
  const [created] = await db.insert(modelLibrary).values(spec).returning();
  console.log(`  + model: ${name} (${spec.openrouterModelId})`);
  return { id: created.id, openrouterModelId: created.openrouterModelId };
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

/** True when this model slot may be rerouted: empty, or still a known seeded ID. */
async function isReplaceable(modelId: string | null): Promise<boolean> {
  if (!modelId) return true;
  const [m] = await db.select().from(modelLibrary).where(eq(modelLibrary.id, modelId)).limit(1);
  if (!m) return true;
  return KNOWN_STALE.has(m.openrouterModelId);
}

async function main() {
  await validateModelIds();

  // Create the new binds first (idempotent)
  for (const spec of NEW_BINDS) {
    let [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, spec.slug)).limit(1);
    if (!bind) {
      [bind] = await db
        .insert(activityBinds)
        .values({ slug: spec.slug, name: spec.name, description: spec.description, isSystem: true })
        .returning();
      console.log(`  + bind: ${spec.slug}`);
    }
    if (!bind.promptId) {
      await db.update(activityBinds).set({ promptId: await ensurePrompt(spec.promptName) }).where(eq(activityBinds.id, bind.id));
      console.log(`  ~ wired prompt for ${spec.slug}`);
    }
  }

  // Reroute models
  for (const route of ROUTES) {
    const [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, route.slug)).limit(1);
    if (!bind) {
      console.log(`  ! bind missing, skipped: ${route.slug} (run seed-binds/seed-citation-binds first)`);
      continue;
    }

    const updates: Record<string, string> = {};
    if (await isReplaceable(bind.modelId)) updates.modelId = (await ensureModel(route.primary)).id;
    if (await isReplaceable(bind.fallbackModelId1)) updates.fallbackModelId1 = (await ensureModel(route.fb1)).id;
    if (await isReplaceable(bind.fallbackModelId2)) updates.fallbackModelId2 = (await ensureModel(route.fb2)).id;

    if (Object.keys(updates).length > 0) {
      await db.update(activityBinds).set({ ...updates, updatedAt: new Date() }).where(eq(activityBinds.id, bind.id));
      console.log(`  ~ rerouted ${route.slug}: ${Object.keys(updates).join(", ")} → ${route.primary}`);
    } else {
      console.log(`  = ${route.slug}: admin-customised, left alone`);
    }
  }

  // Retire vestigial binds
  for (const slug of RETIRE_SLUGS) {
    const [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, slug)).limit(1);
    if (bind?.isActive) {
      await db.update(activityBinds).set({ isActive: false, updatedAt: new Date() }).where(eq(activityBinds.id, bind.id));
      console.log(`  - retired: ${slug}`);
    }
  }

  console.log("Model reroute complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
