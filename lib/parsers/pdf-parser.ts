// Uses pdf-parse v2 class-based API with explicit worker bootstrap.

let pdfParseModulePromise: Promise<typeof import("pdf-parse")> | null = null;

async function loadPdfParse() {
  if (!pdfParseModulePromise) {
    pdfParseModulePromise = (async () => {
      const worker = await import("pdf-parse/worker");
      const mod = await import("pdf-parse");
      mod.PDFParse.setWorker(worker.getData());
      return mod;
    })();
  }

  return pdfParseModulePromise;
}

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
  const { PDFParse } = await loadPdfParse();

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let textResult: unknown = "";
  let infoResult: unknown = null;

  try {
    textResult = await parser.getText();
    infoResult = await parser.getInfo().catch(() => null);
  } finally {
    await parser.destroy?.();
  }

  // getText() returns an object with a .text property, or may return a string
  const joined = (
    typeof textResult === "string"
      ? textResult
      : typeof textResult === "object" && textResult !== null && "text" in textResult
        ? (textResult as { text: string }).text
        : String(textResult ?? "")
  ).trim();

  const pageCount = Number(
    (infoResult as Record<string, unknown>)?.total ??
    (infoResult as Record<string, unknown>)?.numpages ??
    0
  );

  const extractedWordCount = joined.length > 0 ? joined.split(/\s+/).length : 0;
  const averageWordsPerPage = pageCount > 0 ? extractedWordCount / pageCount : extractedWordCount;

  // Confidence based on total extracted words and words-per-page.
  // A typical text page has 250-350 words. Cover pages, bibliography, form pages,
  // and reference lists lower the average — that's normal, not a sign of failure.
  // Only flag genuinely image-based PDFs where extraction truly failed.
  const likelyGraphicsHeavy = pageCount >= 3 && averageWordsPerPage < 15;
  const confidence: "high" | "medium" | "low" =
    extractedWordCount < 80 || (pageCount >= 3 && averageWordsPerPage < 15)
      ? "low"
      : extractedWordCount < 200 || averageWordsPerPage < 50
        ? "medium"
        : "high";

  // Per-page text chunks (best-effort — many PDFs don't embed page breaks)
  const pages = joined.split(/\f|\n{3,}/);
  const pagesWithText = pages.filter((p) => p.trim().length > 10).length;
  const coverageRatio = pageCount > 0 ? Math.min(1, pagesWithText / pageCount) : 1;

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
