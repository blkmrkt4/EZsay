/**
 * Seed script: populates library_entries from ContextLLM.md,
 * seeds prompt_versions from lib/prompts/*.md, and sets up
 * initial prompt_configs and model_configs.
 *
 * Run: npm run seed
 * Requires: DATABASE_URL in .env or .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";
import {
  libraryEntries,
  promptVersions,
  promptConfigs,
  contextVersions,
  modelConfigs,
} from "../db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Set it in .env or .env.local");
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

// ── Phrase extraction from ContextLLM.md ───────────────────────────────────

interface LibraryEntry {
  entryType: "exact_phrase" | "regex_pattern" | "semantic_pattern";
  value: string;
  category:
    | "transition"
    | "corporate_fluff"
    | "hype_word"
    | "sentence_structure"
    | "density"
    | "burstiness"
    | "academic_pattern"
    | "emerging";
  severity: "high" | "medium" | "low";
  explanation: string;
  documentTypes: string[];
  source: "manual";
  status: "active";
}

function parseContextLLM(content: string): LibraryEntry[] {
  const entries: LibraryEntry[] = [];

  // Extract the HIGH PRIORITY KILL LIST (Top 30)
  const killListMatch = content.match(
    /### ⚠️ HIGH PRIORITY KILL LIST.*?\n\n([\s\S]*?)(?=\n###)/
  );
  if (killListMatch) {
    const phrases = killListMatch[1]
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    for (const phrase of phrases) {
      entries.push({
        entryType: "exact_phrase",
        value: phrase,
        category: "hype_word",
        severity: "high",
        explanation: `"${phrase}" is a high-signal AI marker — one of the top 30 phrases flagged by detectors.`,
        documentTypes: ["all"],
        source: "manual",
        status: "active",
      });
    }
  }

  // Section mapping: header → { category, severity, explanation prefix }
  const sectionMap: Record<
    string,
    { category: LibraryEntry["category"]; severity: LibraryEntry["severity"]; explanation: string }
  > = {
    "Transitions and Signposts": {
      category: "transition",
      severity: "medium",
      explanation: "Transition phrase commonly used by AI — sounds robotic when overused.",
    },
    "Corporate and Polished Fluff": {
      category: "corporate_fluff",
      severity: "medium",
      explanation: "Corporate/polished fluff that AI detectors flag — replace with plain language.",
    },
    "Predictable Openers and Clichés": {
      category: "hype_word",
      severity: "high",
      explanation: "Cliché opener AI defaults to — cut it or replace with something specific.",
    },
    "High-Frequency AI Phrases": {
      category: "hype_word",
      severity: "medium",
      explanation: "High-frequency AI phrase — restructure to say the same thing more naturally.",
    },
    "2026-Emerging Red Flag Phrases": {
      category: "emerging",
      severity: "high",
      explanation: "Newly flagged AI pattern (2026) — detectors are catching this now.",
    },
    "Hedging Phrases AI Defaults To": {
      category: "hype_word",
      severity: "medium",
      explanation: "AI hedging phrase — either commit to the statement or cut the hedge.",
    },
    "Red Flag Individual Words": {
      category: "hype_word",
      severity: "low",
      explanation: "Individual word that AI uses more than humans — prefer a simpler alternative.",
    },
  };

  // Extract each section's phrases
  for (const [heading, config] of Object.entries(sectionMap)) {
    const regex = new RegExp(
      `### ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n###|\\n---)`
    );
    const match = content.match(regex);
    if (!match) continue;

    const phrases = match[1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith("*"));

    for (const phrase of phrases) {
      // Skip if already in kill list
      if (entries.some((e) => e.value === phrase.toLowerCase())) continue;

      entries.push({
        entryType: "exact_phrase",
        value: phrase.toLowerCase(),
        category: config.category,
        severity: config.severity,
        explanation: config.explanation,
        documentTypes: ["all"],
        source: "manual",
        status: "active",
      });
    }
  }

  // Extract banned sentence structures as regex patterns
  const structureSection = content.match(
    /### Banned Sentence-Level Structures[\s\S]*?(?=\n---)/
  );
  if (structureSection) {
    const structurePatterns: { pattern: string; explanation: string }[] = [
      {
        pattern: "this is where .+ comes? in",
        explanation: "Overused pivot structure — introduce the concept directly instead.",
      },
      {
        pattern: "the beauty of .+ is that",
        explanation: "AI cliché — just state the benefit directly.",
      },
      {
        pattern: ".+ is more than just .+ — it's",
        explanation: "Theatrical reframe structure AI defaults to — say what it is directly.",
      },
      {
        pattern: "whether you're .+ or .+,",
        explanation: "False-inclusive opener — pick your actual audience.",
      },
      {
        pattern: "from .+ to .+,",
        explanation: "Range-sweep opener — be specific instead of sweeping.",
      },
      {
        pattern: "think of it as",
        explanation: "Analogy bridge — just use the analogy without announcing it.",
      },
      {
        pattern: "not only .+, but also",
        explanation: "Correlative conjunction overuse — say both things without the structure.",
      },
      {
        pattern: "the question isn't .+, it's",
        explanation: "Rhetorical reframe — just state your point.",
      },
      {
        pattern: "it's not about .+, it's about",
        explanation: "False dichotomy pivot — restructure entirely.",
      },
      {
        pattern: "here's (the kicker|where it gets interesting)",
        explanation: "Manufactured suspense — let the content create its own interest.",
      },
      {
        pattern: "let that sink in",
        explanation: "Fake gravitas — cut it entirely.",
      },
      {
        pattern: "and that's (a good thing|okay)",
        explanation: "Dismissive reassurance — either argue why or cut.",
      },
      {
        pattern: "if you're anything like me",
        explanation: "False intimacy — don't assume shared experience.",
      },
      {
        pattern: "the real question is",
        explanation: "Rhetorical reframe — just state the question or point.",
      },
      {
        pattern: "can we talk about .+\\?",
        explanation: "Rhetorical permission-seeking — just talk about it.",
      },
      {
        pattern: "i'll say it:",
        explanation: "Manufactured boldness — just say the thing.",
      },
      {
        pattern: "let me be clear",
        explanation: "Political speech pattern — not natural writing.",
      },
      {
        pattern: "here's what nobody tells you about",
        explanation: "Clickbait framing — cuts credibility.",
      },
      {
        pattern: "\\. full stop\\.",
        explanation: "Forced emphasis that reads as performative — trust the statement.",
      },
    ];

    for (const { pattern, explanation } of structurePatterns) {
      entries.push({
        entryType: "regex_pattern",
        value: pattern,
        category: "sentence_structure",
        severity: "high",
        explanation,
        documentTypes: ["all"],
        source: "manual",
        status: "active",
      });
    }
  }

  // Semantic patterns — always seeded
  const semanticPatterns: {
    value: string;
    category: LibraryEntry["category"];
    severity: LibraryEntry["severity"];
    explanation: string;
  }[] = [
    {
      value: "synonym_rotation",
      category: "burstiness",
      severity: "high",
      explanation:
        "Same concept described with different synonyms — humans repeat their preferred words.",
    },
    {
      value: "uniform_paragraph_length",
      category: "burstiness",
      severity: "medium",
      explanation:
        "Paragraphs are suspiciously uniform in length — human writing has dramatic length variation.",
    },
    {
      value: "uniform_sentence_length",
      category: "burstiness",
      severity: "medium",
      explanation:
        "Sentences cluster at the same length — mix short punchers with long compound-complex ones.",
    },
    {
      value: "uniform_information_density",
      category: "density",
      severity: "medium",
      explanation:
        "Every sentence carries equal weight — add breathing room, restatements, and casual observations.",
    },
    {
      value: "missing_contractions",
      category: "burstiness",
      severity: "low",
      explanation:
        "Contraction rate is too low — human writing uses contractions in 85%+ of cases.",
    },
    {
      value: "transition_cycling",
      category: "transition",
      severity: "medium",
      explanation:
        "Same transition words repeat in a predictable pattern — vary or drop transitions entirely.",
    },
    {
      value: "absent_personal_voice",
      category: "burstiness",
      severity: "high",
      explanation:
        "No tangents, self-corrections, fragments, or opinion hedging — add personal voice markers.",
    },
  ];

  for (const sp of semanticPatterns) {
    entries.push({
      entryType: "semantic_pattern",
      value: sp.value,
      category: sp.category,
      severity: sp.severity,
      explanation: sp.explanation,
      documentTypes: ["all"],
      source: "manual",
      status: "active",
    });
  }

  return entries;
}

// ── Prompt file seeding ────────────────────────────────────────────────────

interface PromptSeed {
  activityType: string;
  filename: string;
  name: string;
}

const promptSeeds: PromptSeed[] = [
  { activityType: "scan_general", filename: "detection-pass.md", name: "Default scan (general)" },
  { activityType: "scan_academic", filename: "academic-detection.md", name: "Default scan (academic)" },
  { activityType: "suggest_rewrite", filename: "faithful-rewrite.md", name: "Default rewrite" },
  { activityType: "suggest_academic", filename: "academic-rewrite.md", name: "Default academic rewrite" },
  { activityType: "suggest_tone", filename: "tone-edit.md", name: "Default tone edit" },
  { activityType: "evaluate_rewrite", filename: "faithful-rewrite.md", name: "Default evaluate" },
  { activityType: "expand_prose", filename: "expand-prose.md", name: "Default expand prose" },
];

const defaultModels = {
  primaryModel: "anthropic/claude-sonnet-4-20250514",
  fallbackModel1: "google/gemini-2.5-flash-preview",
  fallbackModel2: "openai/gpt-4o",
};

// ── Main seed function ─────────────────────────────────────────────────────

async function seed() {
  console.log("Starting seed...\n");

  // 1. Seed library entries
  const contextPath = join(__dirname, "..", "lib", "prompts", "context.md");
  const contextContent = readFileSync(contextPath, "utf-8");
  const libraryData = parseContextLLM(contextContent);

  console.log(`Parsed ${libraryData.length} library entries from ContextLLM.md`);

  const insertedLibrary = await db
    .insert(libraryEntries)
    .values(libraryData)
    .onConflictDoNothing()
    .returning({ id: libraryEntries.id });

  console.log(`Inserted ${insertedLibrary.length} library entries\n`);

  // 2. Seed context version
  const [contextVersion] = await db
    .insert(contextVersions)
    .values({
      name: "Initial ContextLLM (The Lean Monk 2026)",
      contextText: contextContent,
      isActive: true,
    })
    .returning({ id: contextVersions.id });

  console.log(`Seeded context version: ${contextVersion.id}\n`);

  // 3. Seed prompt versions and configs
  const promptsDir = join(__dirname, "..", "lib", "prompts");

  for (const seed of promptSeeds) {
    const filePath = join(promptsDir, seed.filename);
    const promptText = readFileSync(filePath, "utf-8");

    // Create prompt version
    const [version] = await db
      .insert(promptVersions)
      .values({
        activityType: seed.activityType,
        name: seed.name,
        promptText,
      })
      .returning({ id: promptVersions.id });

    // Create model config
    const [modelConfig] = await db
      .insert(modelConfigs)
      .values({
        activityType: seed.activityType,
        ...defaultModels,
      })
      .onConflictDoNothing()
      .returning({ id: modelConfigs.id });

    // Create prompt config pointing to the version and model config
    await db
      .insert(promptConfigs)
      .values({
        activityType: seed.activityType,
        activeVersionId: version.id,
        modelConfigId: modelConfig?.id,
      })
      .onConflictDoNothing();

    console.log(`Seeded: ${seed.activityType} → ${seed.name}`);
  }

  console.log("\nSeed complete.");
  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
