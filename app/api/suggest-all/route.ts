import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, sections, documents, flagOptions, llmCallLog } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { executeActivity } from "@/lib/routing/openrouter";
import { checkForCorruption } from "@/lib/analysis/corruption-checker";

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
  let allFlags: (typeof flags.$inferSelect)[] = [];
  for (const sid of sectionIds) {
    const sFlags = await db.select().from(flags).where(and(eq(flags.sectionId, sid), or(eq(flags.status, "open"), eq(flags.status, "generation_failed"))));
    allFlags.push(...sFlags);
  }

  if (allFlags.length === 0) {
    return NextResponse.json({ success: true, data: { generated: 0, total: 0, results: [] } });
  }

  const docType = doc.documentType || "professional";
  const slug = docType === "academic" ? "suggest-academic" : "suggest-rewrite";

  // Generate suggestions for each flag
  const results: { flagId: string; status: "success" | "failed"; optionCount: number; explanation?: string; principle?: string; error?: string }[] = [];

  for (let i = 0; i < allFlags.length; i++) {
    const flag = allFlags[i];

    // Small delay between LLM calls to avoid rate limiting
    if (i > 0) await new Promise((r) => setTimeout(r, 500));

    // Get the section for this flag
    const section = docSections.find((s) => s.id === flag.sectionId);
    if (!section) {
      results.push({ flagId: flag.id, status: "failed", optionCount: 0, error: "Section not found" });
      continue;
    }

    // Check if options already exist for this flag
    const existing = await db.select({ id: flagOptions.id }).from(flagOptions).where(eq(flagOptions.flagId, flag.id));
    if (existing.length > 0) {
      results.push({ flagId: flag.id, status: "success", optionCount: existing.length, explanation: "Already generated" });
      continue;
    }

    try {
      console.log(`[suggest-all] Processing flag ${i + 1}/${allFlags.length}: ${flag.id.slice(0, 8)} (phrase: "${flag.flaggedPhrase?.slice(0, 30)}")`);
      const startTime = Date.now();

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

      const latencyMs = Date.now() - startTime;

      // Parse response
      const parsed = parseFullResponse(result.content);

      // Save options — filter out any with corruption artifacts
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

      // Log the call
      await db.insert(llmCallLog).values({
        activityType: slug,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        flagId: flag.id,
        outcome: "pending",
      });

      results.push({
        flagId: flag.id,
        status: "success",
        optionCount: parsed.options.length,
        explanation: parsed.explanation,
        principle: parsed.principle,
      });
    } catch (err) {
      console.error(`[suggest-all] FAILED flag ${i + 1}/${allFlags.length} (${flag.id.slice(0, 8)}):`, err instanceof Error ? err.message : err);

      // Keep flag as "open" so it still appears for manual editing
      // Only log the failure — don't change the flag status
      results.push({
        flagId: flag.id,
        status: "failed",
        optionCount: 0,
        error: err instanceof Error ? err.message : "Generation failed",
      });
    }
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
