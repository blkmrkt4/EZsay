import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { db } from "@/db";
import {
  documents,
  styleProfiles,
  usageTracking,
  profiles,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/supabase/auth-guard";

/**
 * Dev-only reset / nuke endpoint.
 *
 * - `?mode=reset`  → wipes the current user's documents, usage, and style state.
 *                    The user account itself stays intact and they remain signed in.
 * - `?mode=nuke`   → does the reset AND deletes the auth user, then the caller
 *                    must client-side sign out + clear localStorage. Forces a
 *                    truly "brand new visitor" state for re-testing the funnel.
 *
 * Returns 403 outside development. Never deploy this without that gate.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "Dev tools are disabled in production." },
      { status: 403 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not signed in." },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "nuke" ? "nuke" : "reset";

  // Wipe user-scoped data. Documents cascade to sections/flags/flagOptions/
  // citations/plagiarism_results/document_versions via FK ON DELETE CASCADE.
  await db.delete(documents).where(eq(documents.userId, user.id));
  await db.delete(usageTracking).where(eq(usageTracking.userId, user.id));
  await db.delete(styleProfiles).where(eq(styleProfiles.userId, user.id));

  // Reset subscription state on the profile so the workspace paywall behaves
  // as it would for a fresh user (no active sub). Only the columns that
  // actually exist on the profiles table are touched here.
  await db
    .update(profiles)
    .set({
      subscriptionStatus: "none",
      subscriptionPlanId: null,
      subscriptionPeriodEnd: null,
    })
    .where(eq(profiles.id, user.id));

  if (mode === "nuke") {
    // Delete the auth user using the service role key. This cascades to
    // the profiles row (which has FK → auth.users(id)) and orphans no rows
    // because we already wiped the user-scoped tables above.
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceUrl || !serviceKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY missing — can't delete the auth user. Reset succeeded for data but the account still exists.",
        },
        { status: 500 }
      );
    }
    const admin = createSupabaseAdminClient(serviceUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return NextResponse.json(
        { success: false, error: `Auth delete failed: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: { mode, userId: user.id },
  });
}
