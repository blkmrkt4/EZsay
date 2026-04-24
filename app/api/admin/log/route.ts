import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { llmCallLog } from "@/db/schema";
import { desc } from "drizzle-orm";
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
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

  const logs = await db
    .select()
    .from(llmCallLog)
    .orderBy(desc(llmCallLog.createdAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: logs });
}
