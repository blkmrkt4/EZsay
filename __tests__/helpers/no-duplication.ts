/**
 * Shared assertions for the "no duplicated/corrupted sections" regression
 * suite (__tests__/essay-pipeline-regression.test.ts). Each helper targets a
 * different layer of the historical corruption bug class so a failure in any
 * one of them narrows down where a regression landed:
 *
 *  - assertExactSections: does the exported FILE contain exactly the text we
 *    expect, paragraph for paragraph? (catches interleaving, mid-word
 *    splices, tail duplication — the exact shape of the original bug)
 *  - assertNoGrossDuplication: an independent, text-content-agnostic sanity
 *    check via word count (catches a bug in assertExactSections' own
 *    expectations, or a duplication assertExactSections' string compare
 *    happens to miss)
 *  - assertOtherPartsUnchanged: does everything outside word/document.xml
 *    survive byte-for-byte? (catches the export layer corrupting styles,
 *    tables, footnotes, images while "fixing" the text)
 */

import { expect } from "vitest";
import JSZip from "jszip";
import { parseDocx } from "@/lib/parsers/docx-parser";
import { parseAndSplit } from "@/lib/citations/parser";
import { normalizeParaText } from "@/lib/export/docx-surgery";

/** Re-ingest a docx buffer exactly like the upload route does. */
export async function ingestSectionTexts(buffer: Buffer): Promise<string[]> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const rawText = await parseDocx(arrayBuffer);
  return parseAndSplit(rawText).sections.map((s) => s.text);
}

/**
 * The strongest single check: re-extract the exported file and assert its
 * paragraphs equal `expectedTexts` EXACTLY, in order, with no extra or
 * missing paragraphs. An interleaved/duplicated/mid-word-spliced document
 * fails this immediately — either the count is wrong or a string doesn't
 * match.
 *
 * `expectedTexts` is normalized the same way real re-ingestion normalizes
 * (parseAndSplit's whitespace-collapse) before comparing — `actual` comes
 * from that same pipeline, so comparing an un-normalized expectation against
 * it would flag benign artifacts (e.g. a double space left behind by a
 * narrow word removal) as if they were duplication. Genuine corruption
 * (duplicated/interleaved/mid-word-spliced text) survives normalization and
 * still fails this check.
 */
export async function assertExactSections(buffer: Buffer, expectedTexts: string[]): Promise<void> {
  const actual = await ingestSectionTexts(buffer);
  const expectedNormalized = expectedTexts.map(normalizeParaText).filter((t) => t !== "");
  expect(actual, "paragraph count mismatch — indicates duplicated or missing paragraphs").toHaveLength(expectedNormalized.length);
  for (let i = 0; i < expectedNormalized.length; i++) {
    expect(actual[i], `paragraph ${i} text mismatch`).toBe(expectedNormalized[i]);
  }
}

/**
 * Independent, content-agnostic sanity check. Computes total word count
 * across a text array and compares to an expected total (original + the
 * intended net change from edits), with a small tolerance for word-boundary
 * rounding. A gross blow-up (e.g. a section duplicated 3x) fails this even
 * if assertExactSections' own expected-text math happened to be wrong too.
 */
export function assertNoGrossDuplication(
  originalTexts: string[],
  finalTexts: string[],
  expectedWordDelta: number,
  toleranceWords = 5,
): void {
  const wordCount = (texts: string[]) =>
    texts.join(" ").split(/\s+/).filter(Boolean).length;
  const originalWords = wordCount(originalTexts);
  const finalWords = wordCount(finalTexts);
  const expected = originalWords + expectedWordDelta;
  expect(
    Math.abs(finalWords - expected),
    `word count ${finalWords} far from expected ${expected} (original ${originalWords} + delta ${expectedWordDelta}) — looks like duplicated content`,
  ).toBeLessThanOrEqual(toleranceWords);
}

/** Every zip entry except word/document.xml must be byte-identical
 * (decompressed) between the original and the exported file — styles,
 * tables, footnotes, images, numbering, headers must never change. */
export async function assertOtherPartsUnchanged(originalBuffer: Buffer, outputBuffer: Buffer): Promise<void> {
  const inZip = await JSZip.loadAsync(originalBuffer);
  const outZip = await JSZip.loadAsync(outputBuffer);
  const inNames = Object.keys(inZip.files).filter((n) => !inZip.files[n].dir).sort();
  const outNames = Object.keys(outZip.files).filter((n) => !outZip.files[n].dir).sort();
  expect(outNames, "zip entry list changed").toEqual(inNames);
  for (const name of inNames) {
    if (name === "word/document.xml") continue;
    const a = await inZip.files[name].async("uint8array");
    const b = await outZip.files[name].async("uint8array");
    expect(Buffer.from(b).equals(Buffer.from(a)), `zip entry ${name} changed`).toBe(true);
  }
}
