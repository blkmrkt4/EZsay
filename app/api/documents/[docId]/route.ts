import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const docSections = await db
      .select()
      .from(sections)
      .where(eq(sections.documentId, docId))
      .orderBy(sections.index);

    // Load all flags for this document's sections in one query
    const sectionIds = docSections.map((s) => s.id);
    const docFlags = sectionIds.length > 0
      ? await db.select().from(flags).where(inArray(flags.sectionId, sectionIds))
      : [];

    // Load all flag options in one query
    const flagIds = docFlags.map((f) => f.id);
    const docFlagOptions = flagIds.length > 0
      ? await db.select().from(flagOptions).where(inArray(flagOptions.flagId, flagIds))
      : [];

    return NextResponse.json({
      success: true,
      data: {
        document: doc,
        sections: docSections,
        flags: docFlags,
        flagOptions: docFlagOptions,
      },
    });
  } catch (err) {
    console.error("Document load failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load document." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Sections, flags, flag options, and citations all cascade on delete.
    const deleted = await db
      .delete(documents)
      .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
      .returning({ id: documents.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { id: docId } });
  } catch (err) {
    console.error("Document delete failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete document." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.intake !== undefined) updates.intake = body.intake;
    if (
      body.documentType !== undefined &&
      ["academic", "professional", "casual", "legal"].includes(body.documentType)
    ) {
      updates.documentType = body.documentType;
    }

    const [updated] = await db
      .update(documents)
      .set(updates)
      .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("Document update failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update document." },
      { status: 500 }
    );
  }
}
