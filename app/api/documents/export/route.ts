import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

/**
 * Export a document as .docx or .pdf
 * GET /api/documents/export?documentId=xxx&format=docx|pdf
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  const format = searchParams.get("format") ?? "docx";

  if (!documentId) {
    return new NextResponse("documentId required", { status: 400 });
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  // Build the full document text with sections
  const allSections = docSections.map((s) => ({
    text: s.currentText,
    isLocked: s.isLocked,
  }));

  if (format === "docx") {
    return generateDocx(doc.title, allSections);
  }

  // Default to plain text if format not recognized
  const fullText = allSections.map((s) => s.text).join("\n\n");
  return new NextResponse(fullText, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.title)}.txt"`,
    },
  });
}

async function generateDocx(
  title: string,
  sections: { text: string; isLocked: boolean }[]
): Promise<NextResponse> {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32, font: "Calibri" })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  for (const section of sections) {
    // Split section text into paragraphs
    const textParagraphs = section.text.split(/\n\n+/);

    for (const para of textParagraphs) {
      if (!para.trim()) continue;

      const trimmed = para.trim();

      // Detect headings (short lines, no period at end, likely a title)
      const isHeading = trimmed.length < 100 && !trimmed.endsWith(".") && !trimmed.endsWith(",") && !trimmed.includes(". ") && trimmed.split(/\s+/).length < 15;

      if (section.isLocked) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, size: 20, font: "Calibri", color: "444444" })],
            spacing: { after: 120 },
          })
        );
      } else if (isHeading) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, size: 26, font: "Calibri" })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
      } else {
        // Regular paragraph — handle line breaks within
        const lines = trimmed.split(/\n/);
        const runs: TextRun[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) runs.push(new TextRun({ break: 1 }));
          runs.push(new TextRun({ text: lines[i], size: 24, font: "Calibri" }));
        }
        paragraphs.push(
          new Paragraph({
            children: runs,
            spacing: { after: 200, line: 360 }, // 1.5 line spacing
          })
        );
      }
    }
  }

  const docxDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(docxDoc);
  const uint8 = new Uint8Array(buffer);

  return new NextResponse(uint8, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.docx"`,
    },
  });
}
