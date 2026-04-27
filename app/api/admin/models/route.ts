import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { modelConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
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

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const configs = await db
    .select()
    .from(modelConfigs)
    .orderBy(modelConfigs.activityType);

  return NextResponse.json({ success: true, data: configs });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const {
      activityType,
      primaryModel,
      fallbackModel1,
      fallbackModel2,
      temperature,
      maxTokens,
    } = body;

    const [updated] = await db
      .update(modelConfigs)
      .set({
        primaryModel,
        fallbackModel1,
        fallbackModel2,
        temperature,
        maxTokens,
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.activityType, activityType))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("Admin models PUT error:", err);
    return NextResponse.json({ success: false, error: "Update failed." }, { status: 500 });
  }
}
