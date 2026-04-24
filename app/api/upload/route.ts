import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections } from "@/db/schema";
import { parseDocument, detectFileType } from "@/lib/parsers";
import { parseAndSplit } from "@/lib/citations/parser";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const pastedText = formData.get("text") as string | null;
  const title = (formData.get("title") as string) || "Untitled Document";
  const documentType =
    (formData.get("documentType") as string) || "professional";

  let rawText: string;

  if (file) {
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

    const buffer = await file.arrayBuffer();
    rawText = await parseDocument(buffer, fileType);
  } else if (pastedText && pastedText.trim().length > 0) {
    rawText = pastedText.trim();
  } else {
    return NextResponse.json(
      { success: false, error: "No file or text provided" },
      { status: 400 }
    );
  }

  if (rawText.trim().length < 50) {
    return NextResponse.json(
      { success: false, error: "Document is too short (minimum 50 characters)" },
      { status: 400 }
    );
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
}
