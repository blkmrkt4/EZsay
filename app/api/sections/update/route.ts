import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { sections, documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Replace one sentence of a section with the user's own rewrite.
 * Used by the Writing Quality advisory's "Edit" mode — advisories are
 * document-wide scores with example sentences, so there is no flag row to
 * resolve; the edit targets the sentence text directly.
 *
 * The replacement is the USER'S OWN writing — it is applied verbatim,
 * never sanitized or corrected (silent changes to user text are forbidden).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { sectionId, originalSentence, replacementText } = await request.json() as {
    sectionId: string;
    originalSentence: string;
    replacementText: string;
  };

  if (!sectionId || !originalSentence || typeof replacementText !== "string" || !replacementText.trim()) {
    return NextResponse.json({ success: false, error: "sectionId, originalSentence and replacementText are required" }, { status: 400 });
  }

  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!section) {
    return NextResponse.json({ success: false, error: "Section not found" }, { status: 404 });
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, section.documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  if (section.isLocked) {
    return NextResponse.json({ success: false, error: "This section is locked (citations) and cannot be edited" }, { status: 400 });
  }

  const idx = section.currentText.indexOf(originalSentence);
  if (idx < 0) {
    return NextResponse.json(
      { success: false, error: "Could not locate the sentence in the current text — it may have been changed by an earlier edit" },
      { status: 400 },
    );
  }

  let end = idx + originalSentence.length;
  const replacement = replacementText.trim();
  // The sentence splitter strips terminal punctuation, so the matched span
  // excludes its final period. If the user's replacement supplies its own
  // terminal punctuation, drop the original's to avoid doubling ("..").
  if (/[.!?]$/.test(replacement) && /^[.!?]/.test(section.currentText.slice(end))) {
    end += 1;
  }

  const newText = section.currentText.slice(0, idx) + replacement + section.currentText.slice(end);

  // Optimistic concurrency guard: only write if the section still contains
  // the text we located the sentence in (a concurrent edit otherwise gets
  // silently reverted by this whole-text write).
  const written = await db
    .update(sections)
    .set({ currentText: newText })
    .where(and(eq(sections.id, sectionId), eq(sections.currentText, section.currentText)))
    .returning({ id: sections.id });

  if (written.length === 0) {
    return NextResponse.json(
      { success: false, error: "The document changed while saving — nothing was modified. Please retry.", code: "stale_section" },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, data: { sectionId, newText } });
}
