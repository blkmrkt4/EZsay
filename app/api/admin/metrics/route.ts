import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { sql, and, gte, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateConditions = [];
  if (from) dateConditions.push(gte(events.createdAt, new Date(from)));
  if (to) dateConditions.push(lte(events.createdAt, new Date(to)));
  const dateWhere = dateConditions.length > 0 ? and(...dateConditions) : undefined;

  const [eventCounts, uniqueUsers, scanAverages, limitHits, featureUsage] = await Promise.all([
    // Event counts by name and category
    db.select({
      eventName: events.eventName,
      category: events.category,
      count: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${events.userId})`,
    })
    .from(events)
    .where(dateWhere)
    .groupBy(events.eventName, events.category),

    // Total unique users
    db.select({ count: sql<number>`count(distinct ${events.userId})` })
    .from(events)
    .where(dateWhere),

    // Scan metadata averages
    db.select({
      avgRiskScore: sql<number>`round(avg((${events.metadata}->>'ai_risk_score')::numeric))`,
      avgFlagCount: sql<number>`round(avg((${events.metadata}->>'flag_count')::numeric))`,
      avgWordCount: sql<number>`round(avg((${events.metadata}->>'word_count')::numeric))`,
      scanCount: sql<number>`count(*)`,
    })
    .from(events)
    .where(and(
      sql`${events.eventName} = 'scan_completed'`,
      ...(dateConditions.length > 0 ? dateConditions : [sql`true`]),
    )),

    // Limit hits by type
    db.select({
      limitType: sql<string>`${events.metadata}->>'limit_type'`,
      count: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${events.userId})`,
    })
    .from(events)
    .where(and(
      sql`${events.eventName} = 'limit_hit'`,
      ...(dateConditions.length > 0 ? dateConditions : [sql`true`]),
    ))
    .groupBy(sql`${events.metadata}->>'limit_type'`),

    // Feature usage
    db.select({
      feature: sql<string>`${events.metadata}->>'feature'`,
      count: sql<number>`count(*)`,
    })
    .from(events)
    .where(and(
      sql`${events.eventName} = 'feature_used'`,
      ...(dateConditions.length > 0 ? dateConditions : [sql`true`]),
    ))
    .groupBy(sql`${events.metadata}->>'feature'`),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      eventCounts,
      totalUniqueUsers: Number(uniqueUsers[0]?.count ?? 0),
      scanAverages: scanAverages[0] ?? null,
      limitHits,
      featureUsage,
    },
  });
}
