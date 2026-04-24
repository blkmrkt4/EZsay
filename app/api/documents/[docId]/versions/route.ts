import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, documentVersions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET: List all versions for a document.
 * POST: Save current state as a new version (user-triggered, like a git commit).
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.createdAt));

  return NextResponse.json({ success: true, data: versions });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Get current section texts to build snapshot
  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, docId))
    .orderBy(sections.index);

  const snapshotText = docSections.map((s) => s.currentText).join("\n\n");

  // Count existing versions to get next number
  const existing = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.versionNumber));

  const nextNumber = (existing[0]?.versionNumber ?? 0) + 1;

  // Build version label: docname-MonDD-YY.N
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[now.getMonth()];
  const day = now.getDate();
  const year = String(now.getFullYear()).slice(-2);
  const baseName = doc.title.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "doc";
  const versionLabel = `${baseName}-${mon}${day}-${year}.${nextNumber}`;

  const [version] = await db
    .insert(documentVersions)
    .values({
      documentId: docId,
      versionLabel,
      versionNumber: nextNumber,
      snapshotText,
      aiRiskScore: doc.aiRiskScore,
      writingQualityScore: doc.writingQualityScore,
    })
    .returning();

  return NextResponse.json({ success: true, data: version });
}
