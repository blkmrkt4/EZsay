/**
 * Regression suite for the "duplicated/corrupted section" bug class against
 * REAL student essay .docx files.
 *
 * Root cause of the original incident (fixed 2026-07-17, hardened
 * 2026-07-18): flags/resolve spliced full-section rewrites into narrow,
 * scan-time offsets with no re-verification against current text — a real
 * document ended up with paragraphs pasted over themselves up to 6x.
 * lib/analysis/flag-resolution.ts (extracted from that route, behavior
 * preserved — see its own module doc) is the fix. This suite exercises that
 * SAME logic — not a re-implementation — through a realistic multi-step
 * edit session on real essays, then through the newer docx-surgery export
 * layer, and asserts the final file has no duplication and preserves
 * everything the session didn't touch.
 *
 * Fixtures are the user's own essays at ESSAY_FIXTURES_DIR — never
 * committed to the repo (see .gitignore). This suite SKIPS (not fails) on
 * any machine where that folder doesn't exist.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { parseDocx } from "@/lib/parsers/docx-parser";
import { parseAndSplit } from "@/lib/citations/parser";
import { exportPreservedDocx, type SurgerySection } from "@/lib/export/docx-surgery";
import { computeFlagReplacement, locateSpan } from "@/lib/analysis/flag-resolution";
import {
  assertExactSections,
  assertNoGrossDuplication,
  assertOtherPartsUnchanged,
  ingestSectionTexts,
} from "./helpers/no-duplication";

const ESSAY_FIXTURES_DIR = process.env.ESSAY_FIXTURES_DIR ?? "/Users/blkmrkt/Documents/Calum Essays";
const HAS_FIXTURES = existsSync(ESSAY_FIXTURES_DIR);
const ESSAY_FILES = HAS_FIXTURES
  ? readdirSync(ESSAY_FIXTURES_DIR).filter((f) => f.toLowerCase().endsWith(".docx"))
  : [];

if (!HAS_FIXTURES) {
  // eslint-disable-next-line no-console
  console.warn(`[essay-pipeline-regression] ${ESSAY_FIXTURES_DIR} not found — skipping (local-only fixtures, see .gitignore).`);
} else if (ESSAY_FILES.length === 0) {
  // eslint-disable-next-line no-console
  console.warn(`[essay-pipeline-regression] ${ESSAY_FIXTURES_DIR} has no .docx files — skipping.`);
}

interface EssayFixture {
  name: string;
  buffer: Buffer;
  sections: { text: string; isLocked: boolean }[];
}

async function loadEssay(fileName: string): Promise<EssayFixture> {
  const buffer = readFileSync(path.join(ESSAY_FIXTURES_DIR, fileName));
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const rawText = await parseDocx(arrayBuffer);
  const parsed = parseAndSplit(rawText);
  return { name: fileName, buffer, sections: parsed.sections };
}

/** Simulates one flags/resolve accept — same call shape the route makes,
 * applied against an in-memory sections array (mirrors DB state). */
function applyContentAccept(sections: SurgerySection[], index: number, replacementRaw: string, isOptionBased = true): SurgerySection {
  const current = sections[index].currentText;
  const result = computeFlagReplacement({
    patternType: "banned_word",
    currentSectionText: current,
    replacementRaw,
    isOptionBased,
    span: { flaggedPhrase: "", phraseStart: 0, phraseEnd: 0 }, // unused for non-artifact
  });
  if (!result.ok) throw new Error(`expected content accept to succeed, got refused: ${result.reason}`);
  sections[index] = { ...sections[index], currentText: result.newSectionText };
  return sections[index];
}

/** Simulates one artifact accept: narrow span replace, verified + re-anchored. */
function applyArtifactAccept(
  sections: SurgerySection[],
  index: number,
  flaggedPhrase: string,
  phraseStart: number,
  phraseEnd: number,
  replacementRaw: string,
) {
  const current = sections[index].currentText;
  const result = computeFlagReplacement({
    patternType: "ai_artifact",
    currentSectionText: current,
    replacementRaw,
    isOptionBased: true,
    span: { flaggedPhrase, phraseStart, phraseEnd },
  });
  if (result.ok) sections[index] = { ...sections[index], currentText: result.newSectionText };
  return result;
}

describe.skipIf(!HAS_FIXTURES || ESSAY_FILES.length === 0)("real essay pipeline — no duplication/corruption", () => {
  const essays: EssayFixture[] = [];

  beforeAll(async () => {
    for (const file of ESSAY_FILES) {
      essays.push(await loadEssay(file));
    }
  });

  it("found essay fixtures to test against", () => {
    expect(ESSAY_FILES.length).toBeGreaterThan(0);
  });

  describe.each(ESSAY_FILES)("%s", (fileName) => {
    function essay(): EssayFixture {
      const found = essays.find((e) => e.name === fileName);
      if (!found) throw new Error(`fixture not loaded: ${fileName}`);
      return found;
    }

    it("ingests without error and produces non-empty sections", () => {
      const { sections } = essay();
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s.text.trim().length, "a section is empty/whitespace-only — parseAndSplit should have filtered it").toBeGreaterThan(0);
      }
    });

    it("zero-edit round trip: preserves exactly, or refuses with a specific reason", async () => {
      const { buffer, sections } = essay();
      const noEdits: SurgerySection[] = sections.map((s) => ({ rawText: s.text, currentText: s.text }));
      const result = await exportPreservedDocx(buffer, noEdits);
      if (result.ok) {
        await assertExactSections(result.buffer, sections.map((s) => s.text));
        await assertOtherPartsUnchanged(buffer, result.buffer);
      } else {
        // A real-world construct we deliberately don't attempt (tracked
        // changes, OLE objects, etc.) — must be a NAMED reason, not a crash.
        expect(["malformed-docx", "unsupported-construct", "alignment-failed", "edited-field-paragraph", "surgery-error"]).toContain(result.reason);
      }
    });

    it("survives a realistic multi-step edit session with no duplication", async () => {
      const { buffer, sections: original } = essay();
      const editable = original
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.isLocked);
      if (editable.length < 3) return; // essay too short to construct a meaningful session

      const sim: SurgerySection[] = original.map((s) => ({ rawText: s.text, currentText: s.text }));
      const expected: string[] = original.map((s) => s.text);
      let wordDelta = 0;

      const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;

      // (1) Whole-section replacements on a few different sections — the
      // common case (accepted AI-rewrite options).
      const targets = editable.slice(0, Math.min(3, editable.length)).map(({ i }) => i);
      for (const idx of targets) {
        const rewritten = `[REWRITTEN] ${sim[idx].currentText} — clarified for the reader.`;
        applyContentAccept(sim, idx, rewritten);
        wordDelta += wc(rewritten) - wc(expected[idx]);
        expected[idx] = rewritten;
      }

      // (2) Two SEQUENTIAL edits landing in the SAME section — the exact
      // shape of the historical bug: the second edit must be computed
      // against the text left by the first, never a stale snapshot.
      const repeatIdx = targets[0];
      const afterFirst = sim[repeatIdx].currentText;
      const rewrittenAgain = `${afterFirst} Additionally, a second pass tightened the wording further.`;
      applyContentAccept(sim, repeatIdx, rewrittenAgain, false); // manual edit this time
      wordDelta += wc(rewrittenAgain) - wc(afterFirst);
      expected[repeatIdx] = rewrittenAgain;
      expect(sim[repeatIdx].currentText).toBe(rewrittenAgain);
      expect(sim[repeatIdx].currentText.includes(afterFirst), "second edit must build on the post-first-edit text, not duplicate the original underneath it").toBe(true);
      expect((sim[repeatIdx].currentText.match(new RegExp(escapeRegExp(afterFirst.slice(0, 40)), "g")) ?? []).length, "the pre-first-edit text fragment must not appear twice").toBe(1);

      // (3) Artifact accept requiring re-anchoring: the section changed
      // since we "scanned" it (stored offsets are now wrong), but the
      // phrase still exists — locateSpan must find it by search. Pick a
      // section with enough content that removing one word is realistic
      // (real ai_artifact removals are always a small fragment of a much
      // larger paragraph — e.g. an em dash — never the paragraph's entire
      // text; a one-word heading is not a representative target).
      const artifactCandidate = editable.find(
        ({ i, s }) => i !== repeatIdx && !targets.includes(i) && s.text.split(/\s+/).length >= 8,
      );
      const artifactIdx = artifactCandidate?.i;
      if (artifactIdx !== undefined) {
        const text = sim[artifactIdx].currentText;
        const words = text.split(/\s+/).filter((w) => w.length > 4);
        if (words.length > 0) {
          const phrase = words[Math.floor(words.length / 2)];
          const trueOffset = text.indexOf(phrase);
          // Stale stored offset (as if an earlier edit in this section had
          // shifted everything by 50 chars since the scan ran).
          const staleStart = trueOffset + 50;
          const staleEnd = staleStart + phrase.length;
          const result = applyArtifactAccept(sim, artifactIdx, phrase, staleStart, staleEnd, "(remove)");
          expect(result.ok, "re-anchoring by search should have found the phrase despite the stale offset").toBe(true);
          const newText = text.slice(0, trueOffset) + text.slice(trueOffset + phrase.length);
          wordDelta += wc(newText) - wc(expected[artifactIdx]);
          expected[artifactIdx] = newText;
          expect(sim[artifactIdx].currentText).toBe(newText);
        }
      }

      // (4) Stale artifact accept that must be REFUSED — the phrase is
      // genuinely gone (e.g. a prior full-section rewrite removed it).
      // The route refuses (409 stale_flag) and the section must be
      // left exactly as-is — never a silent no-op that also corrupts text.
      const staleTargetIdx = targets[targets.length - 1];
      const goneRefusal = applyArtifactAccept(
        sim,
        staleTargetIdx,
        "this exact phrase does not exist anywhere in the rewritten section",
        0,
        10,
        "(remove)",
      );
      expect(goneRefusal.ok).toBe(false);
      if (!goneRefusal.ok) expect(goneRefusal.reason).toBe("stale_flag");
      expect(sim[staleTargetIdx].currentText, "a refused accept must not alter the section").toBe(expected[staleTargetIdx]);

      // ── Export the resulting session and verify the output ──────────
      const result = await exportPreservedDocx(buffer, sim);
      const originalTexts = original.map((s) => s.text);

      if (result.ok) {
        await assertExactSections(result.buffer, expected);
        await assertNoGrossDuplication(originalTexts, expected, wordDelta);
        await assertOtherPartsUnchanged(buffer, result.buffer);
      } else {
        // Even on fallback, the IN-MEMORY session state itself (what would
        // be re-typeset, or what the DB would hold) must be duplication-free.
        assertSectionsMatchExactly(sim.map((s) => s.currentText), expected);
      }
    });

    it("multi-paragraph rewrite lands as exactly one extra paragraph, not duplicated", async () => {
      const { buffer, sections: original } = essay();
      const editableIdx = original.findIndex((s) => !s.isLocked);
      if (editableIdx === -1) return;

      const sim: SurgerySection[] = original.map((s) => ({ rawText: s.text, currentText: s.text }));
      const rewritten = `${sim[editableIdx].currentText}\n\nA second paragraph added by the rewrite, expanding on the point above.`;
      const result = computeFlagReplacement({
        patternType: "banned_structure",
        currentSectionText: sim[editableIdx].currentText,
        replacementRaw: rewritten,
        isOptionBased: true,
        span: { flaggedPhrase: "", phraseStart: 0, phraseEnd: 0 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      sim[editableIdx] = { ...sim[editableIdx], currentText: result.newSectionText };

      const expected = original.map((s) => s.text);
      const [first, second] = rewritten.split(/\n\n+/);
      expected.splice(editableIdx, 1, first, second);

      const exported = await exportPreservedDocx(buffer, sim);
      if (exported.ok) {
        const finalTexts = await ingestSectionTexts(exported.buffer);
        // Exactly one new paragraph appeared — not zero (dropped) and not
        // two-plus (duplicated).
        expect(finalTexts.length).toBe(original.length + 1);
        expect(finalTexts[editableIdx]).toBe(first);
        expect(finalTexts[editableIdx + 1]).toBe(second);
      }
    });
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSectionsMatchExactly(actual: string[], expected: string[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBe(expected[i]);
}
