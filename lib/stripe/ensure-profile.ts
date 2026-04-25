import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Ensures a profile row exists for the given user.
 * Returns the profile (existing or newly created).
 *
 * This is a defense-in-depth fallback — the primary mechanism is a
 * Supabase SQL trigger on auth.users INSERT. If the trigger hasn't
 * fired (e.g. not deployed yet), this self-heals.
 */
export async function ensureProfile(userId: string, email: string) {
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(profiles)
    .values({
      id: userId,
      email: email || null,
      role: "user",
      subscriptionStatus: "none",
    })
    .onConflictDoNothing()
    .returning();

  // If onConflictDoNothing returned nothing (race condition), re-fetch
  if (!created) {
    const [refetched] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return refetched;
  }

  return created;
}
