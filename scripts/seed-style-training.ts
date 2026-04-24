/**
 * Seeds the Style Training library with all formatting artifacts.
 * Run: npx tsx scripts/seed-style-training.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { styleTraining } from "../db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

interface Item {
  category: string;
  item: string;
  example: string;
  notes: string;
  sortOrder: number;
}

const ITEMS: Item[] = [
  // ── Punctuation ────────────────────────────────────────────────────────
  { category: "Punctuation", item: "Em dashes", example: "\u2014", notes: "The signature AI tell", sortOrder: 1 },
  { category: "Punctuation", item: "En dashes (used as separators)", example: "\u2013", notes: "Different from hyphens", sortOrder: 2 },
  { category: "Punctuation", item: "Unicode ellipsis", example: "\u2026", notes: "Single character vs. three dots ...", sortOrder: 3 },
  { category: "Punctuation", item: "Curly/smart double quotes", example: "\u201C \u201D", notes: 'vs. straight " "', sortOrder: 4 },
  { category: "Punctuation", item: "Curly/smart single quotes", example: "\u2018 \u2019", notes: "vs. straight ' '", sortOrder: 5 },
  { category: "Punctuation", item: "Curly apostrophes mid-word", example: "don\u2019t", notes: "vs. don't", sortOrder: 6 },
  { category: "Punctuation", item: "Non-breaking spaces", example: "(invisible)", notes: "Often before punctuation", sortOrder: 7 },
  { category: "Punctuation", item: "Hair spaces / thin spaces", example: "(invisible)", notes: "Around dashes and punctuation", sortOrder: 8 },
  { category: "Punctuation", item: "Double spaces after periods", example: ".  ", notes: "Two spaces vs. one", sortOrder: 9 },
  { category: "Punctuation", item: "Trailing whitespace", example: "(invisible)", notes: "At line ends", sortOrder: 10 },

  // ── Emojis & Decorative Symbols ────────────────────────────────────────
  { category: "Emojis & Decorative Symbols", item: "Standard emojis", example: "\uD83D\uDE80 \uD83C\uDFAF \u2728 \uD83D\uDCA1", notes: "All emoji characters", sortOrder: 11 },
  { category: "Emojis & Decorative Symbols", item: "Section-opener emojis", example: "\uD83D\uDD25 at heading start", notes: "Decorative, not informational", sortOrder: 12 },
  { category: "Emojis & Decorative Symbols", item: "Sparkles emoji", example: "\u2728", notes: "Especially common AI signature", sortOrder: 13 },
  { category: "Emojis & Decorative Symbols", item: "Checkmarks", example: "\u2713 \u2705", notes: "In running text", sortOrder: 14 },
  { category: "Emojis & Decorative Symbols", item: "Cross marks", example: "\u2717 \u274C", notes: "In running text", sortOrder: 15 },
  { category: "Emojis & Decorative Symbols", item: "Arrow characters", example: "\u2192 \u21D2 \u279C \u27F6", notes: "Used as connectors", sortOrder: 16 },
  { category: "Emojis & Decorative Symbols", item: "Star bullets", example: "\u2605 \u2B50", notes: "As list markers", sortOrder: 17 },
  { category: "Emojis & Decorative Symbols", item: "Decorative dingbats", example: "\u2756 \u25C6 \u276F \u25B8", notes: "As section breaks or bullets", sortOrder: 18 },

  // ── Structural Formatting ──────────────────────────────────────────────
  { category: "Structural Formatting", item: "Horizontal rules", example: "--- ___ ***", notes: "Long line breaks between sections", sortOrder: 19 },
  { category: "Structural Formatting", item: "Excessive headers", example: "H2/H3 on every paragraph", notes: "Turns prose into a deck", sortOrder: 20 },
  { category: "Structural Formatting", item: "Bold lead-ins on bullets", example: "**Speed:** runs fast", notes: "Pattern across every bullet", sortOrder: 21 },
  { category: "Structural Formatting", item: "Deep nested bullet lists", example: "3+ levels of indentation", notes: "Over-organized", sortOrder: 22 },
  { category: "Structural Formatting", item: "Numbered lists for non-sequential items", example: "1. 2. 3. for unordered", notes: "Numbers imply order", sortOrder: 23 },
  { category: "Structural Formatting", item: "Tables for prose content", example: 'Two-column "Topic / Description"', notes: "Should be sentences", sortOrder: 24 },
  { category: "Structural Formatting", item: "Blockquotes for emphasis", example: "> Important point", notes: "Used as styling, not quotation", sortOrder: 25 },
  { category: "Structural Formatting", item: "Bullet lists generally", example: "- item", notes: "Some users want full prose only", sortOrder: 26 },

  // ── Markdown Artifacts ─────────────────────────────────────────────────
  { category: "Markdown Artifacts", item: "Bold markers", example: "**word** __word__", notes: "On individual words for emphasis", sortOrder: 27 },
  { category: "Markdown Artifacts", item: "Italic markers", example: "*word* _word_", notes: "On individual words for emphasis", sortOrder: 28 },
  { category: "Markdown Artifacts", item: "Inline backticks", example: "`term`", notes: "Around non-code terms", sortOrder: 29 },
  { category: "Markdown Artifacts", item: "Code blocks for non-code", example: "```", notes: "Used for quotes, lists, etc.", sortOrder: 30 },
  { category: "Markdown Artifacts", item: "Double line breaks between every paragraph", example: "(spacing)", notes: "Uniform vertical rhythm", sortOrder: 31 },

  // ── Citation & Reference Patterns ──────────────────────────────────────
  { category: "Citation & Reference Patterns", item: "Invented parenthetical citations", example: "(Smith, 2023)", notes: "When source doesn't exist", sortOrder: 32 },
  { category: "Citation & Reference Patterns", item: "Footnote markers without footnotes", example: "\u00B9 \u00B2 \u00B3", notes: "Numbers that lead nowhere", sortOrder: 33 },
  { category: "Citation & Reference Patterns", item: "Bracket citation markers", example: "[1] [2]", notes: "Without bibliography", sortOrder: 34 },
  { category: "Citation & Reference Patterns", item: "Vague attribution phrases", example: '"according to recent studies"', notes: "No actual study named", sortOrder: 35 },
  { category: "Citation & Reference Patterns", item: "Inline URL references", example: "(https://...)", notes: "Mid-sentence URLs", sortOrder: 36 },

  // ── Closing & Sign-off Patterns ────────────────────────────────────────
  { category: "Closing & Sign-off Patterns", item: "Recap paragraphs", example: '"In summary, we covered\u2026"', notes: "Closing summary of what was just said", sortOrder: 37 },
  { category: "Closing & Sign-off Patterns", item: "Helpful-assistant closers", example: '"I hope this helps!"', notes: "AI sign-off voice", sortOrder: 38 },
  { category: "Closing & Sign-off Patterns", item: "Offer-more closers", example: '"Let me know if you\'d like\u2026"', notes: "Service-bot tail", sortOrder: 39 },
  { category: "Closing & Sign-off Patterns", item: "TL;DR boxes", example: '"TL;DR: \u2026"', notes: "Top or bottom summary", sortOrder: 40 },
  { category: "Closing & Sign-off Patterns", item: "Bolded summary line at end", example: "**Bottom line:** \u2026", notes: "The wrap-up bow", sortOrder: 41 },

  // ── Spacing & Layout Tells ─────────────────────────────────────────────
  { category: "Spacing & Layout Tells", item: "One-sentence paragraphs (repeated)", example: "Single sentence on its own line, repeatedly", notes: 'Pattern of "every thought is its own paragraph"', sortOrder: 42 },
  { category: "Spacing & Layout Tells", item: "Blank lines around every header", example: "(spacing)", notes: "Over-aerated layout", sortOrder: 43 },
  { category: "Spacing & Layout Tells", item: "Uniform paragraph length", example: "All paragraphs ~3-5 sentences", notes: "Anti-burstiness signal", sortOrder: 44 },
];

async function seed() {
  console.log(`Seeding ${ITEMS.length} style training items...`);

  for (const item of ITEMS) {
    await db.insert(styleTraining).values(item);
  }

  console.log("Done.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
