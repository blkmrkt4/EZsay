import { executeActivity } from "@/lib/routing/openrouter";
import type { GrammarFinding } from "./grammar-spelling-types";
import { batchSections, mapBatchesWithDeadline, type SectionInput } from "./detector-batching";
import { sanitizeGeneratedText } from "./sanitize-generated";

interface GrammarContext {
  documentType: string;
  audience?: string;
  /** Wall-clock deadline (epoch ms) — batches not started by then are skipped. */
  deadlineAt?: number;
  /** Artifact items the user has set to "always keep" — exempt from correction sanitizing. */
  keepItems?: Set<string>;
}

const CONCURRENCY = 3;

/**
 * Detects grammar errors in document sections using LLM.
 * Strictness adapts to document type and audience.
 * Sections are batched into one LLM call per ~6k chars and processed
 * concurrently under a deadline (see detector-batching.ts). Findings are
 * attributed back to their section by searching each batch section's text.
 */
export async function detectGrammarErrors(
  sections: SectionInput[],
  context?: GrammarContext,
): Promise<GrammarFinding[]> {
  const docType = context?.documentType || "professional";
  const audience = context?.audience || "";
  const deadlineAt = context?.deadlineAt ?? Date.now() + 40_000;
  const batches = batchSections(sections);

  const { results, skipped } = await mapBatchesWithDeadline(
    batches,
    CONCURRENCY,
    deadlineAt,
    async (batch) => {
      const result = await executeActivity("detect-grammar", {
        SECTION_TEXT: batch.map((s) => s.currentText).join("\n\n"),
        DOCUMENT_TYPE: docType,
        AUDIENCE: audience,
      });

      const parsed = parseJsonResponse(result.content);
      if (!Array.isArray(parsed)) return [] as GrammarFinding[];

      const batchFindings: GrammarFinding[] = [];
      for (const item of parsed) {
        if (!item.originalText || !item.correctedText) continue;

        // A correction must never introduce typographic AI artifacts (em
        // dashes, curly quotes, …) — the artifact sweep flags exactly those
        // for removal, so the two features would give contradictory advice.
        // Sanitize the correction; if nothing survives but the artifact
        // insertion, the "error" was purely stylistic — drop the finding.
        const correctedText = sanitizeGeneratedText(item.correctedText, context?.keepItems);
        if (normalizeWs(correctedText) === normalizeWs(item.originalText)) continue;

        // Attribute the finding to the batch section containing the text.
        for (const section of batch) {
          const validated = validatePosition(
            section.currentText,
            item.originalText,
            item.phraseStart,
            item.phraseEnd
          );
          if (!validated) continue;

          batchFindings.push({
            id: crypto.randomUUID(),
            originalText: item.originalText,
            correctedText,
            sectionId: section.id,
            phraseStart: validated.start,
            phraseEnd: validated.end,
            ruleCategory: item.ruleCategory || "other",
            explanation: item.explanation || "Grammar issue detected",
          });
          break;
        }
      }
      return batchFindings;
    },
  );

  if (skipped > 0) {
    console.warn(`[grammar-detector] deadline hit — ${skipped}/${batches.length} batches skipped`);
  }

  return results.flat();
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
 * Falls back to searching nearby, then anywhere in the text, then a
 * fuzzy regex match that tolerates whitespace and curly-vs-straight quote
 * differences (LLMs frequently normalize these in their output).
 */
function validatePosition(
  text: string,
  phrase: string,
  reportedStart: number,
  reportedEnd: number
): { start: number; end: number } | null {
  if (
    reportedStart >= 0 &&
    reportedEnd <= text.length &&
    text.slice(reportedStart, reportedEnd) === phrase
  ) {
    return { start: reportedStart, end: reportedEnd };
  }

  const searchStart = Math.max(0, reportedStart - 100);
  const searchEnd = Math.min(text.length, (reportedEnd || reportedStart) + 100);
  const nearby = text.slice(searchStart, searchEnd);
  const idx = nearby.indexOf(phrase);
  if (idx !== -1) {
    return { start: searchStart + idx, end: searchStart + idx + phrase.length };
  }

  const globalIdx = text.indexOf(phrase);
  if (globalIdx !== -1) {
    return { start: globalIdx, end: globalIdx + phrase.length };
  }

  const fuzzy = buildFuzzyRegex(phrase);
  if (fuzzy) {
    const m = fuzzy.exec(text);
    if (m) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }

  console.warn("[grammar-detector] dropped finding — could not locate phrase in section text", {
    phrasePreview: phrase.slice(0, 80),
    textLength: text.length,
  });
  return null;
}

function buildFuzzyRegex(phrase: string): RegExp | null {
  const normalized = phrase
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexed = escaped
    .replace(/ /g, "\\s+")
    .replace(/'/g, "['\\u2018\\u2019]")
    .replace(/"/g, '["\\u201C\\u201D]')
    .replace(/-/g, "[-\\u2013\\u2014]");
  try {
    return new RegExp(flexed, "i");
  } catch {
    return null;
  }
}
