import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, llmCallLog } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { callOpenRouter } from "@/lib/routing/openrouter";

const SYSTEM_PROMPT = `You are a writing consistency analyser. You check for tone and voice consistency ONLY — not grammar, spelling, or sentence correctness.

CRITICAL RULE: Do NOT flag grammar errors, spelling mistakes, missing articles, subject-verb disagreement, or any other language correctness issue. Those are handled by a separate grammar checker. Your job is ONLY about consistency of tone, voice, and register across the document. If the entire document is written in the same (even if poor) style, that is CONSISTENT and should NOT be flagged.

Examine the document for:

1. **Tone shifts** — places where the formality level CHANGES within the document (formal → casual, academic → conversational, or vice versa). The key word is CHANGES — if the whole document is informal, that is consistent, not a tone shift. Only flag when one part differs from the rest.

2. **Voice inconsistencies** — switches between first person ("I argue"), third person ("the author argues"), and passive voice ("it is argued") within the same section. Some mixing is natural, but abrupt switches are a problem.

3. **Register changes** — academic jargon in one paragraph, then plain language in the next. Or British spelling ("colour") mixed with American ("color"). Again, only flag CHANGES, not a consistently informal register.

4. **Contradictions** — where the document makes a claim in one place that conflicts with another claim elsewhere.

5. **Repetition** — where the same idea is restated in a different section without adding new insight.

Things that are NOT tone inconsistency (do NOT flag these):
- Grammar errors ("it make you feel" — that's grammar, not tone)
- Spelling mistakes ("importent" — that's spelling, not tone)
- Missing articles ("exercise is must" — that's grammar, not tone)
- Poor writing quality throughout — if it's consistently poor, it's consistent
- Simple or informal language — if the whole document is casual, that's fine

For each issue found, respond with a JSON array entry:

{"type": "tone_shift" | "voice_inconsistency" | "register_change" | "contradiction" | "repetition",
 "severity": "high" | "medium" | "low",
 "passage": "the exact text where the issue occurs (quote it)",
 "explanation": "what the issue is and why it matters",
 "suggestion": "how to fix it"}

Return ONLY a JSON array. If no issues found, return [].
Do not invent issues — only flag genuine inconsistencies.`;

const MODEL = "anthropic/claude-sonnet-4";
const FALLBACKS = ["google/gemini-2.5-pro", "openai/gpt-4o"];

export interface ToneIssue {
  type: "tone_shift" | "voice_inconsistency" | "register_change" | "contradiction" | "repetition";
  severity: "high" | "medium" | "low";
  passage: string;
  explanation: string;
  suggestion: string;
}

/**
 * GET — Load existing tone consistency results for a document.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ success: false, error: "documentId required" }, { status: 400 });
  }

  // Verify ownership
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  // Load tone_inconsistency flags for this document in one query
  const docSections = await db.select().from(sections).where(eq(sections.documentId, documentId));
  const sectionIds = docSections.map((s) => s.id);

  const toneFlags = sectionIds.length > 0
    ? await db.select().from(flags).where(and(inArray(flags.sectionId, sectionIds), eq(flags.patternType, "tone_inconsistency")))
    : [];

  return NextResponse.json({ success: true, data: toneFlags });
}

/**
 * POST — Run tone consistency analysis via LLM.
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

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  const fullText = docSections
    .filter((s) => !s.isLocked)
    .map((s) => s.currentText)
    .join("\n\n");

  if (!fullText.trim()) {
    return NextResponse.json({ success: false, error: "Document has no text" }, { status: 400 });
  }

  // Clear previous tone flags
  for (const sec of docSections) {
    await db.delete(flags).where(and(eq(flags.sectionId, sec.id), eq(flags.patternType, "tone_inconsistency")));
  }

  console.log("[tone-consistency] Analysing document...");

  try {
    const startTime = Date.now();
    const result = await callOpenRouter(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Document type: ${doc.documentType}\n\n---\n${fullText}\n---` },
      ],
      MODEL,
      FALLBACKS,
      0.3,
      4096,
    );

    const latencyMs = Date.now() - startTime;

    await db.insert(llmCallLog).values({
      activityType: "tone_consistency",
      modelUsed: result.modelUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs,
      outcome: "pending",
    });

    // Parse response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    let issues: ToneIssue[] = [];
    if (jsonMatch) {
      try {
        issues = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("[tone-consistency] Failed to parse LLM response as JSON");
      }
    }

    console.log(`[tone-consistency] Found ${issues.length} issues`);

    // Create flags for each issue
    let createdFlags = 0;
    for (const issue of issues) {
      // Find which section contains this passage
      let sectionId: string | null = null;
      let phraseStart = 0;
      let phraseEnd = 0;

      for (const sec of docSections) {
        const idx = sec.currentText.indexOf(issue.passage);
        if (idx >= 0) {
          sectionId = sec.id;
          phraseStart = idx;
          phraseEnd = idx + issue.passage.length;
          break;
        }
      }

      if (!sectionId) {
        // Try partial match — first 50 chars
        const partial = issue.passage.slice(0, 50);
        for (const sec of docSections) {
          const idx = sec.currentText.indexOf(partial);
          if (idx >= 0) {
            sectionId = sec.id;
            phraseStart = idx;
            phraseEnd = idx + partial.length;
            break;
          }
        }
      }

      if (!sectionId) continue;

      const typeLabels: Record<string, string> = {
        tone_shift: "Tone shift",
        voice_inconsistency: "Voice inconsistency",
        register_change: "Register change",
        contradiction: "Contradiction",
        repetition: "Repetition",
      };

      await db.insert(flags).values({
        sectionId,
        phraseStart,
        phraseEnd,
        flaggedPhrase: issue.passage.slice(0, 200),
        patternType: "tone_inconsistency",
        explanation: `${typeLabels[issue.type] ?? issue.type}: ${issue.explanation}`,
        metadata: {
          issueType: issue.type,
          severity: issue.severity,
          suggestion: issue.suggestion,
        },
      });

      createdFlags++;
    }

    // Calculate score: 0 = many issues, 100 = consistent
    // Weight: high=3, medium=1.5, low=0.5
    const SEVERITY_WEIGHT: Record<string, number> = { high: 3, medium: 1.5, low: 0.5 };
    const totalWeight = issues.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.severity] ?? 1), 0);
    const wordCount = fullText.split(/\s+/).length;
    const issuesDensity = wordCount > 0 ? (totalWeight / (wordCount / 500)) : 0;
    const toneConsistencyScore = Math.max(0, Math.min(100, Math.round(100 - issuesDensity * 15)));

    await db.update(documents).set({ toneConsistencyScore }).where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      data: {
        issues: issues.length,
        flagsCreated: createdFlags,
        score: toneConsistencyScore,
        breakdown: {
          toneShifts: issues.filter((i) => i.type === "tone_shift").length,
          voiceInconsistencies: issues.filter((i) => i.type === "voice_inconsistency").length,
          registerChanges: issues.filter((i) => i.type === "register_change").length,
          contradictions: issues.filter((i) => i.type === "contradiction").length,
          repetitions: issues.filter((i) => i.type === "repetition").length,
        },
      },
    });
  } catch (err) {
    console.error("[tone-consistency] Analysis failed:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Analysis failed",
    });
  }
}
