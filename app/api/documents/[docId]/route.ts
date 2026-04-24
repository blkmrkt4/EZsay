import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, flags, flagOptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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

  // Load flags for all sections
  const sectionIds = docSections.map((s) => s.id);
  let docFlags: (typeof flags.$inferSelect)[] = [];
  if (sectionIds.length > 0) {
    // Load flags for each section
    const allFlags = await Promise.all(
      sectionIds.map((sid) =>
        db.select().from(flags).where(eq(flags.sectionId, sid))
      )
    );
    docFlags = allFlags.flat();
  }

  // Load flag options
  const flagIds = docFlags.map((f) => f.id);
  let docFlagOptions: (typeof flagOptions.$inferSelect)[] = [];
  if (flagIds.length > 0) {
    const allOptions = await Promise.all(
      flagIds.map((fid) =>
        db.select().from(flagOptions).where(eq(flagOptions.flagId, fid))
      )
    );
    docFlagOptions = allOptions.flat();
  }

  return NextResponse.json({
    success: true,
    data: {
      document: doc,
      sections: docSections,
      flags: docFlags,
      flagOptions: docFlagOptions,
    },
  });
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

  const { title } = await request.json();

  const [updated] = await db
    .update(documents)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updated });
}
