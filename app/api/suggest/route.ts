import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, flagOptions, llmCallLog, userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { executeActivity } from "@/lib/routing/openrouter";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { buildIntakeTokens } from "@/lib/prompts/intake-tokens";

// Vercel Hobby caps functions at 60s. One LLM call aborts at 45s
// (REQUEST_TIMEOUT_MS), leaving room to return a response within the cap.
export const maxDuration = 60;

/**
 * Generates replacement options for a flag by calling OpenRouter
 * via the Activity Binds system.
 *
 * Uses the slug "suggest-rewrite" for general docs,
 * "suggest-academic" for academic docs.
 *
 * Used as the per-flag path: the on-land fallback (user opens a flag that has no
 * options yet) and the Retry action on a failed flag. Idempotent — if options
 * already exist it returns them rather than generating (and billing) again.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

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

  // Get document type to pick the right slug — also verifies ownership
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, section.documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // Idempotent guard: if this flag already has options, return them instead of
  // regenerating. The background loop and the on-land fallback can both target
  // the same flag; without this they would double-bill an LLM call.
  const existingOptions = await db
    .select()
    .from(flagOptions)
    .where(eq(flagOptions.flagId, flag.id));
  if (existingOptions.length > 0) {
    return NextResponse.json({
      success: true,
      data: {
        explanation: "",
        principle: "",
        options: existingOptions.map((o) => ({ id: o.id, flagId: o.flagId, text: o.text, isBlend: o.isBlend })),
      },
    });
  }

  const docType = doc.documentType || "professional";
  const slug = docType === "academic" ? "suggest-academic" : "suggest-rewrite";

  // Load user style preferences (universal + type-specific merged)
  const [universalPrefs] = await db.select().from(userStylePreferences)
    .where(and(eq(userStylePreferences.userId, user.id), isNull(userStylePreferences.documentType)))
    .limit(1);
  const [typePrefs] = docType
    ? await db.select().from(userStylePreferences)
        .where(and(
          eq(userStylePreferences.userId, user.id),
          eq(userStylePreferences.documentType, docType as "academic" | "professional" | "casual" | "legal"),
        ))
        .limit(1)
    : [undefined];
  const stylePrefs = {
    ...((universalPrefs?.preferences as Record<string, unknown>) ?? {}),
    ...((typePrefs?.preferences as Record<string, unknown>) ?? {}),
  };

  const intakeTokens = buildIntakeTokens(docType, doc.intake as Record<string, string> | null, stylePrefs);

  try {
    // Call OpenRouter via Activity Binds
    const result = await executeActivity(slug, {
      ...intakeTokens,
      FLAGGED_PHRASE: flag.flaggedPhrase,
      SECTION_TEXT: section.currentText,
      EXPLANATION: flag.explanation,
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

    // Clear any prior failed state (e.g. this is a Retry) now that options exist.
    if (flag.status === "generation_failed") {
      await db.update(flags).set({ status: "open" }).where(eq(flags.id, flag.id));
    }

    // Log the LLM call
    await db.insert(llmCallLog).values({
      activityType: slug,
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs ?? 0,
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

    // Mark the flag failed so the UI can show a Retry action instead of a
    // perpetual spinner. The flag still appears in the queue (openFlags includes
    // generation_failed) and stays editable manually.
    await db.update(flags).set({ status: "generation_failed" }).where(eq(flags.id, flag.id));

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
