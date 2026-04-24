import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, documentVersions } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, user.id))
    .orderBy(desc(documents.createdAt));

  // Get version stats for each document
  const docsWithVersions = await Promise.all(
    docs.map(async (doc) => {
      const versionStats = await db
        .select({
          count: sql<number>`count(*)`,
          firstDate: sql<string>`min(${documentVersions.createdAt})`,
          lastDate: sql<string>`max(${documentVersions.createdAt})`,
        })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id));

      const stats = versionStats[0];
      return {
        ...doc,
        versionCount: Number(stats?.count ?? 0),
        firstVersionDate: stats?.firstDate ?? null,
        lastVersionDate: stats?.lastDate ?? null,
      };
    })
  );

  return NextResponse.json({ success: true, data: docsWithVersions });
}
