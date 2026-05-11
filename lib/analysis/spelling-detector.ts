import { executeActivity } from "@/lib/routing/openrouter";
import type { SpellingFinding } from "./grammar-spelling-types";

interface SectionInput {
  id: string;
  currentText: string;
  isLocked: boolean;
}

interface SpellingContext {
  documentType: string;
}

/**
 * Detects spelling errors in document sections using LLM.
 * Validates all character positions against actual text.
 */
export async function detectSpellingErrors(
  sections: SectionInput[],
  context?: SpellingContext,
): Promise<SpellingFinding[]> {
  const findings: SpellingFinding[] = [];
  const docType = context?.documentType || "professional";

  for (const section of sections) {
    if (section.isLocked) continue;
    if (section.currentText.trim().length < 10) continue;

    try {
      const result = await executeActivity("detect-spelling", {
        SECTION_TEXT: section.currentText,
        DOCUMENT_TYPE: docType,
      });

      const parsed = parseJsonResponse(result.content);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        if (!item.word || !item.correction) continue;

        // Validate position — LLMs often hallucinate offsets
        const validated = validatePosition(
          section.currentText,
          item.word,
          item.phraseStart,
          item.phraseEnd
        );

        if (!validated) continue;

        // Extract context if the LLM didn't provide it
        const contextBefore =
          item.contextBefore || extractContext(section.currentText, validated.start, "before");
        const contextAfter =
          item.contextAfter || extractContext(section.currentText, validated.end, "after");

        findings.push({
          id: crypto.randomUUID(),
          word: item.word,
          correction: item.correction,
          contextBefore,
          contextAfter,
          sectionId: section.id,
          phraseStart: validated.start,
          phraseEnd: validated.end,
          explanation: item.explanation || `Likely misspelling of "${item.correction}"`,
        });
      }
    } catch (err) {
      console.error(`Spelling detection failed for section ${section.id}:`, err);
    }
  }

  return findings;
}

function parseJsonResponse(content: string): unknown {
  // Strip markdown code fences if present
  const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find a JSON array in the response
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
 * Validates that the word exists at the reported position.
 * Falls back to searching nearby, then anywhere in the text, then a
 * case-insensitive search that tolerates the LLM normalizing capitalization.
 */
function validatePosition(
  text: string,
  word: string,
  reportedStart: number,
  reportedEnd: number
): { start: number; end: number } | null {
  if (
    reportedStart >= 0 &&
    reportedEnd <= text.length &&
    text.slice(reportedStart, reportedEnd) === word
  ) {
    return { start: reportedStart, end: reportedEnd };
  }

  const searchStart = Math.max(0, reportedStart - 50);
  const searchEnd = Math.min(text.length, (reportedEnd || reportedStart) + 50);
  const nearby = text.slice(searchStart, searchEnd);
  const idx = nearby.indexOf(word);
  if (idx !== -1) {
    return { start: searchStart + idx, end: searchStart + idx + word.length };
  }

  const globalIdx = text.indexOf(word);
  if (globalIdx !== -1) {
    return { start: globalIdx, end: globalIdx + word.length };
  }

  const ciIdx = text.toLowerCase().indexOf(word.toLowerCase());
  if (ciIdx !== -1) {
    return { start: ciIdx, end: ciIdx + word.length };
  }

  console.warn("[spelling-detector] dropped finding — could not locate word in section text", {
    wordPreview: word.slice(0, 40),
    textLength: text.length,
  });
  return null;
}

function extractContext(text: string, position: number, direction: "before" | "after"): string {
  if (direction === "before") {
    const slice = text.slice(Math.max(0, position - 40), position).trim();
    const words = slice.split(/\s+/);
    return words.slice(-4).join(" ");
  }
  const slice = text.slice(position, Math.min(text.length, position + 40)).trim();
  const words = slice.split(/\s+/);
  return words.slice(0, 4).join(" ");
}
