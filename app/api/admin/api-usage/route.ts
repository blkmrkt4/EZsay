import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminSettings, events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

async function getSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function fetchOpenRouterCredits(apiKey: string) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const total = data.data?.total_credits ?? 0;
    const used = data.data?.total_usage ?? 0;
    return { total: Number(total), used: Number(used), remaining: Number(total) - Number(used) };
  } catch {
    return null;
  }
}

async function countTavilySearches() {
  try {
    const [row] = await db
      .select({
        count: sql<number>`count(*)`,
        credits: sql<number>`coalesce(sum((${events.metadata}->>'credits')::numeric), 0)`,
      })
      .from(events)
      .where(eq(events.eventName, "tavily_search"));
    return {
      searches: Number(row?.count ?? 0),
      credits: Number(row?.credits ?? 0),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const openrouterKey = await getSettingValue("openrouter_api_key");

  const [openrouter, tavily] = await Promise.all([
    openrouterKey ? fetchOpenRouterCredits(openrouterKey) : null,
    countTavilySearches(),
  ]);

  return NextResponse.json({
    success: true,
    data: { openrouter, tavily },
  });
}
