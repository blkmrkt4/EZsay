import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "module";

// pdfjs-dist v5 requires GlobalWorkerOptions.workerSrc to be a real path
// even on server-side (the previous "" empty-string hack stopped working).
// Resolve the bundled worker via the legacy build so it Just Works in Node.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

export async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  const doc = await getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n\n");
}
