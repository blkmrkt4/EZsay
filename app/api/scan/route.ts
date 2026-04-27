import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions, styleTraining } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { loadEntriesByType } from "@/lib/library/loader";
import { findExactMatches } from "@/lib/analysis/exact-matcher";
import { findRegexMatches } from "@/lib/analysis/regex-matcher";
import { analyzeSemanticPatterns } from "@/lib/analysis/semantic-analyzer";
import { calculateWritingQuality } from "@/lib/analysis/quality-scorer";
import { detectSpellingErrors } from "@/lib/analysis/spelling-detector";
import { detectGrammarErrors } from "@/lib/analysis/grammar-detector";
import { checkAllLimits, recordScanUsage } from "@/lib/stripe/plan-limits";

/**
 * Maps a library entry to the most appropriate flag patternType.
 * Uses the entry's category first, then falls back to detection method.
 */
function patternTypeFromEntry(
  entryType: string,
  category?: string,
  semanticValue?: string
): "banned_word" | "banned_structure" | "synonym_rotation" | "uniform_length" | "uniform_density" | "transition_pattern" {
  // Semantic patterns map by their value
  if (entryType === "semantic_pattern") {
    if (semanticValue === "synonym_rotation") return "synonym_rotation";
    if (semanticValue === "uniform_paragraph_length" || semanticValue === "uniform_sentence_length") return "uniform_length";
    if (semanticValue === "uniform_information_density") return "uniform_density";
    if (semanticValue === "transition_cycling") return "transition_pattern";
  }

  // Use library entry category for better accuracy
  if (category === "transition") return "transition_pattern";
  if (category === "sentence_structure") return "banned_structure";
  if (category === "density") return "uniform_density";
  if (category === "burstiness") return "uniform_length";

  // Default by detection method
  if (entryType === "regex_pattern") return "banned_structure";
  return "banned_word";
}

function signalLevel(flagCount: number): "high" | "medium" | "low" | "none" {
  if (flagCount >= 5) return "high";
  if (flagCount >= 3) return "medium";
  if (flagCount >= 1) return "low";
  return "none";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();

  // Support both old and new payload shapes
  const documentId = body.documentId;
  const categories = body.categories ?? { aiDetection: true, plagiarism: false, citations: false, styleCleanup: false };
  const aiDetectionDepth = body.aiDetectionDepth ?? body.scanLevel ?? "surface";
  // Sensitivity is now derived from depth — no separate selector
  const sensitivity: "low" | "medium" | "high" =
    aiDetectionDepth === "comprehensive" ? "high" :
    aiDetectionDepth === "deep" ? "medium" : "low";

  // Generate a unique scan run ID for tracking
  const scanRunId = crypto.randomUUID();

  // Load document
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

  // Check plan limits before scanning (single DB round trip for all limits)
  const docWordCount = doc.rawText.split(/\s+/).length;

  const { allAllowed, results: limitResults } = await checkAllLimits(user.id, [
    { limitType: "monthlyWordLimit", additionalAmount: docWordCount },
    { limitType: "monthlyScanLimit", additionalAmount: 1 },
  ]);

  if (!allAllowed) {
    const wordCheck = limitResults.monthlyWordLimit;
    if (wordCheck && !wordCheck.allowed) {
      return NextResponse.json(
        { success: false, error: `Monthly word limit reached (${wordCheck.current.toLocaleString()} / ${wordCheck.limit.toLocaleString()} words). Upgrade for more.`, limitType: "monthlyWordLimit" },
        { status: 402 }
      );
    }
    const scanCheck = limitResults.monthlyScanLimit;
    if (scanCheck && !scanCheck.allowed) {
      return NextResponse.json(
        { success: false, error: `Monthly scan limit reached (${scanCheck.current} / ${scanCheck.limit} scans). Upgrade for more.`, limitType: "monthlyScanLimit" },
        { status: 402 }
      );
    }
  }

  // Mark as scanning
  await db
    .update(documents)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  try {
  // Load all sections
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  // Clear all previous flags before re-scanning (bulk delete).
  // Resolved flags are already captured in style_profiles and llm_call_log.
  const sectionIds = docSections.map((s) => s.id);
  if (sectionIds.length > 0) {
    // Delete all flag options for flags in these sections
    const existingFlags = await db.select({ id: flags.id }).from(flags).where(inArray(flags.sectionId, sectionIds));
    const existingFlagIds = existingFlags.map((f) => f.id);
    if (existingFlagIds.length > 0) {
      await db.delete(flagOptions).where(inArray(flagOptions.flagId, existingFlagIds));
    }
    // Delete all flags in these sections
    await db.delete(flags).where(inArray(flags.sectionId, sectionIds));
  }

  // Load library entries with sensitivity filter
  const { exactPhrases, regexPatterns, semanticPatterns } =
    await loadEntriesByType(doc.documentType, sensitivity);

  // All three detection methods always run — depth only controls sensitivity (which entries load)
  const runAI = categories.aiDetection !== false;
  const runRegex = runAI;
  const runSemantic = runAI;

  // Build entry lookup for severity weighting
  const allEntries = [...exactPhrases, ...regexPatterns, ...semanticPatterns];
  const entryById = new Map(allEntries.map((e) => [e.id, e]));
  const SEVERITY_WEIGHT: Record<string, number> = { high: 3, medium: 1.5, low: 1 };

  let totalFlags = 0;
  let totalWeightedFlags = 0;

  for (const section of docSections) {
    // Skip locked sections (citations)
    if (section.isLocked) continue;

    const sectionFlags: {
      libraryEntryId: string;
      phraseStart: number;
      phraseEnd: number;
      flaggedPhrase: string;
      patternType: "banned_word" | "banned_structure" | "synonym_rotation" | "uniform_length" | "uniform_density" | "transition_pattern";
      explanation: string;
    }[] = [];

    // 1. Exact phrase matching (runs when AI detection is on)
    if (!runAI) { /* skip AI detection entirely */ }
    const exactMatches = runAI ? findExactMatches(section.currentText, exactPhrases) : [];
    for (const m of exactMatches) {
      sectionFlags.push({
        libraryEntryId: m.entry.id,
        phraseStart: m.phraseStart,
        phraseEnd: m.phraseEnd,
        flaggedPhrase: m.flaggedPhrase,
        patternType: patternTypeFromEntry("exact_phrase", m.entry.category),
        explanation: m.entry.explanation,
      });
    }

    // 2. Regex pattern matching (deep + comprehensive)
    if (runRegex) {
      const regexMatches = findRegexMatches(section.currentText, regexPatterns);
      for (const m of regexMatches) {
        sectionFlags.push({
          libraryEntryId: m.entry.id,
          phraseStart: m.phraseStart,
          phraseEnd: m.phraseEnd,
          flaggedPhrase: m.flaggedPhrase,
          patternType: patternTypeFromEntry("regex_pattern", m.entry.category),
          explanation: m.entry.explanation,
        });
      }
    }

    // 3. Semantic pattern analysis (comprehensive only)
    if (runSemantic) {
      const semanticFlags = analyzeSemanticPatterns(
        section.currentText,
        semanticPatterns
      );
      for (const f of semanticFlags) {
        sectionFlags.push({
          libraryEntryId: f.entry.id,
          phraseStart: f.phraseStart,
          phraseEnd: f.phraseEnd,
          flaggedPhrase: f.flaggedPhrase,
          patternType: patternTypeFromEntry("semantic_pattern", f.entry.category, f.entry.value),
          explanation: f.entry.explanation,
        });
      }
    }

    // Deduplicate overlapping flags — keep the one with higher severity
    const deduped = deduplicateFlags(sectionFlags);

    // Insert flags with scanRunId
    if (deduped.length > 0) {
      await db.insert(flags).values(
        deduped.map((f) => ({
          sectionId: section.id,
          scanRunId,
          ...f,
        }))
      );
    }

    // Update section stats
    await db
      .update(sections)
      .set({
        flagCount: deduped.length,
        aiSignalLevel: signalLevel(deduped.length),
      })
      .where(eq(sections.id, section.id));

    totalFlags += deduped.length;
    totalWeightedFlags += deduped.reduce((sum, f) => {
      const entry = entryById.get(f.libraryEntryId);
      const w = entry ? SEVERITY_WEIGHT[entry.severity] ?? 1 : 1;
      return sum + w;
    }, 0);
  }

  // Calculate AI risk score (0-100) — severity-weighted, sigmoid curve
  const unlockedSections = docSections.filter((s) => !s.isLocked);
  const wordCount = unlockedSections
    .map((s) => s.currentText.split(/\s+/).length)
    .reduce((a, b) => a + b, 0);

  const weightedDensity = wordCount > 0 ? (totalWeightedFlags / wordCount) * 100 : 0;
  const rawScore = (weightedDensity / (weightedDensity + 5)) * 100;
  const dampener = Math.min(1, wordCount / 200);
  const aiRiskScore = Math.min(100, Math.round(rawScore * dampener));

  const fullText = unlockedSections.map((s) => s.currentText).join("\n\n");

  // Load style training "always_keep" preferences to exclude from artifact detection
  const keepPrefs = await db.select().from(styleTraining).where(eq(styleTraining.preference, "always_keep"));
  const skipArtifactItems = new Set(keepPrefs.map((p) => p.item));

  const { qualityScore: writingQualityScore, aiArtifactScore } = calculateWritingQuality(fullText, skipArtifactItems);

  // Spelling and grammar checks (opt-in)
  let spellingResults = null;
  let spellingScore = null;
  let grammarResults = null;
  let grammarScore = null;

  if (categories.spelling) {
    try {
      const findings = await detectSpellingErrors(docSections);
      spellingResults = findings;
      spellingScore = Math.max(0, 100 - findings.length * 5);
    } catch (err) {
      console.error("Spelling check failed during scan:", err);
    }
  }

  if (categories.grammar) {
    try {
      const findings = await detectGrammarErrors(docSections);
      grammarResults = findings;
      grammarScore = Math.max(0, 100 - findings.length * 3);
    } catch (err) {
      console.error("Grammar check failed during scan:", err);
    }
  }

  // Update document
  await db
    .update(documents)
    .set({
      status: "scanned",
      aiRiskScore,
      writingQualityScore,
      aiArtifactScore,
      ...(spellingResults !== null && { spellingResults, spellingScore }),
      ...(grammarResults !== null && { grammarResults, grammarScore }),
      lastRescoreAt: new Date(),
      lastScanLevel: aiDetectionDepth,
      lastScanSensitivity: sensitivity,
      lastScanCategories: categories,
      lastScanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  // Record usage
  await recordScanUsage(user.id, docWordCount);

  return NextResponse.json({
    success: true,
    data: {
      documentId,
      scanRunId,
      aiRiskScore,
      writingQualityScore,
      spellingScore,
      grammarScore,
      totalFlags,
      sectionCount: unlockedSections.length,
      lockedSections: docSections.length - unlockedSections.length,
    },
  });

  } catch (err) {
    console.error("Scan failed:", err);
    // Reset document status so user can retry
    await db
      .update(documents)
      .set({ status: "uploaded", updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    return NextResponse.json(
      { success: false, error: "Scan failed. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * Remove overlapping flags — if two flags overlap in position,
 * keep the one that covers a larger range.
 */
function deduplicateFlags<
  T extends { phraseStart: number; phraseEnd: number },
>(flags: T[]): T[] {
  if (flags.length <= 1) return flags;

  // Sort by start position
  const sorted = [...flags].sort((a, b) => a.phraseStart - b.phraseStart);
  const result: T[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    // If overlapping, keep the larger one
    if (curr.phraseStart < prev.phraseEnd) {
      const prevSize = prev.phraseEnd - prev.phraseStart;
      const currSize = curr.phraseEnd - curr.phraseStart;
      if (currSize > prevSize) {
        result[result.length - 1] = curr;
      }
      // else keep prev
    } else {
      result.push(curr);
    }
  }

  return result;
}
