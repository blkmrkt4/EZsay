import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const settings = await db.select().from(adminSettings);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return NextResponse.json({ success: true, data: map });
}

export async function POST(request: NextRequest) {
  const { key, value } = await request.json();

  await db
    .insert(adminSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: adminSettings.key, set: { value, updatedAt: new Date() } });

  return NextResponse.json({ success: true });
}
