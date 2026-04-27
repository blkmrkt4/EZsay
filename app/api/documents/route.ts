import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, documentVersions } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, user.id))
      .orderBy(desc(documents.createdAt));

    if (docs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Get version stats for all documents in one grouped query
    const docIds = docs.map((d) => d.id);
    let statsMap = new Map<string, { count: number; firstDate: string | null; lastDate: string | null }>();

    try {
      const versionStats = await db
        .select({
          documentId: documentVersions.documentId,
          count: sql<number>`count(*)`,
          firstDate: sql<string>`min(${documentVersions.createdAt})`,
          lastDate: sql<string>`max(${documentVersions.createdAt})`,
        })
        .from(documentVersions)
        .where(inArray(documentVersions.documentId, docIds))
        .groupBy(documentVersions.documentId);

      statsMap = new Map(
        versionStats.map((s) => [s.documentId, s])
      );
    } catch {
      // Version stats are non-critical — continue without them
    }

    const docsWithVersions = docs.map((doc) => {
      const stats = statsMap.get(doc.id);
      return {
        ...doc,
        versionCount: Number(stats?.count ?? 0),
        firstVersionDate: stats?.firstDate ?? null,
        lastVersionDate: stats?.lastDate ?? null,
      };
    });

    return NextResponse.json({ success: true, data: docsWithVersions });
  } catch (err) {
    console.error("Documents list failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load documents." },
      { status: 500 }
    );
  }
}
