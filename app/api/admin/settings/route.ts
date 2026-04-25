import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

/** Keys whose values should be masked in API responses. */
const SENSITIVE_KEYS = new Set(["openrouter_api_key"]);

function maskValue(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key) || !value || value.length < 8) return value;
  return "••••••••" + value.slice(-4);
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const settings = await db.select().from(adminSettings);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = maskValue(s.key, s.value);
  return NextResponse.json({ success: true, data: map });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { key, value } = await request.json();

  await db
    .insert(adminSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: adminSettings.key, set: { value, updatedAt: new Date() } });

  return NextResponse.json({ success: true });
}
