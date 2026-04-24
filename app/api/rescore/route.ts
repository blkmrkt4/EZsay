import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { loadEntriesByType } from "@/lib/library/loader";
import { findExactMatches } from "@/lib/analysis/exact-matcher";
import { findRegexMatches } from "@/lib/analysis/regex-matcher";
import { analyzeSemanticPatterns } from "@/lib/analysis/semantic-analyzer";
import { calculateWritingQuality } from "@/lib/analysis/quality-scorer";

function signalLevel(flagCount: number): "high" | "medium" | "low" | "none" {
  if (flagCount >= 5) return "high";
  if (flagCount >= 3) return "medium";
  if (flagCount >= 1) return "low";
  return "none";
}

/**
 * Re-evaluate: re-scans the current document state (with user edits applied)
 * and returns an updated AI risk score. Triggered only by explicit user action.
 */
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

  const previousScore = doc.aiRiskScore;

  // Load sections
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  // Delete all existing open flags (keep resolved ones for history)
  for (const section of docSections) {
    await db
      .delete(flags)
      .where(and(eq(flags.sectionId, section.id), eq(flags.status, "open")));
  }

  // Re-scan using currentText (which includes user edits)
  const { exactPhrases, regexPatterns, semanticPatterns } =
    await loadEntriesByType(doc.documentType);

  let totalFlags = 0;

  for (const section of docSections) {
    if (section.isLocked) continue;

    const sectionFlags: {
      libraryEntryId: string;
      phraseStart: number;
      phraseEnd: number;
      flaggedPhrase: string;
      patternType: "banned_word" | "banned_structure" | "synonym_rotation" | "uniform_length" | "uniform_density" | "transition_pattern";
      explanation: string;
    }[] = [];

    const exactMatches = findExactMatches(section.currentText, exactPhrases);
    for (const m of exactMatches) {
      sectionFlags.push({
        libraryEntryId: m.entry.id,
        phraseStart: m.phraseStart,
        phraseEnd: m.phraseEnd,
        flaggedPhrase: m.flaggedPhrase,
        patternType: "banned_word",
        explanation: m.entry.explanation,
      });
    }

    const regexMatches = findRegexMatches(section.currentText, regexPatterns);
    for (const m of regexMatches) {
      sectionFlags.push({
        libraryEntryId: m.entry.id,
        phraseStart: m.phraseStart,
        phraseEnd: m.phraseEnd,
        flaggedPhrase: m.flaggedPhrase,
        patternType: "banned_structure",
        explanation: m.entry.explanation,
      });
    }

    const semanticFlags = analyzeSemanticPatterns(section.currentText, semanticPatterns);
    for (const f of semanticFlags) {
      sectionFlags.push({
        libraryEntryId: f.entry.id,
        phraseStart: f.phraseStart,
        phraseEnd: f.phraseEnd,
        flaggedPhrase: f.flaggedPhrase,
        patternType: "banned_word",
        explanation: f.entry.explanation,
      });
    }

    if (sectionFlags.length > 0) {
      await db.insert(flags).values(
        sectionFlags.map((f) => ({
          sectionId: section.id,
          ...f,
        }))
      );
    }

    const newFlagCount = sectionFlags.length;
    await db
      .update(sections)
      .set({
        flagCount: newFlagCount,
        aiSignalLevel: signalLevel(newFlagCount),
      })
      .where(eq(sections.id, section.id));

    totalFlags += newFlagCount;
  }

  // Recalculate score
  const unlockedSections = docSections.filter((s) => !s.isLocked);
  const wordCount = unlockedSections
    .map((s) => s.currentText.split(/\s+/).length)
    .reduce((a, b) => a + b, 0);

  const flagDensity = wordCount > 0 ? (totalFlags / wordCount) * 100 : 0;
  const aiRiskScore = Math.min(100, Math.round(flagDensity * 10));

  const fullText = unlockedSections.map((s) => s.currentText).join("\n\n");
  const { qualityScore: writingQualityScore } = calculateWritingQuality(fullText);

  await db
    .update(documents)
    .set({
      aiRiskScore,
      writingQualityScore,
      lastRescoreAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  return NextResponse.json({
    success: true,
    data: {
      documentId,
      previousScore,
      aiRiskScore,
      writingQualityScore,
      totalFlags,
      delta: previousScore != null ? aiRiskScore - previousScore : null,
    },
  });
}
