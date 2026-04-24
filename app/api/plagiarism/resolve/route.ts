import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { plagiarismResults, sections, documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Resolve a plagiarism finding: rewrite, add citation, or dismiss.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { plagiarismResultId, action, replacementText } = await request.json() as {
    plagiarismResultId: string;
    action: "rewrite" | "cite" | "dismiss";
    replacementText?: string;
  };

  // Load the plagiarism result
  const [result] = await db
    .select()
    .from(plagiarismResults)
    .where(eq(plagiarismResults.id, plagiarismResultId))
    .limit(1);

  if (!result) {
    return NextResponse.json({ success: false, error: "Result not found" }, { status: 404 });
  }

  // Verify ownership
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, result.documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  if (action === "dismiss") {
    await db
      .update(plagiarismResults)
      .set({ status: "dismissed" })
      .where(eq(plagiarismResults.id, plagiarismResultId));

    return NextResponse.json({ success: true, data: { action: "dismissed" } });
  }

  // Find the section containing this passage
  const sectionId = result.sectionId;
  if (!sectionId) {
    return NextResponse.json({ success: false, error: "No section associated with this result" }, { status: 400 });
  }

  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!section) {
    return NextResponse.json({ success: false, error: "Section not found" }, { status: 404 });
  }

  if (action === "rewrite" && replacementText) {
    // Find the passage in current text (may have shifted from earlier edits)
    const idx = section.currentText.indexOf(result.passageText);
    if (idx < 0) {
      return NextResponse.json({ success: false, error: "Could not locate passage in current text — it may have been modified by earlier edits" }, { status: 400 });
    }

    const newText = section.currentText.slice(0, idx) + replacementText + section.currentText.slice(idx + result.passageText.length);

    await db
      .update(sections)
      .set({ currentText: newText })
      .where(eq(sections.id, sectionId));

    await db
      .update(plagiarismResults)
      .set({ status: "acknowledged" })
      .where(eq(plagiarismResults.id, plagiarismResultId));

    return NextResponse.json({ success: true, data: { action: "rewritten" } });
  }

  if (action === "cite") {
    // Auto-detect citation style from existing citations in the document
    const allSections = await db
      .select()
      .from(sections)
      .where(eq(sections.documentId, result.documentId));

    const fullText = allSections.map((s) => s.currentText).join("\n");

    // Simple detection: check for common patterns
    let citationFormat: "apa" | "harvard" | "mla" | "footnote" = "apa";
    if (/\(\w+,\s*\d{4}\)/.test(fullText)) citationFormat = "apa"; // (Author, 2024)
    else if (/\(\w+\s+\d{4}\)/.test(fullText)) citationFormat = "harvard"; // (Author 2024)
    else if (/\(\w+\s+\d+\)/.test(fullText)) citationFormat = "mla"; // (Author 12)
    else if (/\[\d+\]/.test(fullText)) citationFormat = "footnote"; // [1]

    const sourceTitle = result.topMatchTitle ?? "Unknown Source";
    const sourceUrl = result.topMatchUrl ?? "";

    let citation = "";
    if (citationFormat === "apa") {
      citation = ` (${sourceTitle}, n.d.)`;
    } else if (citationFormat === "harvard") {
      citation = ` (${sourceTitle} n.d.)`;
    } else if (citationFormat === "mla") {
      citation = ` (${sourceTitle})`;
    } else {
      citation = ` [Source: ${sourceTitle}]`;
    }

    // Insert citation at the end of the passage
    const idx = section.currentText.indexOf(result.passageText);
    if (idx < 0) {
      return NextResponse.json({ success: false, error: "Could not locate passage in current text" }, { status: 400 });
    }

    const passageEnd = idx + result.passageText.length;
    // Insert before the period if the passage ends with one
    let insertAt = passageEnd;
    if (section.currentText[passageEnd - 1] === ".") {
      insertAt = passageEnd - 1;
    }

    const newText = section.currentText.slice(0, insertAt) + citation + section.currentText.slice(insertAt);

    await db
      .update(sections)
      .set({ currentText: newText })
      .where(eq(sections.id, sectionId));

    await db
      .update(plagiarismResults)
      .set({ status: "acknowledged" })
      .where(eq(plagiarismResults.id, plagiarismResultId));

    return NextResponse.json({
      success: true,
      data: { action: "cited", citation, format: citationFormat },
    });
  }

  return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
}
