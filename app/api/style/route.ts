import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { styleProfiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logStyleSignal } from "@/lib/style/logger";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentType = searchParams.get("documentType");

  if (documentType) {
    const [profile] = await db
      .select()
      .from(styleProfiles)
      .where(
        and(
          eq(styleProfiles.userId, user.id),
          eq(styleProfiles.documentType, documentType as "academic" | "professional" | "casual" | "legal")
        )
      )
      .limit(1);

    return NextResponse.json({ success: true, data: profile || null });
  }

  // Return all profiles for this user
  const profiles = await db
    .select()
    .from(styleProfiles)
    .where(eq(styleProfiles.userId, user.id));

  return NextResponse.json({ success: true, data: profiles });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { documentType, patternType, originalPhrase, replacement, signalWeight } = body;

  // Fire-and-forget style logging
  logStyleSignal(user.id, documentType, {
    patternType,
    originalPhrase,
    replacement,
    signalWeight,
    documentType,
  }).catch((err) => {
    console.error("Style logging failed:", err);
  });

  return NextResponse.json({ success: true });
}
