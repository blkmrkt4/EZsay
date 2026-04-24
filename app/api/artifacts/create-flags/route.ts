import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { detectArtifacts } from "@/lib/analysis/artifact-detector";
import { getArtifactReplacement } from "@/lib/analysis/artifact-removals";

/**
 * Create individual flags for artifact instances the user chose "Ask" for.
 * Each instance becomes a flag the user reviews one-by-one in the editing flow.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

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
  let createdCount = 0;

  for (const section of docSections) {
    if (section.isLocked) continue;

    const result = detectArtifacts(section.currentText);
    const relevantFindings = result.findings.filter((f) => itemSet.has(f.item));

    for (const finding of relevantFindings) {
      for (const inst of finding.instances) {
        if (inst.start < 0 || inst.end <= inst.start) continue;
        if (inst.matchedText === "(document-wide)") continue; // Skip structural-level findings

        // Create a flag for this instance
        const [newFlag] = await db.insert(flags).values({
          sectionId: section.id,
          phraseStart: inst.start,
          phraseEnd: inst.end,
          flaggedPhrase: inst.matchedText,
          patternType: "ai_artifact",
          explanation: `AI artifact: ${finding.item} — ${finding.detail}`,
          metadata: { artifactItem: finding.item, artifactCategory: finding.category },
        }).returning();

        // Create a replacement option
        const replacement = getArtifactReplacement(finding.item, inst.matchedText);
        if (replacement !== inst.matchedText) {
          await db.insert(flagOptions).values({
            flagId: newFlag.id,
            text: replacement || "(remove)",
            modelId: "artifact-detector",
            isBlend: false,
          });
        }

        createdCount++;
      }
    }
  }

  console.log(`[artifacts/create-flags] Created ${createdCount} flags for [${items.join(", ")}]`);

  return NextResponse.json({
    success: true,
    data: { createdCount },
  });
}
