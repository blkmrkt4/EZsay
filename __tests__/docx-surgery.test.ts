import { describe, it, expect, beforeAll } from "vitest";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  FootnoteReferenceRun,
} from "docx";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import {
  exportPreservedDocx,
  collectParagraphs,
  extractParagraphText,
  normalizeParaText,
  type SurgerySection,
} from "@/lib/export/docx-surgery";
import { parseDocx } from "@/lib/parsers/docx-parser";
import { parseAndSplit } from "@/lib/citations/parser";

// ── Fixture ────────────────────────────────────────────────────────────────
// A document with the constructs that matter: heading style, mixed bold/plain
// runs, a footnote reference mid-sentence, and a table.

const PLAIN_PARA = "This is a plain paragraph that will remain completely untouched by edits.";
const MIXED_PREFIX = "The study found that ";
const MIXED_BOLD = "artificial intelligence";
const MIXED_SUFFIX = " plays a pivotal role in modern education systems.";
const FOOTNOTE_BEFORE = "Some scholars disagree with this claim";
const FOOTNOTE_AFTER = " and argue for a different framing entirely.";
const CELL_A = "First cell paragraph with enough words to be a section.";
const CELL_B = "Second cell paragraph, also long enough to be its own section.";

async function buildFixture(): Promise<Buffer> {
  const doc = new Document({
    footnotes: {
      1: { children: [new Paragraph("A footnote body that never appears in sections.")] },
    },
    sections: [
      {
        children: [
          new Paragraph({ text: "Essay Title Heading", heading: HeadingLevel.HEADING_1 }),
          new Paragraph(PLAIN_PARA),
          new Paragraph({
            children: [
              new TextRun(MIXED_PREFIX),
              new TextRun({ text: MIXED_BOLD, bold: true }),
              new TextRun(MIXED_SUFFIX),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun(FOOTNOTE_BEFORE),
              new FootnoteReferenceRun(1),
              new TextRun(FOOTNOTE_AFTER),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(CELL_A)] }),
                  new TableCell({ children: [new Paragraph(CELL_B)] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc) as Promise<Buffer>;
}

/** Ingest exactly like the upload route: mammoth → parseAndSplit → sections. */
async function ingest(buffer: Buffer): Promise<SurgerySection[]> {
  const rawText = await parseDocx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const parsed = parseAndSplit(rawText);
  return parsed.sections.map((s) => ({ rawText: s.text, currentText: s.text }));
}

async function readDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("string");
}

let fixture: Buffer;
let baseSections: SurgerySection[];

beforeAll(async () => {
  fixture = await buildFixture();
  baseSections = await ingest(fixture);
});

// ── The round-trip invariant ───────────────────────────────────────────────

describe("exportPreservedDocx round trip", () => {
  it("ingests the fixture into the expected sections", () => {
    const texts = baseSections.map((s) => s.rawText);
    expect(texts).toContain(PLAIN_PARA);
    expect(texts).toContain(MIXED_PREFIX + MIXED_BOLD + MIXED_SUFFIX);
    // Footnote marker contributes no text at ingest
    expect(texts).toContain(FOOTNOTE_BEFORE + FOOTNOTE_AFTER);
    expect(texts).toContain(CELL_A);
    expect(texts).toContain(CELL_B);
  });

  it("applies edits and preserves everything else (round-trip invariant)", async () => {
    const sections = baseSections.map((s) => ({ ...s }));

    // (a) narrow splice in the mixed-run paragraph — bold span untouched
    const mixedIdx = sections.findIndex((s) => s.rawText.includes(MIXED_BOLD));
    sections[mixedIdx].currentText = sections[mixedIdx].rawText.replace(
      "plays a pivotal role",
      "matters a great deal",
    );

    // (b) full rewrite of the footnote paragraph
    const footIdx = sections.findIndex((s) => s.rawText.startsWith(FOOTNOTE_BEFORE));
    sections[footIdx].currentText = "A completely rewritten sentence about scholarly disagreement.";

    // (c) multi-paragraph rewrite of a table cell paragraph
    const cellIdx = sections.findIndex((s) => s.rawText === CELL_A);
    sections[cellIdx].currentText = "First replacement cell paragraph.\n\nSecond continuation paragraph in the same cell.";

    const result = await exportPreservedDocx(fixture, sections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Round trip: mammoth re-extract of the OUTPUT must equal the edited state.
    const roundTrip = await ingest(result.buffer);
    const expectedTexts = sections.flatMap((s) =>
      s.currentText.split(/\n\n+/).map((c) => normalizeParaText(c)).filter((c) => c !== ""),
    );
    expect(roundTrip.map((s) => s.rawText)).toEqual(expectedTexts);

    const outXml = await readDocumentXml(result.buffer);

    // Bold run outside the splice window survives with its formatting.
    const dom = new DOMParser().parseFromString(outXml, "text/xml");
    const runs = Array.from({ length: dom.getElementsByTagName("w:r").length }, (_, i) =>
      dom.getElementsByTagName("w:r").item(i)!,
    );
    const boldRun = runs.find((r) => (r.textContent ?? "").includes(MIXED_BOLD));
    expect(boldRun).toBeDefined();
    expect(boldRun!.getElementsByTagName("w:b").length).toBeGreaterThan(0);

    // Footnote marker survives the full rewrite of its paragraph.
    const inXml = await readDocumentXml(fixture);
    const countRefs = (xml: string) => (xml.match(/<w:footnoteReference[\s/>]/g) ?? []).length;
    expect(countRefs(outXml)).toBe(countRefs(inXml));

    // Every zip entry except word/document.xml is decompressed-byte-identical.
    const inZip = await JSZip.loadAsync(fixture);
    const outZip = await JSZip.loadAsync(result.buffer);
    const inNames = Object.keys(inZip.files).filter((n) => !inZip.files[n].dir).sort();
    const outNames = Object.keys(outZip.files).filter((n) => !outZip.files[n].dir).sort();
    expect(outNames).toEqual(inNames);
    for (const name of inNames) {
      if (name === "word/document.xml") continue;
      const a = await inZip.files[name].async("uint8array");
      const b = await outZip.files[name].async("uint8array");
      expect(Buffer.from(b).equals(Buffer.from(a)), `zip entry ${name} changed`).toBe(true);
    }
  });

  it("leaves the file untouched when nothing was edited", async () => {
    const result = await exportPreservedDocx(fixture, baseSections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundTrip = await ingest(result.buffer);
    expect(roundTrip.map((s) => s.rawText)).toEqual(baseSections.map((s) => s.rawText));
  });
});

// ── Guards ────────────────────────────────────────────────────────────────

describe("surgery guards", () => {
  it("refuses tracked changes", async () => {
    const zip = await JSZip.loadAsync(fixture);
    const xml = await zip.file("word/document.xml")!.async("string");
    const tampered = xml.replace("<w:body>", '<w:body><w:ins w:id="1" w:author="x"><w:r><w:t>inserted</w:t></w:r></w:ins>');
    zip.file("word/document.xml", tampered);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const result = await exportPreservedDocx(buf, baseSections);
    expect(result).toEqual({ ok: false, reason: "unsupported-construct" });
  });

  it("refuses when section count does not match", async () => {
    const result = await exportPreservedDocx(fixture, baseSections.slice(0, -1));
    expect(result).toEqual({ ok: false, reason: "alignment-failed" });
  });

  it("refuses when section text does not match", async () => {
    const sections = baseSections.map((s) => ({ ...s }));
    sections[0] = { rawText: "Totally different text than the file has.", currentText: "x" };
    const result = await exportPreservedDocx(fixture, sections);
    expect(result).toEqual({ ok: false, reason: "alignment-failed" });
  });

  it("refuses non-docx bytes", async () => {
    const result = await exportPreservedDocx(Buffer.from("not a zip file"), baseSections);
    expect(result).toEqual({ ok: false, reason: "malformed-docx" });
  });
});

// ── Extraction/collection parity on hand-written XML ─────────────────────

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

function parseFragment(inner: string) {
  const xml = `<w:document ${W} ${MC}><w:body>${inner}</w:body></w:document>`;
  const dom = new DOMParser().parseFromString(xml, "text/xml");
  // structural cast mirrors the module's internal types
  return dom.documentElement as unknown as Parameters<typeof collectParagraphs>[0];
}

describe("collectParagraphs / extractParagraphText parity", () => {
  it("skips w:p inside mc:Choice, reads mc:Fallback", () => {
    const root = parseFragment(
      `<mc:AlternateContent><mc:Choice><w:p><w:r><w:t>choice text</w:t></w:r></w:p></mc:Choice>` +
        `<mc:Fallback><w:p><w:r><w:t>fallback text</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent>`,
    );
    const paras = collectParagraphs(root);
    expect(paras.map((p) => extractParagraphText(p))).toEqual(["fallback text"]);
  });

  it("skips paragraphs inside w:drawing but keeps VML textbox paragraphs after their anchor", () => {
    const root = parseFragment(
      `<w:p><w:r><w:t>anchor</w:t></w:r><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>vml box</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>` +
        `<w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>dml box</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r><w:r><w:t>after drawing</w:t></w:r></w:p>`,
    );
    const paras = collectParagraphs(root);
    expect(paras.map((p) => extractParagraphText(p))).toEqual(["anchor", "vml box", "after drawing"]);
  });

  it("drops w:fldSimple subtrees like mammoth does", () => {
    const root = parseFragment(
      `<w:p><w:r><w:t>before </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>3</w:t></w:r></w:fldSimple><w:r><w:t>after</w:t></w:r></w:p>`,
    );
    const paras = collectParagraphs(root);
    expect(extractParagraphText(paras[0])).toBe("before after");
  });

  it("emits tab and noBreakHyphen, nothing for w:br", () => {
    const root = parseFragment(
      `<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t><w:noBreakHyphen/><w:t>d</w:t></w:r></w:p>`,
    );
    expect(extractParagraphText(collectParagraphs(root)[0])).toBe("a\tbc‑d");
  });

  it("filters whitespace-only paragraphs via normalization, like parseAndSplit", () => {
    const root = parseFragment(`<w:p><w:r><w:t>  </w:t></w:r></w:p><w:p><w:r><w:t>real</w:t></w:r></w:p>`);
    const nonEmpty = collectParagraphs(root)
      .map((p) => normalizeParaText(extractParagraphText(p)))
      .filter((t) => t !== "");
    expect(nonEmpty).toEqual(["real"]);
  });
});
