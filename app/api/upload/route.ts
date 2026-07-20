import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { parseDocument, detectFileType } from "@/lib/parsers";
import { parsePdfWithMeta } from "@/lib/parsers/pdf-parser";
import { parseAndSplit } from "@/lib/citations/parser";
import { checkAllLimits } from "@/lib/stripe/plan-limits";
import { rateLimit } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/events/track";
import { eq } from "drizzle-orm";
import { createAdminClient, ORIGINALS_BUCKET } from "@/lib/supabase/admin";

const STORAGE_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain",
};

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
  const intakeRaw = formData.get("intake") as string | null;
  const intake = intakeRaw ? JSON.parse(intakeRaw) : null;

  let rawText: string;
  let extractionMeta: ExtractionMeta | null = null;
  // Original file bytes, kept so the upload can be stored in the `originals`
  // bucket after the document row exists. The stored .docx powers
  // formatting-preserving export (lib/export/docx-surgery.ts).
  let originalBuffer: ArrayBuffer | null = null;
  let originalExt: "pdf" | "docx" | "txt" | null = null;

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
      originalBuffer = buffer;
      originalExt = fileType;
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
      const isGraphicsHeavy = extractionMeta.likelyGraphicsHeavy === true;
      const errorMsg = isGraphicsHeavy
        ? "This PDF appears to be primarily images or graphics. We couldn't extract enough text to analyse."
        : "We couldn't extract enough text from this PDF. It may be scanned or image-based.";
      return NextResponse.json(
        { success: false, error: errorMsg },
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
        trackEvent("limit_hit", user.id, { limit_type: "word", words: uploadWordCount, limit: docWordCheck.limit });
        return NextResponse.json(
          { success: false, error: `Document exceeds your plan's per-document limit (${uploadWordCount.toLocaleString()} words, limit is ${docWordCheck.limit.toLocaleString()}).`, limitType: "perDocumentWordLimit" },
          { status: 402 }
        );
      }
      const storageCheck = limitResults.documentStorageLimit;
      if (storageCheck && !storageCheck.allowed) {
        trackEvent("limit_hit", user.id, { limit_type: "document", current: storageCheck.current, limit: storageCheck.limit });
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
        intake,
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

    // Store the original file bytes — best-effort: a storage failure must
    // never fail the upload (export simply falls back to the re-typeset path).
    if (originalBuffer && originalExt) {
      try {
        const storagePath = `${user.id}/${doc.id}.${originalExt}`;
        const { error: storageError } = await createAdminClient()
          .storage.from(ORIGINALS_BUCKET)
          .upload(storagePath, Buffer.from(originalBuffer), {
            contentType: STORAGE_MIME[originalExt],
            upsert: true,
          });
        if (storageError) throw storageError;
        await db.update(documents).set({ storagePath }).where(eq(documents.id, doc.id));
      } catch (storageErr) {
        console.warn("[upload] Storing original file failed (continuing without):", storageErr instanceof Error ? storageErr.message : storageErr);
      }
    }

    const wordCount = rawText.split(/\s+/).length;

    trackEvent("upload_completed", user.id, { documentId: doc.id, wordCount, documentType });
    trackEvent("document_created", user.id, { documentId: doc.id });

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
