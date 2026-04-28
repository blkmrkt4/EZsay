import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, flagOptions, llmCallLog } from "@/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { executeActivity } from "@/lib/routing/openrouter";
import { checkForCorruption } from "@/lib/analysis/corruption-checker";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { buildIntakeTokens } from "@/lib/prompts/intake-tokens";

/**
 * Generates suggestions for ALL open flags in a document.
 * Called immediately after scanning, not during editing.
 * Returns a streaming response so the UI can show progress.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  const { documentId } = await request.json();

  // Load document
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  // Load all open flags
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId));

  const sectionIds = docSections.map((s) => s.id);
  const allFlags = sectionIds.length > 0
    ? await db.select().from(flags).where(and(inArray(flags.sectionId, sectionIds), or(eq(flags.status, "open"), eq(flags.status, "generation_failed"))))
    : [];

  if (allFlags.length === 0) {
    return NextResponse.json({ success: true, data: { generated: 0, total: 0, results: [] } });
  }

  const docType = doc.documentType || "professional";
  const slug = docType === "academic" ? "suggest-academic" : "suggest-rewrite";
  const intakeTokens = buildIntakeTokens(docType, doc.intake as Record<string, string> | null);

  // Generate suggestions with bounded concurrency (2 workers)
  type FlagResult = { flagId: string; status: "success" | "failed"; optionCount: number; explanation?: string; principle?: string; error?: string };
  const results: FlagResult[] = [];
  const CONCURRENCY = 2;

  // Build a section lookup map for O(1) access
  const sectionMap = new Map(docSections.map((s) => [s.id, s]));

  async function processFlag(flag: typeof allFlags[number], idx: number): Promise<FlagResult> {
    const section = sectionMap.get(flag.sectionId);
    if (!section) {
      return { flagId: flag.id, status: "failed", optionCount: 0, error: "Section not found" };
    }

    // Check if options already exist
    const existing = await db.select({ id: flagOptions.id }).from(flagOptions).where(eq(flagOptions.flagId, flag.id));
    if (existing.length > 0) {
      return { flagId: flag.id, status: "success", optionCount: existing.length, explanation: "Already generated" };
    }

    try {
      console.log(`[suggest-all] Processing flag ${idx + 1}/${allFlags.length}: ${flag.id.slice(0, 8)} (phrase: "${flag.flaggedPhrase?.slice(0, 30)}")`);
      const startTime = Date.now();

      const result = await executeActivity(slug, {
        ...intakeTokens,
        FLAGGED_PHRASE: flag.flaggedPhrase,
        SECTION_TEXT: section.currentText,
        EXPLANATION: flag.explanation,
      });

      const latencyMs = Date.now() - startTime;
      const parsed = parseFullResponse(result.content);

      const cleanOptions = parsed.options.filter((opt) => {
        const issues = checkForCorruption(opt.text);
        if (issues.length > 0) {
          console.warn(`[suggest-all] Filtered corrupt option for flag ${flag.id.slice(0, 8)}: ${issues.map((i) => i.description).join(", ")}`);
          return false;
        }
        return true;
      });

      if (cleanOptions.length > 0) {
        await db.insert(flagOptions).values(
          cleanOptions.map((opt) => ({
            flagId: flag.id,
            text: opt.text,
            modelId: result.modelUsed,
            isBlend: false,
          }))
        );
      }

      await db.insert(llmCallLog).values({
        activityType: slug,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        flagId: flag.id,
        outcome: "pending",
      });

      return {
        flagId: flag.id,
        status: "success",
        optionCount: parsed.options.length,
        explanation: parsed.explanation,
        principle: parsed.principle,
      };
    } catch (err) {
      console.error(`[suggest-all] FAILED flag ${idx + 1}/${allFlags.length} (${flag.id.slice(0, 8)}):`, err instanceof Error ? err.message : err);
      return {
        flagId: flag.id,
        status: "failed",
        optionCount: 0,
        error: err instanceof Error ? err.message : "Generation failed",
      };
    }
  }

  // Process flags with bounded concurrency
  for (let i = 0; i < allFlags.length; i += CONCURRENCY) {
    const batch = allFlags.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((flag, j) => processFlag(flag, i + j))
    );
    results.push(...batchResults);
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`[suggest-all] Done: ${succeeded} succeeded, ${failed} failed out of ${allFlags.length} flags`);

  return NextResponse.json({
    success: true,
    data: {
      generated: succeeded,
      failed,
      total: allFlags.length,
      results,
    },
  });
}

function parseFullResponse(response: string): { explanation: string; principle: string; options: { text: string; note: string }[] } {
  let explanation = "";
  let principle = "";
  const options: { text: string; note: string }[] = [];

  const explMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\s*(?:PRINCIPLE|OPTION)\s*)/i);
  if (explMatch) explanation = explMatch[1].trim();

  const princMatch = response.match(/PRINCIPLE:\s*([\s\S]*?)(?=\n\s*OPTION\s*)/i);
  if (princMatch) principle = princMatch[1].trim();

  const optionBlocks = response.split(/OPTION\s+\d+\s*:/i).filter((b) => b.trim());
  for (const block of optionBlocks) {
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

  if (options.length === 0 && response.trim()) {
    options.push({ text: response.trim(), note: "Alternative version" });
  }

  return { explanation, principle, options: options.slice(0, 5) };
}
