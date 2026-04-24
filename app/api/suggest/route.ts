import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, flagOptions, llmCallLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { executeActivity } from "@/lib/routing/openrouter";

/**
 * Generates replacement options for a flag by calling OpenRouter
 * via the Activity Binds system.
 *
 * Uses the slug "suggest-rewrite" for general docs,
 * "suggest-academic" for academic docs.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { flagId } = await request.json();

  // Load the flag and its section
  const [flag] = await db
    .select()
    .from(flags)
    .where(eq(flags.id, flagId))
    .limit(1);

  if (!flag) {
    return NextResponse.json(
      { success: false, error: "Flag not found" },
      { status: 404 }
    );
  }

  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, flag.sectionId))
    .limit(1);

  if (!section) {
    return NextResponse.json(
      { success: false, error: "Section not found" },
      { status: 404 }
    );
  }

  // Get document type to pick the right slug
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, section.documentId))
    .limit(1);

  const docType = doc?.documentType || "professional";
  const slug = docType === "academic" ? "suggest-academic" : "suggest-rewrite";

  try {
    // Call OpenRouter via Activity Binds
    const result = await executeActivity(slug, {
      DOCUMENT_TYPE: docType,
      FLAGGED_PHRASE: flag.flaggedPhrase,
      SECTION_TEXT: section.currentText,
      EXPLANATION: flag.explanation,
      PERSONA: "a pragmatic writer who values clarity over formality",
      VERBAL_TICS: "basically, I mean, honestly",
      ACADEMIC_LEVEL: "Year 2 undergraduate",
      SUBJECT: "the subject area of the document",
      WRITER_DESCRIPTION: "engaged with the core argument but less confident with abstract theory",
    });

    // Parse the full response — explanation, principle, and options
    const parsed = parseFullResponse(result.content, section.currentText);
    const options = parsed.options;

    // Save options to DB
    const insertedOptions = await db
      .insert(flagOptions)
      .values(
        options.map((opt) => ({
          flagId: flag.id,
          text: opt.text,
          modelId: result.modelUsed,
          isBlend: false,
        }))
      )
      .returning();

    // Log the LLM call
    await db.insert(llmCallLog).values({
      activityType: slug,
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: 0, // TODO: measure actual latency
      flagId: flag.id,
      outcome: "pending",
    });

    return NextResponse.json({
      success: true,
      data: {
        explanation: parsed.explanation,
        principle: parsed.principle,
        options: insertedOptions.map((o) => ({
          id: o.id,
          flagId: o.flagId,
          text: o.text,
          isBlend: o.isBlend,
        })),
      },
    });
  } catch (err) {
    console.error("Suggest failed:", err);

    // Keep flag as "open" so it still appears for manual editing

    const message = err instanceof Error ? err.message : "Generation failed";
    const isRateLimit = message.includes("Rate limited") || message.includes("429");
    return NextResponse.json(
      {
        success: false,
        error: isRateLimit
          ? "The AI service is temporarily busy. Please wait a moment and try again."
          : "Failed to generate suggestions. Please try again.",
      },
      { status: isRateLimit ? 429 : 500 },
    );
  }
}

/**
 * Parses the full LLM response including explanation, principle, and options.
 */
function parseFullResponse(
  response: string,
  originalText: string,
): { explanation: string; principle: string; options: { text: string; note: string }[] } {
  let explanation = "";
  let principle = "";
  const options: { text: string; note: string }[] = [];

  // Extract EXPLANATION
  const explMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\s*(?:PRINCIPLE|OPTION)\s*)/i);
  if (explMatch) explanation = explMatch[1].trim();

  // Extract PRINCIPLE
  const princMatch = response.match(/PRINCIPLE:\s*([\s\S]*?)(?=\n\s*OPTION\s*)/i);
  if (princMatch) principle = princMatch[1].trim();

  // Extract OPTIONS
  const optionBlocks = response.split(/OPTION\s+\d+\s*:/i).filter((b) => b.trim());

  for (const block of optionBlocks) {
    // Skip blocks that are actually the explanation/principle
    if (block.includes("EXPLANATION:") || block.includes("PRINCIPLE:")) continue;

    const lines = block.trim().split("\n");
    const changedIdx = lines.findIndex((l) => /^CHANGED:/i.test(l.trim()));

    if (changedIdx >= 0) {
      const text = lines.slice(0, changedIdx).join("\n").trim();
      const note = lines[changedIdx].replace(/^CHANGED:\s*/i, "").trim();
      if (text) options.push({ text, note });
    } else {
      const text = block.trim();
      if (text && text.length > 20) options.push({ text, note: "" });
    }
  }

  // If no structured options found, use the whole response as a single option
  if (options.length === 0 && response.trim()) {
    options.push({ text: response.trim(), note: "Alternative version" });
  }

  return {
    explanation,
    principle,
    options: options.slice(0, 5),
  };
}
