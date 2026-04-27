import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { parseDocument, detectFileType } from "@/lib/parsers";
import { parsePdfWithMeta } from "@/lib/parsers/pdf-parser";
import { parseAndSplit } from "@/lib/citations/parser";
import { checkAllLimits } from "@/lib/stripe/plan-limits";
import { rateLimit } from "@/lib/rate-limit";

type ExtractionMeta = {
  sourceType: "pdf" | "docx" | "txt" | "pasted";
  confidence: "high" | "medium" | "low";
  likelyGraphicsHeavy: boolean;
  pageCount?: number;
  pagesWithText?: number;
  extractedWordCount?: number;
  averageWordsPerPage?: number;
  coverageRatio?: number;
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Rate limit: 20 uploads per minute per user
  const rl = rateLimit(`upload:${user.id}`, 20, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { success: false, error: "Too many uploads. Please wait a moment." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const pastedText = formData.get("text") as string | null;
  const title = (formData.get("title") as string) || "Untitled Document";
  const documentType =
    (formData.get("documentType") as string) || "professional";

  let rawText: string;
  let extractionMeta: ExtractionMeta | null = null;

  if (file) {
    // Cap file size at 10MB to prevent memory/CPU issues
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "File is too large (maximum 10 MB)." },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file.name);
    if (!fileType) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type. Use .pdf, .docx, or .txt",
        },
        { status: 400 }
      );
    }

    try {
      const buffer = await file.arrayBuffer();
      if (fileType === "pdf") {
        try {
          const parsed = await parsePdfWithMeta(buffer);
          rawText = parsed.text;
          extractionMeta = {
            sourceType: "pdf",
            confidence: parsed.meta.confidence,
            likelyGraphicsHeavy: parsed.meta.likelyGraphicsHeavy,
            pageCount: parsed.meta.pageCount,
            pagesWithText: parsed.meta.pagesWithText,
            extractedWordCount: parsed.meta.extractedWordCount,
            averageWordsPerPage: parsed.meta.averageWordsPerPage,
            coverageRatio: parsed.meta.coverageRatio,
          };
        } catch (pdfErr) {
          // parsePdfWithMeta failed — fall back to basic parser
          console.warn("parsePdfWithMeta failed, falling back to parseDocument:", pdfErr instanceof Error ? pdfErr.message : pdfErr);
          rawText = await parseDocument(buffer, fileType);
          extractionMeta = {
            sourceType: "pdf",
            confidence: "medium",
            likelyGraphicsHeavy: false,
          };
        }
      } else {
        rawText = await parseDocument(buffer, fileType);
        extractionMeta = {
          sourceType: fileType,
          confidence: "high",
          likelyGraphicsHeavy: false,
        };
      }
    } catch (err) {
      console.error("File parsing failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { success: false, error: `Failed to parse the uploaded file: ${message}` },
        { status: 400 }
      );
    }
  } else if (pastedText && pastedText.trim().length > 0) {
    rawText = pastedText.trim();
    extractionMeta = {
      sourceType: "pasted",
      confidence: "high",
      likelyGraphicsHeavy: false,
    };
  } else {
    return NextResponse.json(
      { success: false, error: "No file or text provided" },
      { status: 400 }
    );
  }

  if (rawText.trim().length < 50) {
    if (extractionMeta?.sourceType === "pdf") {
      const coverageText = extractionMeta.coverageRatio != null
        ? `about ${Math.round(extractionMeta.coverageRatio * 100)}% of pages with text`
        : "very little extractable text";
      return NextResponse.json(
        {
          success: false,
          error: `This PDF appears image/graphics-heavy. We found ${coverageText}, so there isn't enough text to score reliably.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Document is too short (minimum 50 characters)" },
      { status: 400 }
    );
  }

  try {
    // Check plan limits (single DB round trip for all limits)
    const uploadWordCount = rawText.split(/\s+/).length;

    const { allAllowed, results: limitResults } = await checkAllLimits(user.id, [
      { limitType: "perDocumentWordLimit", additionalAmount: uploadWordCount },
      { limitType: "documentStorageLimit", additionalAmount: 1 },
    ]);

    if (!allAllowed) {
      const docWordCheck = limitResults.perDocumentWordLimit;
      if (docWordCheck && !docWordCheck.allowed) {
        return NextResponse.json(
          { success: false, error: `Document exceeds your plan's per-document limit (${uploadWordCount.toLocaleString()} words, limit is ${docWordCheck.limit.toLocaleString()}).`, limitType: "perDocumentWordLimit" },
          { status: 402 }
        );
      }
      const storageCheck = limitResults.documentStorageLimit;
      if (storageCheck && !storageCheck.allowed) {
        return NextResponse.json(
          { success: false, error: `Document storage limit reached (${storageCheck.current} / ${storageCheck.limit} documents). Delete a document or upgrade.`, limitType: "documentStorageLimit" },
          { status: 402 }
        );
      }
    }

    // Parse, lock citations, split into sections
    const parsed = parseAndSplit(rawText);

    // Create document record
    const [doc] = await db
      .insert(documents)
      .values({
        userId: user.id,
        title,
        rawText,
        documentType: documentType as
          | "academic"
          | "professional"
          | "casual"
          | "legal",
        status: "uploaded",
        extractionMeta,
      })
      .returning();

    // Create section records
    const sectionValues = parsed.sections.map((s, i) => ({
      documentId: doc.id,
      index: i,
      rawText: s.text,
      currentText: s.text,
      isLocked: s.isLocked,
    }));

    if (sectionValues.length > 0) {
      await db.insert(sections).values(sectionValues);
    }

    const wordCount = rawText.split(/\s+/).length;

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc.id,
        title: doc.title,
        documentType: doc.documentType,
        wordCount,
        sectionCount: parsed.sections.length,
        citationCount: parsed.citations.length,
        lockedSections: parsed.sections.filter((s) => s.isLocked).length,
      },
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { success: false, error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
