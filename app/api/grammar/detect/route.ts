import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { detectGrammarErrors } from "@/lib/analysis/grammar-detector";
import { loadArtifactKeepSet } from "@/lib/analysis/sanitize-generated";
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
    const findings = await detectGrammarErrors(docSections, {
      documentType: doc.documentType,
      keepItems: await loadArtifactKeepSet(user.id),
      variant: resolveEnglishVariant(doc.intake as Record<string, unknown> | null, stylePrefs),
    });
    const score = Math.max(0, 100 - findings.length * 3);

    await db
      .update(documents)
      .set({
        grammarResults: findings,
        grammarScore: score,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      data: { findings, score },
    });
  } catch (err) {
    console.error("Grammar detection failed:", err);
    return NextResponse.json(
      { success: false, error: "Grammar check failed. Please try again." },
      { status: 500 }
    );
  }
}
