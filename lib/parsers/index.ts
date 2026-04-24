import { parsePdf } from "./pdf-parser";
import { parseDocx } from "./docx-parser";
import { parseTxt } from "./txt-parser";

export type FileType = "pdf" | "docx" | "txt";

export function detectFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt") return "txt";
  return null;
}

export async function parseDocument(
  buffer: ArrayBuffer,
  fileType: FileType
): Promise<string> {
  switch (fileType) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "txt":
      return parseTxt(buffer);
  }
}
