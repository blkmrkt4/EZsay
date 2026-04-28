import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { llmCallLog } from "@/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
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
  const activityType = searchParams.get("activityType");
  const outcome = searchParams.get("outcome");
  const model = searchParams.get("model");
  const from = searchParams.get("from"); // ISO date string
  const to = searchParams.get("to");     // ISO date string

  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const conditions = [];
  if (activityType) conditions.push(eq(llmCallLog.activityType, activityType));
  if (outcome) conditions.push(eq(llmCallLog.outcome, outcome as "accepted" | "rejected" | "skipped" | "pending"));
  if (model) conditions.push(eq(llmCallLog.modelUsed, model));
  if (from) conditions.push(gte(llmCallLog.createdAt, new Date(from)));
  if (to) conditions.push(lte(llmCallLog.createdAt, new Date(to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [countRow]] = await Promise.all([
    db
      .select()
      .from(llmCallLog)
      .where(where)
      .orderBy(desc(llmCallLog.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(llmCallLog)
      .where(where),
  ]);

  return NextResponse.json({
    success: true,
    data: { logs, total: Number(countRow.count), limit, offset },
  });
}
