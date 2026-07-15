import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { detectSpellingErrors } from "@/lib/analysis/spelling-detector";
import { loadMergedStylePreferences } from "@/lib/style/load-prefs";
import { resolveEnglishVariant } from "@/lib/style/english-variant";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { documentId } = await request.json();

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

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  try {
    const stylePrefs = await loadMergedStylePreferences(user.id, doc.documentType);
    const findings = await detectSpellingErrors(docSections, {
      documentType: doc.documentType,
      variant: resolveEnglishVariant(doc.intake as Record<string, unknown> | null, stylePrefs),
    });
    const score = Math.max(0, 100 - findings.length * 5);

    await db
      .update(documents)
      .set({
        spellingResults: findings,
        spellingScore: score,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      data: { findings, score },
    });
  } catch (err) {
    console.error("Spelling detection failed:", err);
    return NextResponse.json(
      { success: false, error: "Spelling check failed. Please try again." },
      { status: 500 }
    );
  }
}
