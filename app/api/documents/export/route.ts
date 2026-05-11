import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber, Header, convertInchesToTwip } from "docx";
import { applyTextFormatting } from "@/lib/export/format-text";

type Preferences = Record<string, unknown>;

/**
 * Export a document as .docx or .txt with style preferences applied.
 * GET /api/documents/export?documentId=xxx&format=docx|txt
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

  // Load user's style preferences (universal + document-type-specific, merged)
  const prefs = await loadMergedPreferences(user.id, doc.documentType);

  const allSections = docSections.map((s) => ({
    text: s.currentText,
    isLocked: s.isLocked,
  }));

  if (format === "docx") {
    return generateDocx(doc.title, allSections, prefs);
  }

  // Plain text — still apply text-level transforms
  const fullText = allSections
    .map((s) => applyTextFormatting(s.text, prefs))
    .join("\n\n");
  return new NextResponse(fullText, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.title)}.txt"`,
    },
  });
}

// ── Load merged style preferences ────────────────────────────────────────────

async function loadMergedPreferences(userId: string, documentType: string): Promise<Preferences> {
  const [universal] = await db
    .select()
    .from(userStylePreferences)
    .where(and(eq(userStylePreferences.userId, userId), isNull(userStylePreferences.documentType)))
    .limit(1);

  let typeSpecific = null;
  if (documentType) {
    const [row] = await db
      .select()
      .from(userStylePreferences)
      .where(
        and(
          eq(userStylePreferences.userId, userId),
          eq(userStylePreferences.documentType, documentType as "academic" | "professional" | "casual" | "legal"),
        ),
      )
      .limit(1);
    typeSpecific = row ?? null;
  }

  return {
    ...((universal?.preferences as Preferences) ?? {}),
    ...((typeSpecific?.preferences as Preferences) ?? {}),
  };
}

// ── Preference → DOCX value mappings ─────────────────────────────────────────

function resolveFont(prefs: Preferences): string {
  const pref = prefs.font_preference as string | undefined;
  if (pref === "serif") return "Times New Roman";
  if (pref === "sans_serif") return "Calibri";
  return "Times New Roman"; // default
}

function resolveFontSize(prefs: Preferences): number {
  // DOCX sizes are in half-points (24 = 12pt)
  const pref = prefs.font_size as string | undefined;
  if (pref === "10") return 20;
  if (pref === "11") return 22;
  if (pref === "12") return 24;
  return 24; // default 12pt
}

function resolveLineSpacing(prefs: Preferences): number {
  // DOCX line spacing in 240ths of a line
  const pref = prefs.line_spacing as string | undefined;
  if (pref === "single") return 240;
  if (pref === "1.5") return 360;
  if (pref === "double") return 480;
  return 360; // default 1.5
}

function resolveMargins(prefs: Preferences): { top: number; right: number; bottom: number; left: number } {
  const pref = prefs.margin_size as string | undefined;
  if (pref === "1.25_inch") return { top: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25), bottom: convertInchesToTwip(1.25), left: convertInchesToTwip(1.25) };
  if (pref === "2.5_cm") {
    const twip = Math.round(2.5 / 2.54 * 1440); // cm to inches to twip
    return { top: twip, right: twip, bottom: twip, left: twip };
  }
  // Default: 1 inch
  return { top: 1440, right: 1440, bottom: 1440, left: 1440 };
}

function resolveAlignment(prefs: Preferences): typeof AlignmentType[keyof typeof AlignmentType] {
  const pref = prefs.text_alignment as string | undefined;
  if (pref === "justified") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function resolveIndent(prefs: Preferences): number | undefined {
  const pref = prefs.paragraph_indent;
  if (pref === true || pref === "first_line") return 720; // 0.5 inch in twip
  return undefined;
}

// ── DOCX generation ──────────────────────────────────────────────────────────

async function generateDocx(
  title: string,
  allSections: { text: string; isLocked: boolean }[],
  prefs: Preferences,
): Promise<NextResponse> {
  const font = resolveFont(prefs);
  const fontSize = resolveFontSize(prefs);
  const lineSpacing = resolveLineSpacing(prefs);
  const margins = resolveMargins(prefs);
  const alignment = resolveAlignment(prefs);
  const indent = resolveIndent(prefs);

  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: fontSize + 8, font })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  for (const section of allSections) {
    // Apply text-level formatting
    const formatted = applyTextFormatting(section.text, prefs);
    const textParagraphs = formatted.split(/\n\n+/);

    for (const para of textParagraphs) {
      if (!para.trim()) continue;
      const trimmed = para.trim();

      // Detect headings
      const isHeading = trimmed.length < 100 && !trimmed.endsWith(".") && !trimmed.endsWith(",") && !trimmed.includes(". ") && trimmed.split(/\s+/).length < 15;

      if (section.isLocked) {
        // Citation/reference sections — smaller, gray
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, size: fontSize - 4, font, color: "444444" })],
            spacing: { after: 120 },
          })
        );
      } else if (isHeading) {
        const headingStyle = prefs.heading_style as string | undefined;
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({
              text: trimmed,
              bold: true,
              size: fontSize + 2,
              font,
              ...(headingStyle === "numbered" ? {} : {}),
            })],
            heading: HeadingLevel.HEADING_2,
            alignment: (headingStyle === "numbered" || headingStyle === "both") ? AlignmentType.LEFT : AlignmentType.CENTER,
            spacing: { before: 300, after: 150 },
          })
        );
      } else {
        // Regular paragraph
        const lines = trimmed.split(/\n/);
        const runs: TextRun[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) runs.push(new TextRun({ break: 1 }));
          runs.push(new TextRun({ text: lines[i], size: fontSize, font }));
        }
        paragraphs.push(
          new Paragraph({
            children: runs,
            alignment,
            spacing: { after: 200, line: lineSpacing },
            ...(indent ? { indent: { firstLine: indent } } : {}),
          })
        );
      }
    }
  }

  // Page numbering
  const pageNumbering = prefs.page_numbering as string | undefined;
  const footerChildren: Paragraph[] = [];
  if (pageNumbering && pageNumbering !== "none") {
    footerChildren.push(
      new Paragraph({
        children: [new TextRun({ children: [PageNumber.CURRENT], size: fontSize - 4, font })],
        alignment: pageNumbering === "bottom_right" ? AlignmentType.RIGHT : AlignmentType.CENTER,
      })
    );
  }

  const docxDoc = new Document({
    sections: [
      {
        properties: {
          page: { margin: margins },
        },
        ...(footerChildren.length > 0 ? {
          footers: { default: new Footer({ children: footerChildren }) },
        } : {}),
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
