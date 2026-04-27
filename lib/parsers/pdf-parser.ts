import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "module";

// pdfjs-dist v5 requires GlobalWorkerOptions.workerSrc to be a real path
// even on server-side (the previous "" empty-string hack stopped working).
// Resolve the bundled worker via the legacy build so it Just Works in Node.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

export interface PdfExtractionMeta {
  pageCount: number;
  pagesWithText: number;
  extractedWordCount: number;
  averageWordsPerPage: number;
  coverageRatio: number;
  likelyGraphicsHeavy: boolean;
  confidence: "high" | "medium" | "low";
}

export interface PdfParseResult {
  text: string;
  meta: PdfExtractionMeta;
}

export async function parsePdfWithMeta(buffer: ArrayBuffer): Promise<PdfParseResult> {
  const doc = await getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];
  let pagesWithText = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) pagesWithText += 1;
    pages.push(text);
  }

  const joined = pages.join("\n\n").trim();
  const extractedWordCount = joined.length > 0 ? joined.split(/\s+/).length : 0;
  const pageCount = doc.numPages;
  const coverageRatio = pageCount > 0 ? pagesWithText / pageCount : 0;
  const averageWordsPerPage = pageCount > 0 ? extractedWordCount / pageCount : 0;
  const likelyGraphicsHeavy = pageCount >= 2 && (coverageRatio < 0.5 || averageWordsPerPage < 40);
  const confidence =
    coverageRatio < 0.35 || averageWordsPerPage < 40 || extractedWordCount < 120
      ? "low"
      : coverageRatio < 0.7 || averageWordsPerPage < 80
        ? "medium"
        : "high";

  return {
    text: joined,
    meta: {
      pageCount,
      pagesWithText,
      extractedWordCount,
      averageWordsPerPage: Math.round(averageWordsPerPage * 10) / 10,
      coverageRatio: Math.round(coverageRatio * 1000) / 1000,
      likelyGraphicsHeavy,
      confidence,
    },
  };
}

export async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  const parsed = await parsePdfWithMeta(buffer);
  return parsed.text;
}
