import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, llmCallLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { executeActivity } from "@/lib/routing/openrouter";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { logStyleSignal } from "@/lib/style/logger";
import { buildIntakeTokens } from "@/lib/prompts/intake-tokens";

/**
 * Evaluates a manual rewrite submitted by the user.
 *
 * - Calls the "evaluate-rewrite" activity bind to assess the rewrite
 * - Logs the style signal at weight "manual_rewrite" (weight 3 — hard constraint #5)
 * - Returns the evaluation feedback
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

  try {
    const { flagId, manualText } = await request.json();

    if (!flagId || !manualText) {
      return NextResponse.json(
        { success: false, error: "flagId and manualText are required" },
        { status: 400 }
      );
    }

    // Load flag → section → document (verify ownership)
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

    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, section.documentId), eq(documents.userId, user.id))
      )
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const docType = doc.documentType || "professional";
    const intakeTokens = buildIntakeTokens(
      docType,
      doc.intake as Record<string, string> | null
    );

    // Call the evaluate-rewrite activity bind
    const result = await executeActivity("evaluate-rewrite", {
      ...intakeTokens,
      FLAGGED_PHRASE: flag.flaggedPhrase,
      SECTION_TEXT: section.currentText,
      MANUAL_TEXT: manualText,
      EXPLANATION: flag.explanation,
    });

    // Parse the evaluation response
    const evaluation = parseEvaluation(result.content);

    // Log the LLM call
    await db.insert(llmCallLog).values({
      activityType: "evaluate-rewrite",
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs ?? 0,
      flagId: flag.id,
      outcome: "pending",
    });

    // Fire-and-forget: log style signal at manual_rewrite weight (3)
    // Hard constraint #5: manual rewrites are the highest-priority style signal
    logStyleSignal(user.id, docType as "academic" | "professional" | "casual" | "legal", {
      patternType: flag.patternType,
      originalPhrase: flag.flaggedPhrase,
      replacement: manualText,
      signalWeight: "manual_rewrite",
      documentType: docType,
    }).catch((err) => console.error("Style logging failed:", err));

    return NextResponse.json({
      success: true,
      data: {
        score: evaluation.score,
        feedback: evaluation.feedback,
        suggestions: evaluation.suggestions,
      },
    });
  } catch (err) {
    console.error("Evaluate failed:", err);
    return NextResponse.json(
      { success: false, error: "Evaluation failed. Please try again." },
      { status: 500 }
    );
  }
}

interface Evaluation {
  score: number;
  feedback: string;
  suggestions: string[];
}

function parseEvaluation(response: string): Evaluation {
  // Try to extract structured fields from LLM response
  const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
  const feedbackMatch = response.match(
    /FEEDBACK:\s*([\s\S]*?)(?=\n\s*SUGGESTION|$)/i
  );
  const suggestionsMatch = response.match(/SUGGESTION[S]?:\s*([\s\S]*)/i);

  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 70;
  const feedback = feedbackMatch?.[1]?.trim() || response.trim();
  const suggestions: string[] = [];

  if (suggestionsMatch) {
    const lines = suggestionsMatch[1]
      .split("\n")
      .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((l) => l.length > 5);
    suggestions.push(...lines);
  }

  return { score, feedback, suggestions };
}
