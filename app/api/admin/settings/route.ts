import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

/** Only these keys can be written via the API. */
const ALLOWED_KEYS = new Set([
  "openrouter_api_key",
  "tavily_api_key",
  "plan_limits",
]);

/** Keys whose values should be masked in API responses. */
const SENSITIVE_KEYS = new Set(["openrouter_api_key", "tavily_api_key"]);

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

  try {
    const { key, value } = await request.json();

    if (!key || typeof key !== "string" || typeof value !== "string") {
      return NextResponse.json({ success: false, error: "key and value must be non-empty strings" }, { status: 400 });
    }

    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ success: false, error: `Unknown setting key: ${key}` }, { status: 400 });
    }

    await db
      .insert(adminSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: adminSettings.key, set: { value, updatedAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin settings POST error:", err);
    return NextResponse.json({ success: false, error: "Update failed." }, { status: 500 });
  }
}
