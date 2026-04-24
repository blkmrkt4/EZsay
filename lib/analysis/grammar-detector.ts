import { executeActivity } from "@/lib/routing/openrouter";
import type { GrammarFinding } from "./grammar-spelling-types";

interface SectionInput {
  id: string;
  currentText: string;
  isLocked: boolean;
}

/**
 * Detects grammar errors in document sections using LLM.
 * Validates all character positions against actual text.
 */
export async function detectGrammarErrors(
  sections: SectionInput[]
): Promise<GrammarFinding[]> {
  const findings: GrammarFinding[] = [];

  for (const section of sections) {
    if (section.isLocked) continue;
    if (section.currentText.trim().length < 10) continue;

    try {
      const result = await executeActivity("detect-grammar", {
        SECTION_TEXT: section.currentText,
      });

      const parsed = parseJsonResponse(result.content);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        if (!item.originalText || !item.correctedText) continue;

        // Validate position
        const validated = validatePosition(
          section.currentText,
          item.originalText,
          item.phraseStart,
          item.phraseEnd
        );

        if (!validated) continue;

        findings.push({
          id: crypto.randomUUID(),
          originalText: item.originalText,
          correctedText: item.correctedText,
          sectionId: section.id,
          phraseStart: validated.start,
          phraseEnd: validated.end,
          ruleCategory: item.ruleCategory || "other",
          explanation: item.explanation || "Grammar issue detected",
        });
      }
    } catch (err) {
      console.error(`Grammar detection failed for section ${section.id}:`, err);
    }
  }

  return findings;
}

function parseJsonResponse(content: string): unknown {
  const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validates that the text exists at the reported position.
 * Falls back to searching nearby, then anywhere in the text.
 */
function validatePosition(
  text: string,
  phrase: string,
  reportedStart: number,
  reportedEnd: number
): { start: number; end: number } | null {
  // Check exact position
  if (
    reportedStart >= 0 &&
    reportedEnd <= text.length &&
    text.slice(reportedStart, reportedEnd) === phrase
  ) {
    return { start: reportedStart, end: reportedEnd };
  }

  // Search near reported position
  const searchStart = Math.max(0, reportedStart - 100);
  const searchEnd = Math.min(text.length, (reportedEnd || reportedStart) + 100);
  const nearby = text.slice(searchStart, searchEnd);
  const idx = nearby.indexOf(phrase);
  if (idx !== -1) {
    return { start: searchStart + idx, end: searchStart + idx + phrase.length };
  }

  // Search entire text
  const globalIdx = text.indexOf(phrase);
  if (globalIdx !== -1) {
    return { start: globalIdx, end: globalIdx + phrase.length };
  }

  return null;
}
