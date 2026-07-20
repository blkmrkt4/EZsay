/**
 * Formatting-preserving .docx export ("surgery").
 *
 * Takes the ORIGINAL uploaded .docx bytes plus the document's sections and
 * rewrites word/document.xml in place: only paragraphs the user actually
 * edited (currentText !== rawText) are touched; everything else — styles,
 * tables, images, footnotes, headers, numbering — passes through unchanged.
 *
 * Safety model: alignment between the file's paragraphs and the sections rows
 * is ALL-OR-NOTHING. Paragraph collection and text extraction deliberately
 * mirror how mammoth.extractRawText read this same file at upload (verified
 * against mammoth 1.12.0 source), and every paragraph must match its section's
 * rawText exactly after normalization — otherwise we refuse and the caller
 * falls back to the generic re-typeset export. A tolerant match could write an
 * edit into the wrong paragraph, which is the one unacceptable failure.
 */

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export type SurgeryFailReason =
  | "malformed-docx"
  | "unsupported-construct"
  | "alignment-failed"
  | "edited-field-paragraph"
  | "surgery-error";

export type SurgeryResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; reason: SurgeryFailReason };

export interface SurgerySection {
  rawText: string;
  currentText: string;
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Minimal structural node types — xmldom's classes conform to these, and they
// keep the module independent of DOM-lib vs xmldom type friction.
interface XNode {
  nodeType: number;
  firstChild: XNode | null;
  nextSibling: XNode | null;
  parentNode: XNode | null;
  textContent: string | null;
  cloneNode(deep: boolean): XNode;
}
interface XElement extends XNode {
  localName: string;
  namespaceURI: string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: XNode): XNode;
  insertBefore(newNode: XNode, ref: XNode | null): XNode;
  removeChild(child: XNode): XNode;
  getElementsByTagNameNS(ns: string, local: string): { length: number; item(i: number): XElement | null };
}
interface XDocument {
  documentElement: XElement | null;
  createElementNS(ns: string, qualified: string): XElement;
  createTextNode(text: string): XNode;
}

const ELEMENT_NODE = 1;

function isElement(n: XNode): n is XElement {
  return n.nodeType === ELEMENT_NODE;
}

function isW(el: XElement, local: string): boolean {
  return el.localName === local && el.namespaceURI === W_NS;
}

function* elementChildren(node: XNode): Generator<XElement> {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (isElement(c)) yield c;
  }
}

/** Exact copy of the paragraph normalization in lib/citations/parser.ts —
 * sections.rawText was produced by it, so parity is mandatory. */
export function normalizeParaText(s: string): string {
  return s
    .trim()
    .replace(/([^\n])\n(?!\n)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Collect w:p elements in the order mammoth emits paragraphs in raw text.
 * Default-descend with explicit skips:
 *  - mc:Choice   — mammoth reads mc:Fallback only
 *  - w:drawing   — DrawingML textbox text is dropped by mammoth
 *  - w:fldSimple — mammoth drops the whole subtree
 * Nested w:p (VML textboxes under w:pict) are collected AFTER their anchor
 * paragraph, matching mammoth's toExtra()/insertExtra behavior (pre-order).
 */
export function collectParagraphs(root: XElement): XElement[] {
  const out: XElement[] = [];
  const walk = (node: XNode) => {
    for (const el of elementChildren(node)) {
      if (el.localName === "Choice") continue;
      if (isW(el, "drawing")) continue;
      if (isW(el, "fldSimple")) continue;
      if (isW(el, "p")) {
        out.push(el);
        walk(el); // nested textbox paragraphs come after their anchor
        continue;
      }
      walk(el);
    }
  };
  walk(root);
  return out;
}

/**
 * Extract a paragraph's text exactly as mammoth's raw-text pass would:
 * descend only through containers mammoth reads (runs, hyperlinks, smart
 * tags, content controls, mc:Fallback); emit w:t text, w:tab → \t,
 * w:noBreakHyphen → U+2011, w:softHyphen → U+00AD; w:br emits nothing.
 * Anything unrecognized is skipped whole — if mammoth *did* read it, the
 * alignment gate catches the difference and we fall back.
 */
export function extractParagraphText(p: XElement): string {
  let text = "";
  const DESCEND = new Set(["r", "hyperlink", "smartTag", "sdt", "sdtContent", "AlternateContent", "Fallback"]);
  const visit = (node: XNode) => {
    for (const el of elementChildren(node)) {
      const ln = el.localName;
      if (ln === "p") continue; // nested paragraph = its own candidate
      if (ln === "t" && el.namespaceURI === W_NS) {
        text += el.textContent ?? "";
        continue;
      }
      if (ln === "tab" && el.namespaceURI === W_NS) { text += "\t"; continue; }
      if (ln === "noBreakHyphen" && el.namespaceURI === W_NS) { text += "‑"; continue; }
      if (ln === "softHyphen" && el.namespaceURI === W_NS) { text += "­"; continue; }
      if (ln === "sdtPr") continue; // sdt properties hold placeholder text — not content
      if (ln === "Choice") continue;
      if (DESCEND.has(ln)) { visit(el); continue; }
      // everything else (pPr, rPr, drawing, pict, instrText, delText, br, …): skip subtree
    }
  };
  visit(p);
  return text;
}

/** True if the subtree contains any element with one of these local names. */
function containsAny(el: XElement, locals: string[]): boolean {
  for (const local of locals) {
    if (el.getElementsByTagNameNS(W_NS, local).length > 0) return true;
  }
  return false;
}

// XML 1.0 forbidden control chars (keep \t \n \r which we handle structurally)
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Build run element(s) for a text chunk: \t → <w:tab/>, \n → <w:br/>,
 * everything else in <w:t xml:space="preserve">. One run, mixed children.
 */
function makeRun(doc: XDocument, text: string, donorRpr: XNode | null): XElement {
  const run = doc.createElementNS(W_NS, "w:r");
  if (donorRpr) run.appendChild(donorRpr.cloneNode(true));
  const clean = text.replace(INVALID_XML_CHARS, "");
  let buf = "";
  const flushText = () => {
    if (buf === "") return;
    const t = doc.createElementNS(W_NS, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.appendChild(doc.createTextNode(buf));
    run.appendChild(t);
    buf = "";
  };
  for (const ch of clean) {
    if (ch === "\t") {
      flushText();
      run.appendChild(doc.createElementNS(W_NS, "w:tab"));
    } else if (ch === "\n") {
      flushText();
      run.appendChild(doc.createElementNS(W_NS, "w:br"));
    } else {
      buf += ch;
    }
  }
  flushText();
  return run;
}

/** The donor rPr for replacement text: from the first run (searched in
 * document order among `candidates`) that carries non-whitespace w:t text. */
function findDonorRpr(candidates: XElement[]): XNode | null {
  for (const child of candidates) {
    for (const runEl of iterateRuns(child)) {
      let hasText = false;
      for (const el of elementChildren(runEl)) {
        if (isW(el, "t") && (el.textContent ?? "").trim() !== "") hasText = true;
      }
      if (!hasText) continue;
      for (const el of elementChildren(runEl)) {
        if (isW(el, "rPr")) return el;
      }
      return null; // run has text but no rPr — inherit paragraph style
    }
  }
  return null;
}

/** Yields w:r elements at or under an inline child (handles hyperlink wrappers). */
function* iterateRuns(el: XElement): Generator<XElement> {
  if (isW(el, "r")) {
    yield el;
    return;
  }
  for (const child of elementChildren(el)) {
    yield* iterateRuns(child);
  }
}

/** Nodes that must survive an edit even when their run is replaced:
 * footnote/endnote/comment markers and anchored images. */
function isPreservableSpecial(el: XElement): boolean {
  if (isW(el, "bookmarkStart") || isW(el, "bookmarkEnd")) return true;
  if (isW(el, "commentRangeStart") || isW(el, "commentRangeEnd")) return true;
  if (isW(el, "r")) {
    return containsAny(el, ["footnoteReference", "endnoteReference", "commentReference", "drawing", "pict"]);
  }
  return false;
}

interface InlineChild {
  el: XElement;
  text: string; // this child's contribution to the extracted paragraph text
  start: number;
  end: number;
}

/** The paragraph's inline children (everything except w:pPr) with offsets. */
function inlineChildrenWithOffsets(p: XElement): InlineChild[] {
  const out: InlineChild[] = [];
  let offset = 0;
  for (const el of elementChildren(p)) {
    if (isW(el, "pPr")) continue;
    // Reuse the extraction whitelist by wrapping the child in a probe visit:
    const text = extractChildText(el);
    out.push({ el, text, start: offset, end: offset + text.length });
    offset += text.length;
  }
  return out;
}

/** extractParagraphText's rules applied to a single inline child. */
function extractChildText(el: XElement): string {
  const holder = { textParts: [] as string[] };
  const visitOne = (e: XElement) => {
    const ln = e.localName;
    if (ln === "p") return;
    if (ln === "t" && e.namespaceURI === W_NS) { holder.textParts.push(e.textContent ?? ""); return; }
    if (ln === "tab" && e.namespaceURI === W_NS) { holder.textParts.push("\t"); return; }
    if (ln === "noBreakHyphen" && e.namespaceURI === W_NS) { holder.textParts.push("‑"); return; }
    if (ln === "softHyphen" && e.namespaceURI === W_NS) { holder.textParts.push("­"); return; }
    if (ln === "sdtPr" || ln === "Choice" || ln === "pPr" || ln === "rPr") return;
    if (["r", "hyperlink", "smartTag", "sdt", "sdtContent", "AlternateContent", "Fallback"].includes(ln)) {
      for (const c of elementChildren(e)) visitOne(c);
    }
    // else: skip subtree
  };
  visitOne(el);
  return holder.textParts.join("");
}

function longestCommonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function longestCommonSuffix(a: string, b: string, maxAllowed: number): number {
  const max = Math.min(a.length, b.length, maxAllowed);
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/**
 * Rewrite one edited paragraph in place.
 * When the paragraph's raw extracted text equals rawText exactly (usual case),
 * a prefix/suffix splice keeps every original run outside the changed window —
 * preserving bold spans, hyperlinks, and note markers untouched by the edit.
 * Otherwise the whole paragraph text is replaced (special nodes re-appended).
 */
function spliceParagraph(doc: XDocument, p: XElement, rawText: string, newText: string): void {
  const children = inlineChildrenWithOffsets(p);
  const extracted = children.map((c) => c.text).join("");

  let prefixLen = 0;
  let suffixLen = 0;
  if (extracted === rawText) {
    prefixLen = longestCommonPrefix(rawText, newText);
    suffixLen = longestCommonSuffix(rawText, newText, Math.min(rawText.length, newText.length) - prefixLen);
  }
  const suffixStart = extracted.length - suffixLen;

  const keptPrefix: InlineChild[] = [];
  const keptSuffix: InlineChild[] = [];
  const removed: InlineChild[] = [];
  for (const c of children) {
    if (c.end <= prefixLen) keptPrefix.push(c);
    else if (c.start >= suffixStart) keptSuffix.push(c);
    else removed.push(c);
  }

  const keptPrefixText = keptPrefix.reduce((n, c) => n + c.text.length, 0);
  const keptSuffixText = keptSuffix.reduce((n, c) => n + c.text.length, 0);
  const replacement = newText.slice(keptPrefixText, newText.length - keptSuffixText);

  const donorRpr = findDonorRpr(removed.map((c) => c.el)) ?? findDonorRpr(children.map((c) => c.el));
  const specials = removed.filter((c) => isPreservableSpecial(c.el));

  const insertRef = keptSuffix.length > 0 ? keptSuffix[0].el : null;
  for (const c of removed) {
    if (!specials.includes(c)) p.removeChild(c.el);
  }
  const newRun = makeRun(doc, replacement, donorRpr);
  p.insertBefore(newRun, specials.length > 0 ? specials[0].el : insertRef);
  // Preserved specials keep their original relative order, moved to sit
  // directly after the replacement run (their run text, if any, was replaced).
  for (const c of specials) {
    p.removeChild(c.el);
    p.insertBefore(c.el, insertRef);
  }
}

/** Clone a paragraph's pPr for a continuation paragraph, stripping w:sectPr
 * (duplicating a section break would corrupt the document layout). */
function clonePprWithoutSectPr(p: XElement): XNode | null {
  for (const el of elementChildren(p)) {
    if (isW(el, "pPr")) {
      const clone = el.cloneNode(true) as XElement;
      for (const child of [...elementChildren(clone)]) {
        if (isW(child, "sectPr")) clone.removeChild(child);
      }
      return clone;
    }
  }
  return null;
}

export async function exportPreservedDocx(
  original: Buffer,
  sections: SurgerySection[],
): Promise<SurgeryResult> {
  try {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(original);
    } catch {
      return { ok: false, reason: "malformed-docx" };
    }
    const docEntry = zip.file("word/document.xml");
    if (!docEntry) return { ok: false, reason: "malformed-docx" };
    const xml = await docEntry.async("string");

    // Tracked changes and OLE objects change how mammoth shaped the text at
    // upload in ways we don't model — refuse rather than guess.
    if (/<w:(ins|del|moveFrom|moveTo|object)[\s>\/]/.test(xml)) {
      return { ok: false, reason: "unsupported-construct" };
    }

    const dom = new DOMParser().parseFromString(xml, "text/xml") as unknown as XDocument;
    const root = dom.documentElement;
    if (!root) return { ok: false, reason: "malformed-docx" };

    // Align: the file's paragraphs (mammoth order, empty ones filtered) must
    // match the sections rows one-to-one, exactly.
    const allParagraphs = collectParagraphs(root);
    const candidates: { el: XElement; norm: string }[] = [];
    for (const p of allParagraphs) {
      const norm = normalizeParaText(extractParagraphText(p));
      if (norm !== "") candidates.push({ el: p, norm });
    }
    if (candidates.length !== sections.length) {
      return { ok: false, reason: "alignment-failed" };
    }
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].norm !== sections[i].rawText) {
        return { ok: false, reason: "alignment-failed" };
      }
    }

    // Rewrite edited paragraphs.
    for (let i = 0; i < sections.length; i++) {
      const { rawText, currentText } = sections[i];
      if (currentText === rawText) continue;
      const p = candidates[i].el;

      // Fields and content controls inside an edited paragraph can't be
      // spliced without silently losing the edit or the field — refuse.
      if (containsAny(p, ["fldChar", "fldSimple", "sdt"])) {
        return { ok: false, reason: "edited-field-paragraph" };
      }

      const chunks = currentText.split(/\n\n+/).map((c) => c.trim()).filter((c) => c !== "");
      const first = chunks.length > 0 ? chunks[0] : "";
      // spliceParagraph compares its own extraction against rawText: when they
      // match exactly (normalization was identity) it does a prefix/suffix
      // splice; otherwise it replaces the whole paragraph text.
      spliceParagraph(dom, p, rawText, first);

      if (chunks.length > 1) {
        const donorRpr = findDonorRpr([p]);
        const parent = p.parentNode as XElement | null;
        if (!parent) return { ok: false, reason: "surgery-error" };
        let ref: XNode | null = p.nextSibling;
        for (const chunk of chunks.slice(1)) {
          const newP = dom.createElementNS(W_NS, "w:p");
          const ppr = clonePprWithoutSectPr(p);
          if (ppr) newP.appendChild(ppr);
          newP.appendChild(makeRun(dom, chunk, donorRpr));
          parent.insertBefore(newP, ref);
          ref = newP.nextSibling;
        }
      }
    }

    // Serialize; keep exactly one XML prolog (xmldom re-emits it when the
    // parsed document had one — only prepend if it didn't survive).
    const serialized = new XMLSerializer().serializeToString(dom as never);
    const prologMatch = xml.match(/^<\?xml[^>]*\?>\s*/);
    const newXml = serialized.startsWith("<?xml")
      ? serialized
      : (prologMatch ? prologMatch[0] : "") + serialized;

    zip.file("word/document.xml", newXml);
    const out = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    return { ok: true, buffer: out };
  } catch (err) {
    console.error("[docx-surgery] Unexpected failure:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "surgery-error" };
  }
}
