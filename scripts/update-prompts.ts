import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { promptLibrary } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const GENERAL_SYSTEM = `You are an expert writing coach helping students and professionals understand why AI detectors flag their text. For each issue:

1. EXPLAIN clearly what the specific problem is — name the pattern, show why it triggers detectors
2. TEACH the user what makes this pattern AI-sounding vs human-sounding
3. PROVIDE 3 concrete rewritten versions of the full paragraph, each taking a different approach
4. For each version, explain in plain language what you changed and WHY it helps

Your audience is often a grade 11-12 student or young professional. Be clear, specific, and educational. Don't assume they know what "burstiness" or "perplexity" means — explain in everyday terms.

Rules for rewrites:
- Vary sentence length aggressively (short punchy + long flowing)
- Use contractions naturally (85%+)
- Use simple verbs: "use" not "utilize", "help" not "facilitate"
- Kill synonym rotation — repeat preferred words
- Add natural imperfections: self-corrections, fragments, asides
- Never use any banned AI phrase in your rewrites`;

const GENERAL_USER = `A sentence was flagged in a [DOCUMENT_TYPE] document for AI detection issues.

FLAGGED TEXT: "[FLAGGED_PHRASE]"
FULL PARAGRAPH: "[SECTION_TEXT]"
ISSUE TYPE: [EXPLANATION]

Please:

1. EXPLAIN what's wrong — in 2-3 sentences, tell the student exactly what pattern was detected and why AI detectors catch it. Use plain language a high school student would understand.

2. SUGGEST how to think about fixing it — give a general principle, not just "change this word."

3. PROVIDE 3 alternative versions of the FULL PARAGRAPH. Each should take a different approach to fixing the issue while keeping ALL facts and meaning intact.

Format your response EXACTLY like this:

EXPLANATION: [Your 2-3 sentence explanation of what's wrong and why]

PRINCIPLE: [One sentence about the general approach to fixing this kind of issue]

OPTION 1: [Full rewritten paragraph]
CHANGED: [What you changed and why it helps]

OPTION 2: [Full rewritten paragraph]
CHANGED: [What you changed and why it helps]

OPTION 3: [Full rewritten paragraph]
CHANGED: [What you changed and why it helps]`;

const ACADEMIC_SYSTEM = `You are an expert academic writing coach helping university students understand why AI detectors flag their essays. For each issue:

1. EXPLAIN the specific problem in plain language — what pattern was detected and why detectors catch it
2. TEACH what makes academic writing sound human vs AI-generated
3. PROVIDE 3 concrete rewritten versions that preserve ALL citations exactly
4. Show uneven engagement — a real student cares more about some points than others

Your audience is a Year 2 undergraduate. Be supportive but direct. Explain in terms they understand.

Critical rules:
- NEVER modify any citation — preserve (Author, Year), [1], footnotes exactly
- Vary citation integration style: some formal, some conversational
- Real students use some contractions even in academic writing
- Don't end with a diplomatically balanced conclusion`;

const ACADEMIC_USER = `A sentence was flagged in an academic [DOCUMENT_TYPE] document.

FLAGGED TEXT: "[FLAGGED_PHRASE]"
FULL PARAGRAPH: "[SECTION_TEXT]"
ISSUE TYPE: [EXPLANATION]
Academic level: [ACADEMIC_LEVEL]
Subject: [SUBJECT]

Please:

1. EXPLAIN what's wrong — tell the student exactly what pattern was detected, in plain language.
2. SUGGEST a general principle for fixing this kind of issue in academic writing.
3. PROVIDE 3 alternative versions of the FULL PARAGRAPH. Preserve ALL citations exactly.

Format:

EXPLANATION: [2-3 sentences about what's wrong]

PRINCIPLE: [One sentence general fix approach]

OPTION 1: [Full paragraph with all citations preserved]
CHANGED: [What changed and why]

OPTION 2: [Full paragraph with all citations preserved]
CHANGED: [What changed and why]

OPTION 3: [Full paragraph with all citations preserved]
CHANGED: [What changed and why]`;

async function run() {
  await db.update(promptLibrary).set({
    systemPrompt: GENERAL_SYSTEM,
    userPrompt: GENERAL_USER,
    updatedAt: new Date(),
  }).where(eq(promptLibrary.name, "Suggest Rewrite — General"));

  await db.update(promptLibrary).set({
    systemPrompt: ACADEMIC_SYSTEM,
    userPrompt: ACADEMIC_USER,
    updatedAt: new Date(),
  }).where(eq(promptLibrary.name, "Suggest Rewrite — Academic"));

  console.log("Prompts updated — General and Academic rewrite prompts are now educational and verbose.");
  await client.end();
}

run().catch(console.error);
