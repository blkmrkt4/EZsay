import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { llmCallLog } from "@/db/schema";
import { desc } from "drizzle-orm";
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
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const logs = await db
    .select()
    .from(llmCallLog)
    .orderBy(desc(llmCallLog.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ success: true, data: logs });
}
