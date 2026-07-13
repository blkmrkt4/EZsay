import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, flagOptions, llmCallLog, userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { loadBind, callOpenRouter } from "@/lib/routing/openrouter";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { buildIntakeTokens } from "@/lib/prompts/intake-tokens";
import { sanitizeGeneratedText, loadArtifactKeepSet } from "@/lib/analysis/sanitize-generated";

const DIRECTION_INSTRUCTIONS: Record<string, string> = {
  more_casual:
    "Make the replacement more casual and conversational. Use contractions, shorter sentences, and a relaxed tone.",
  more_formal:
    "Make the replacement more formal and polished. Use complete sentences and professional vocabulary.",
  closer_to_original:
    "Keep the replacement as close to the original phrasing as possible. Only change what's necessary to address the flag.",
  simpler:
    "Simplify the replacement. Use shorter words, shorter sentences, and remove any unnecessary complexity.",
};

/**
 * Regenerates a single suggestion option for a flag.
 * Replaces the old option with a new one, guided by an optional direction
 * and negative examples to avoid repeating previous attempts.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  const { flagId, optionId, direction, rejectTexts } = await request.json();

  if (!flagId || !optionId) {
    return NextResponse.json(
      { success: false, error: "flagId and optionId are required" },
      { status: 400 },
    );
  }

  // Load the flag and its section
  const [flag] = await db
    .select()
    .from(flags)
    .where(eq(flags.id, flagId))
    .limit(1);

  if (!flag) {
    return NextResponse.json(
      { success: false, error: "Flag not found" },
      { status: 404 },
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
      { status: 404 },
    );
  }

  // Get document type + verify ownership
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, section.documentId), eq(documents.userId, user.id)),
    )
    .limit(1);

  if (!doc) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Verify the option belongs to this flag
  const [existingOption] = await db
    .select()
    .from(flagOptions)
    .where(and(eq(flagOptions.id, optionId), eq(flagOptions.flagId, flagId)))
    .limit(1);

  if (!existingOption) {
    return NextResponse.json(
      { success: false, error: "Option not found for this flag" },
      { status: 404 },
    );
  }

  const docType = doc.documentType || "professional";
  const slug = docType === "academic" ? "suggest-academic" : "suggest-rewrite";

  // Load user style preferences
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

  const intakeTokens = buildIntakeTokens(
    docType,
    doc.intake as Record<string, string> | null,
    stylePrefs,
  );

  try {
    // Load the bind config to build messages manually
    const config = await loadBind(slug);

    // Build system message (same as executeActivity)
    let systemContent = "";
    if (config.contextText) systemContent += config.contextText;
    if (config.systemPrompt) systemContent += config.systemPrompt;

    // Build user message with token interpolation
    const tokenReplacements: Record<string, string> = {
      ...intakeTokens,
      FLAGGED_PHRASE: flag.flaggedPhrase,
      SECTION_TEXT: section.currentText,
      EXPLANATION: flag.explanation,
    };

    let userContent = config.userPrompt;
    for (const [key, value] of Object.entries(tokenReplacements)) {
      userContent = userContent.replace(
        new RegExp(`\\[${key}\\]`, "g"),
        value,
      );
    }

    // Append regeneration instructions
    const directionText =
      direction && DIRECTION_INSTRUCTIONS[direction]
        ? DIRECTION_INSTRUCTIONS[direction]
        : "";

    const rejectedList = Array.isArray(rejectTexts) ? rejectTexts : [];
    const rejectedBlock =
      rejectedList.length > 0
        ? `\n\nDo NOT repeat or closely resemble any of these previous attempts:\n${rejectedList.map((t: string, i: number) => `--- Previous attempt ${i + 1} ---\n${t}`).join("\n")}`
        : "";

    userContent += `\n\n---\nREGENERATION: Generate exactly ONE alternative replacement for the flagged phrase. Output only the replacement text — no labels, no numbering, no commentary.${directionText ? `\nDirection: ${directionText}` : ""}${rejectedBlock}`;

    const messages = [
      { role: "system" as const, content: systemContent },
      { role: "user" as const, content: userContent },
    ];

    const result = await callOpenRouter(
      messages,
      config.model.openrouterModelId,
      config.fallbacks,
      config.model.temperature,
      config.model.maxTokens,
    );

    // Extract the replacement text — strip any OPTION/EXPLANATION formatting if the model adds it
    let newText = result.content.trim();

    // If the model wrapped it in OPTION formatting, extract just the text
    const optionMatch = newText.match(/OPTION\s+\d+\s*:([\s\S]*?)(?:CHANGED:|$)/i);
    if (optionMatch) {
      newText = optionMatch[1].trim();
    }

    // Strip any leading "EXPLANATION:" or "PRINCIPLE:" blocks
    newText = newText
      .replace(/^EXPLANATION:[\s\S]*?(?=\n\n|\n[A-Z])/i, "")
      .replace(/^PRINCIPLE:[\s\S]*?(?=\n\n|\n[A-Z])/i, "")
      .trim();

    if (!newText || newText.length < 10) {
      return NextResponse.json(
        { success: false, error: "Generated replacement was too short or empty. Please try again." },
        { status: 500 },
      );
    }

    // Replace the old option: delete old, insert new — sanitized so the
    // regenerated text never re-introduces typographic AI artifacts.
    await db.delete(flagOptions).where(eq(flagOptions.id, optionId));

    const [newOption] = await db
      .insert(flagOptions)
      .values({
        flagId: flag.id,
        text: sanitizeGeneratedText(newText, await loadArtifactKeepSet(user.id)),
        modelId: result.modelUsed,
        isBlend: false,
      })
      .returning();

    // Log the LLM call
    await db.insert(llmCallLog).values({
      activityType: `${slug}-regen`,
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
        id: newOption.id,
        flagId: newOption.flagId,
        text: newOption.text,
        isBlend: newOption.isBlend,
      },
    });
  } catch (err) {
    console.error("Regenerate failed:", err);

    const message = err instanceof Error ? err.message : "Regeneration failed";
    const isRateLimit =
      message.includes("Rate limited") || message.includes("429");
    return NextResponse.json(
      {
        success: false,
        error: isRateLimit
          ? "The AI service is temporarily busy. Please wait a moment and try again."
          : "Failed to regenerate suggestion. Please try again.",
      },
      { status: isRateLimit ? 429 : 500 },
    );
  }
}
