import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * GET /api/style-preferences?documentType=academic
 * Returns merged preferences: universal defaults + type-specific overrides.
 * If no row exists yet, returns defaults from the definitions.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const documentType = request.nextUrl.searchParams.get("documentType") || null;

  // Load universal preferences (documentType = null)
  const [universal] = await db
    .select()
    .from(userStylePreferences)
    .where(and(eq(userStylePreferences.userId, user.id), isNull(userStylePreferences.documentType)))
    .limit(1);

  // Load type-specific preferences if requested
  let typeSpecific = null;
  if (documentType) {
    const [row] = await db
      .select()
      .from(userStylePreferences)
      .where(
        and(
          eq(userStylePreferences.userId, user.id),
          eq(userStylePreferences.documentType, documentType as "academic" | "professional" | "casual" | "legal"),
        ),
      )
      .limit(1);
    typeSpecific = row ?? null;
  }

  // Merge: universal base, then type-specific overrides
  const merged = {
    ...((universal?.preferences as Record<string, unknown>) ?? {}),
    ...((typeSpecific?.preferences as Record<string, unknown>) ?? {}),
  };

  // Style-guide status across ALL of the user's rows (any document type) —
  // drives the "have you filled out your style guide?" nudges in the
  // intake flow and the scan dialog.
  const allRows = await db
    .select()
    .from(userStylePreferences)
    .where(eq(userStylePreferences.userId, user.id));
  const styleGuideParsedAt = allRows
    .map((r) => r.styleGuideParsedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const hasAnyPreferences = allRows.some(
    (r) => Object.keys((r.preferences as Record<string, unknown>) ?? {}).length > 0,
  );

  return NextResponse.json({
    success: true,
    data: {
      preferences: merged,
      wizardCompletedAt: typeSpecific?.wizardCompletedAt ?? universal?.wizardCompletedAt ?? null,
      styleGuideParsedAt,
      hasAnyPreferences,
    },
  });
}

/**
 * PATCH /api/style-preferences
 * Partial update of preferences. Upserts the row for the given document type.
 * Body: { documentType?: string, preferences: Record<string, any>, wizardCompletedAt?: string }
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const documentType = body.documentType || null;
  const newPrefs = body.preferences ?? {};
  const wizardCompletedAt = body.wizardCompletedAt ? new Date(body.wizardCompletedAt) : undefined;

  const docTypeValue = documentType as "academic" | "professional" | "casual" | "legal" | null;

  // Find existing row
  const whereClause = docTypeValue
    ? and(eq(userStylePreferences.userId, user.id), eq(userStylePreferences.documentType, docTypeValue))
    : and(eq(userStylePreferences.userId, user.id), isNull(userStylePreferences.documentType));

  const [existing] = await db
    .select()
    .from(userStylePreferences)
    .where(whereClause)
    .limit(1);

  if (existing) {
    // Merge new preferences into existing
    const merged = { ...((existing.preferences as Record<string, unknown>) ?? {}), ...newPrefs };
    const updateData: Record<string, unknown> = {
      preferences: merged,
      updatedAt: new Date(),
    };
    if (wizardCompletedAt) updateData.wizardCompletedAt = wizardCompletedAt;

    await db
      .update(userStylePreferences)
      .set(updateData)
      .where(eq(userStylePreferences.id, existing.id));

    return NextResponse.json({ success: true, data: { preferences: merged } });
  }

  // Insert new row
  const insertData: Record<string, unknown> = {
    userId: user.id,
    documentType: docTypeValue,
    preferences: newPrefs,
  };
  if (wizardCompletedAt) insertData.wizardCompletedAt = wizardCompletedAt;

  const [inserted] = await db
    .insert(userStylePreferences)
    .values(insertData as typeof userStylePreferences.$inferInsert)
    .returning();

  return NextResponse.json({ success: true, data: { preferences: inserted.preferences } });
}
