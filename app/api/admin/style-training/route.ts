import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { styleTraining } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const items = await db
    .select()
    .from(styleTraining)
    .orderBy(styleTraining.sortOrder);

  return NextResponse.json({ success: true, data: items });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { action } = body;

  if (action === "update_preference") {
    const { id, preference } = body;
    const [updated] = await db
      .update(styleTraining)
      .set({ preference })
      .where(eq(styleTraining.id, id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "bulk_update") {
    const { category, preference } = body;
    await db
      .update(styleTraining)
      .set({ preference })
      .where(eq(styleTraining.category, category));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
