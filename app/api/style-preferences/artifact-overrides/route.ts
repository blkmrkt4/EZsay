import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { userArtifactOverrides, styleTraining } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/style-preferences/artifact-overrides
 * Returns global artifact items merged with the user's per-item overrides.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const globalItems = await db.select().from(styleTraining);
  const overrides = await db
    .select()
    .from(userArtifactOverrides)
    .where(eq(userArtifactOverrides.userId, user.id));

  const overrideMap = new Map(overrides.map((o) => [o.styleTrainingId, o.preference]));

  const merged = globalItems.map((item) => ({
    id: item.id,
    category: item.category,
    item: item.item,
    example: item.example,
    notes: item.notes,
    preference: overrideMap.get(item.id) ?? item.preference,
    isOverridden: overrideMap.has(item.id),
    sortOrder: item.sortOrder,
  }));

  return NextResponse.json({ success: true, data: merged });
}

/**
 * POST /api/style-preferences/artifact-overrides
 * Upserts one per-user override for a style training item.
 * Body: { styleTrainingId: string, preference: "always_remove" | "always_keep" | "ask_each_time" }
 *
 * To reset to global default, pass preference matching the global value — the override row
 * will be deleted.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { styleTrainingId, preference } = await request.json();

  if (!styleTrainingId || !preference) {
    return NextResponse.json(
      { success: false, error: "styleTrainingId and preference are required" },
      { status: 400 },
    );
  }

  // Check if the preference matches the global default — if so, delete the override
  const [globalItem] = await db
    .select()
    .from(styleTraining)
    .where(eq(styleTraining.id, styleTrainingId))
    .limit(1);

  if (!globalItem) {
    return NextResponse.json({ success: false, error: "Style training item not found" }, { status: 404 });
  }

  if (preference === globalItem.preference) {
    // Reset to default — remove override if it exists
    await db
      .delete(userArtifactOverrides)
      .where(
        and(
          eq(userArtifactOverrides.userId, user.id),
          eq(userArtifactOverrides.styleTrainingId, styleTrainingId),
        ),
      );
    return NextResponse.json({ success: true, data: { preference, isOverridden: false } });
  }

  // Upsert override
  const [existing] = await db
    .select()
    .from(userArtifactOverrides)
    .where(
      and(
        eq(userArtifactOverrides.userId, user.id),
        eq(userArtifactOverrides.styleTrainingId, styleTrainingId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userArtifactOverrides)
      .set({ preference })
      .where(eq(userArtifactOverrides.id, existing.id));
  } else {
    await db.insert(userArtifactOverrides).values({
      userId: user.id,
      styleTrainingId,
      preference,
    });
  }

  return NextResponse.json({ success: true, data: { preference, isOverridden: true } });
}
