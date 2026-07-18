import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { detectArtifacts } from "@/lib/analysis/artifact-detector";
import { getArtifactReplacement } from "@/lib/analysis/artifact-removals";
import { requireSubscription } from "@/lib/stripe/require-subscription";

/**
 * Bulk-remove artifact instances from all sections of a document.
 * Applies the replacement strategy for each specified artifact item.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  const { documentId, items } = await request.json() as { documentId: string; items: string[] };

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

  const itemSet = new Set(items);
  let totalRemoved = 0;

  for (const section of docSections) {
    if (section.isLocked) continue;

    // Detect artifacts in this section
    const result = detectArtifacts(section.currentText);
    const relevantFindings = result.findings.filter((f) => itemSet.has(f.item));

    if (relevantFindings.length === 0) continue;

    // Collect all instances across all relevant items, sort by position descending
    const allInstances = relevantFindings
      .flatMap((f) => f.instances.map((inst) => ({ ...inst, item: f.item })))
      .filter((inst) => inst.start >= 0 && inst.end > inst.start)
      .sort((a, b) => b.start - a.start); // Reverse order to preserve offsets

    let newText = section.currentText;
    for (const inst of allInstances) {
      const replacement = getArtifactReplacement(inst.item, inst.matchedText);
      newText = newText.slice(0, inst.start) + replacement + newText.slice(inst.end);
      totalRemoved++;
    }

    // Clean up double spaces and empty lines left by removals
    newText = newText.replace(/  +/g, " ").replace(/\n{3,}/g, "\n\n");

    if (newText !== section.currentText) {
      // Optimistic guard: skip this section if something else wrote to it
      // between our read and this write (never clobber a concurrent edit).
      await db
        .update(sections)
        .set({ currentText: newText })
        .where(and(eq(sections.id, section.id), eq(sections.currentText, section.currentText)));
    }
  }

  // Delete any existing individual artifact flags for the removed items
  let deletedFlags = 0;
  for (const section of docSections) {
    // Load all ai_artifact flags for this section
    const sectionFlags = await db.select().from(flags).where(
      and(eq(flags.sectionId, section.id), eq(flags.patternType, "ai_artifact"))
    );

    for (const flag of sectionFlags) {
      const meta = flag.metadata as { artifactItem?: string } | null;
      if (meta?.artifactItem && itemSet.has(meta.artifactItem)) {
        await db.delete(flagOptions).where(eq(flagOptions.flagId, flag.id));
        await db.delete(flags).where(eq(flags.id, flag.id));
        deletedFlags++;
      }
    }
  }

  console.log(`[artifacts/bulk-remove] Removed ${totalRemoved} instances of [${items.join(", ")}], deleted ${deletedFlags} stale flags`);

  return NextResponse.json({
    success: true,
    data: { removedCount: totalRemoved, deletedFlags },
  });
}
