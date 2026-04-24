import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryEntries } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden", status: 403 };
  return { user };
}

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

  const conditions = [];
  if (status) conditions.push(eq(libraryEntries.status, status as "active" | "under_review" | "retired"));
  if (entryType) conditions.push(eq(libraryEntries.entryType, entryType as "exact_phrase" | "regex_pattern" | "semantic_pattern"));
  if (category) conditions.push(eq(libraryEntries.category, category as never));
  if (source) conditions.push(eq(libraryEntries.source, source as "manual" | "user_derived" | "ai_proposed"));
  if (search) conditions.push(sql`${libraryEntries.value} ILIKE ${"%" + search + "%"}`);

  const entries = await db
    .select()
    .from(libraryEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(libraryEntries.createdAt))
    .limit(200);

  // Count under_review for the badge
  const [reviewCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryEntries)
    .where(eq(libraryEntries.status, "under_review"));

  return NextResponse.json({
    success: true,
    data: { entries, reviewCount: Number(reviewCount.count) },
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
