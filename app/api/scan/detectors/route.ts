import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { detectSpellingErrors } from "@/lib/analysis/spelling-detector";
import { detectGrammarErrors } from "@/lib/analysis/grammar-detector";
import { batchSections } from "@/lib/analysis/detector-batching";
import { loadArtifactKeepSet } from "@/lib/analysis/sanitize-generated";
import { loadMergedStylePreferences } from "@/lib/style/load-prefs";
import { resolveEnglishVariant } from "@/lib/style/english-variant";

// One batch (one LLM call) per request — client-driven loop, same pattern as
// suggestion generation. Fits the Vercel Hobby 60s cap with room to spare.
export const maxDuration = 60;

const SCORE_FACTOR = { spelling: 5, grammar: 3 } as const;

/**
 * Client-orchestrated spelling/grammar detection.
 *
 * POST { documentId, detector: "spelling" | "grammar" }            → plan:
 *   { batchCount, sectionCount } — how many batches the loop will run.
 * POST { documentId, detector, batch: i, reset?: boolean }          → run:
 *   runs batch i (one LLM call), merges findings into the document row,
 *   returns { batchFindings, totalFindings, batchCount, score }.
 *
 * `reset: true` (sent with batch 0) clears previous results so a re-scan
 * starts fresh. Batches are computed deterministically from the sections,
 * so batch i means the same sections on every request.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    documentId: string;
    detector: "spelling" | "grammar";
    batch?: number;
    reset?: boolean;
  };
  const { documentId, detector, batch, reset } = body;

  if (detector !== "spelling" && detector !== "grammar") {
    return NextResponse.json({ success: false, error: "Invalid detector" }, { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  const batches = batchSections(docSections);

  // Plan call — no batch index given.
  if (batch === undefined || batch === null) {
    return NextResponse.json({
      success: true,
      data: {
        batchCount: batches.length,
        sectionCount: batches.reduce((a, b) => a + b.length, 0),
      },
    });
  }

  if (batch < 0 || batch >= batches.length) {
    return NextResponse.json({ success: false, error: "Batch out of range" }, { status: 400 });
  }

  try {
    const batchSectionsInput = batches[batch];
    const intake = (doc.intake as { audience?: string } | null) ?? {};
    const deadlineAt = Date.now() + 50_000;
    const stylePrefs = await loadMergedStylePreferences(user.id, doc.documentType);
    const targetVariant = resolveEnglishVariant(doc.intake as Record<string, unknown> | null, stylePrefs);

    const findings =
      detector === "spelling"
        ? await detectSpellingErrors(batchSectionsInput, { documentType: doc.documentType, deadlineAt, variant: targetVariant })
        : await detectGrammarErrors(batchSectionsInput, {
            documentType: doc.documentType,
            audience: intake.audience,
            deadlineAt,
            keepItems: await loadArtifactKeepSet(user.id),
            variant: targetVariant,
          });

    // Merge into the stored results: start fresh on reset, otherwise drop any
    // previous findings for this batch's sections (idempotent re-runs), then
    // append the new ones.
    const column = detector === "spelling" ? "spellingResults" : "grammarResults";
    const existing = reset ? [] : ((doc[column] as { sectionId?: string }[] | null) ?? []);
    const batchSectionIds = new Set(batchSectionsInput.map((s) => s.id));
    const kept = existing.filter((f) => !f.sectionId || !batchSectionIds.has(f.sectionId));
    const merged = [...kept, ...findings];

    const score = Math.max(0, 100 - merged.length * SCORE_FACTOR[detector]);

    await db
      .update(documents)
      .set(
        detector === "spelling"
          ? { spellingResults: merged, spellingScore: score, updatedAt: new Date() }
          : { grammarResults: merged, grammarScore: score, updatedAt: new Date() },
      )
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      data: {
        batchFindings: findings.length,
        totalFindings: merged.length,
        batchCount: batches.length,
        score,
      },
    });
  } catch (err) {
    console.error(`[scan/detectors] ${detector} batch ${batch} failed:`, err);
    return NextResponse.json(
      { success: false, error: `${detector} check failed on batch ${batch + 1}.` },
      { status: 500 },
    );
  }
}
