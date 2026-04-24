import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { parseAndSplit } from "@/lib/citations/parser";

/**
 * Reset a document back to its original uploaded text.
 * Clears all flags, options, and re-creates sections from rawText.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await request.json();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  // Delete all existing flags and options
  const docSections = await db.select().from(sections).where(eq(sections.documentId, documentId));
  for (const sec of docSections) {
    const sFlags = await db.select({ id: flags.id }).from(flags).where(eq(flags.sectionId, sec.id));
    for (const f of sFlags) {
      await db.delete(flagOptions).where(eq(flagOptions.flagId, f.id));
    }
    await db.delete(flags).where(eq(flags.sectionId, sec.id));
  }

  // Delete all existing sections
  await db.delete(sections).where(eq(sections.documentId, documentId));

  // Re-parse from original rawText
  const parsed = parseAndSplit(doc.rawText);

  // Re-create sections
  const sectionValues = parsed.sections.map((s, i) => ({
    documentId,
    index: i,
    rawText: s.text,
    currentText: s.text,
    isLocked: s.isLocked,
  }));

  if (sectionValues.length > 0) {
    await db.insert(sections).values(sectionValues);
  }

  // Reset document scores and status
  await db.update(documents).set({
    status: "uploaded",
    aiRiskScore: null,
    writingQualityScore: null,
    aiArtifactScore: null,
    citationsScore: null,
    toneConsistencyScore: null,
    lastRescoreAt: null,
    updatedAt: new Date(),
  }).where(eq(documents.id, documentId));

  console.log(`[reset] Document ${documentId} reset to original text (${sectionValues.length} sections)`);

  return NextResponse.json({
    success: true,
    data: { sectionCount: sectionValues.length },
  });
}
