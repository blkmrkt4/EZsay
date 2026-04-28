import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryEntries } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const entryType = searchParams.get("entryType");
  const category = searchParams.get("category");
  const source = searchParams.get("source");
  const search = searchParams.get("search");

  const limit = Math.min(Number(searchParams.get("limit") || 200), 500);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const conditions = [];
  if (status) conditions.push(eq(libraryEntries.status, status as "active" | "under_review" | "retired"));
  if (entryType) conditions.push(eq(libraryEntries.entryType, entryType as "exact_phrase" | "regex_pattern" | "semantic_pattern"));
  if (category) conditions.push(eq(libraryEntries.category, category as never));
  if (source) conditions.push(eq(libraryEntries.source, source as "manual" | "user_derived" | "ai_proposed"));
  if (search) conditions.push(sql`${libraryEntries.value} ILIKE ${"%" + search + "%"}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, [totalRow], [reviewCount]] = await Promise.all([
    db
      .select()
      .from(libraryEntries)
      .where(where)
      .orderBy(desc(libraryEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(libraryEntries)
      .where(where),
    db
      .select({ count: sql<number>`count(*)` })
      .from(libraryEntries)
      .where(eq(libraryEntries.status, "under_review")),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      entries,
      total: Number(totalRow.count),
      reviewCount: Number(reviewCount.count),
      limit,
      offset,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const body = await request.json();
  const {
    entryType,
    value,
    category,
    severity,
    explanation,
    documentTypes,
    notes,
  } = body;

  const [entry] = await db
    .insert(libraryEntries)
    .values({
      entryType,
      value,
      category,
      severity,
      explanation,
      documentTypes: documentTypes || ["all"],
      status: "active",
      source: "manual",
      notes,
      addedBy: auth.user.id,
    })
    .returning();

  return NextResponse.json({ success: true, data: entry });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const body = await request.json();
  const { id, ...updates } = body;

  const [entry] = await db
    .update(libraryEntries)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(libraryEntries.id, id))
    .returning();

  return NextResponse.json({ success: true, data: entry });
}
