import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { SpellingFinding } from "@/lib/analysis/grammar-spelling-types";
import { requireSubscription } from "@/lib/stripe/require-subscription";

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

  const { documentId, fixIds } = await request.json() as {
    documentId: string;
    fixIds: string[];
  };

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: 404 }
    );
  }

  const allFindings = (doc.spellingResults as SpellingFinding[]) || [];
  const toFix = allFindings.filter((f) => fixIds.includes(f.id));

  if (toFix.length === 0) {
    return NextResponse.json({ success: true, data: { fixedCount: 0 } });
  }

  // Group by section
  const bySection = new Map<string, SpellingFinding[]>();
  for (const finding of toFix) {
    const list = bySection.get(finding.sectionId) || [];
    list.push(finding);
    bySection.set(finding.sectionId, list);
  }

  let fixedCount = 0;

  for (const [sectionId, sectionFindings] of bySection) {
    const [section] = await db
      .select()
      .from(sections)
      .where(eq(sections.id, sectionId))
      .limit(1);

    if (!section) continue;

    let text = section.currentText;

    // Apply replacements in reverse offset order to preserve positions
    const sorted = [...sectionFindings].sort((a, b) => b.phraseStart - a.phraseStart);
    for (const finding of sorted) {
      // Verify the word still exists at the expected position
      const actual = text.slice(finding.phraseStart, finding.phraseEnd);
      if (actual === finding.word) {
        text =
          text.slice(0, finding.phraseStart) +
          finding.correction +
          text.slice(finding.phraseEnd);
        fixedCount++;
      }
    }

    await db
      .update(sections)
      .set({ currentText: text })
      .where(eq(sections.id, sectionId));
  }

  // Remove fixed findings from stored results
  const remaining = allFindings.filter((f) => !fixIds.includes(f.id));
  const newScore = Math.max(0, 100 - remaining.length * 5);

  await db
    .update(documents)
    .set({
      spellingResults: remaining,
      spellingScore: newScore,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  return NextResponse.json({
    success: true,
    data: { fixedCount },
  });
}
