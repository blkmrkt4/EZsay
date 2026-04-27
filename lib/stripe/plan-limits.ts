import { db } from "@/db";
import { adminSettings, usageTracking, profiles, documents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { STRIPE_PRICES, type PlanId } from "./prices";
import { isDevBypass } from "@/lib/supabase/dev-auth";

export interface PlanLimits {
  monthlyWordLimit: number; // -1 = unlimited
  perDocumentWordLimit: number;
  monthlyScanLimit: number;
  documentStorageLimit: number;
}

export interface Usage {
  wordsScanned: number;
  scanCount: number;
  documentCount: number;
}

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  percent: number; // 0-100, capped at 100
}

const DEFAULT_LIMITS: Record<string, PlanLimits> = {
  // Free tier — one scan per visitor. Caps gate-keep the funnel: anyone
  // who wants more must subscribe. Word cap is generous enough to cover
  // an essay-length sample but not a whole thesis.
  free: {
    monthlyWordLimit: 5000,
    perDocumentWordLimit: 5000,
    monthlyScanLimit: 1,
    documentStorageLimit: 1,
  },
  individual: {
    monthlyWordLimit: 50000,
    perDocumentWordLimit: 10000,
    monthlyScanLimit: 30,
    documentStorageLimit: 20,
  },
  eaas: {
    monthlyWordLimit: -1,
    perDocumentWordLimit: -1,
    monthlyScanLimit: -1,
    documentStorageLimit: -1,
  },
};

/**
 * Reads plan limits from admin_settings. Seeds defaults on first access.
 */
export async function getPlanLimits(planSlug: string): Promise<PlanLimits> {
  const [row] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, "plan_limits"))
    .limit(1);

  let allLimits: Record<string, PlanLimits>;

  if (row) {
    try {
      allLimits = JSON.parse(row.value);
    } catch {
      allLimits = DEFAULT_LIMITS;
    }
  } else {
    // Seed defaults on first access
    await db
      .insert(adminSettings)
      .values({
        key: "plan_limits",
        value: JSON.stringify(DEFAULT_LIMITS),
      })
      .onConflictDoNothing();
    allLimits = DEFAULT_LIMITS;
  }

  // Fall back to free limits when an unknown plan slug is requested or
  // when the DB row was seeded before this slug existed (back-compat).
  return allLimits[planSlug] ?? DEFAULT_LIMITS[planSlug] ?? DEFAULT_LIMITS.free;
}

/**
 * Maps a Stripe Price ID back to a plan slug. Users with no subscription
 * resolve to "free" — they can scan once and then hit the paywall.
 */
export function resolvePlanSlug(stripePriceId: string | null): PlanId {
  if (!stripePriceId) return "free";

  for (const [slug, prices] of Object.entries(STRIPE_PRICES)) {
    if (prices.monthly === stripePriceId || prices.yearly === stripePriceId) {
      return slug as PlanId;
    }
  }

  return "free";
}

/**
 * Gets the plan slug for a user from their profile.
 */
export async function getUserPlanSlug(userId: string): Promise<PlanId> {
  if (isDevBypass()) return "eaas"; // Dev user gets unlimited

  const [profile] = await db
    .select({ subscriptionPlanId: profiles.subscriptionPlanId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return resolvePlanSlug(profile?.subscriptionPlanId ?? null);
}

/**
 * Gets the current month's usage for a user.
 */
export async function getCurrentUsage(userId: string): Promise<Usage> {
  const yearMonth = new Date().toISOString().slice(0, 7); // "2026-04"

  const [usage] = await db
    .select()
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        eq(usageTracking.yearMonth, yearMonth)
      )
    )
    .limit(1);

  // Count active documents
  const [docCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .where(eq(documents.userId, userId));

  return {
    wordsScanned: usage?.wordsScanned ?? 0,
    scanCount: usage?.scanCount ?? 0,
    documentCount: Number(docCount?.count ?? 0),
  };
}

/**
 * Checks whether a specific limit allows the operation.
 * Returns allowed=true and the current percentage.
 * For unlimited limits (-1), always returns allowed with 0%.
 */
export async function checkLimit(
  userId: string,
  limitType: keyof PlanLimits,
  additionalAmount: number = 0
): Promise<LimitCheck> {
  const planSlug = await getUserPlanSlug(userId);
  const limits = await getPlanLimits(planSlug);
  const usage = await getCurrentUsage(userId);

  return checkLimitFromData(limits, usage, limitType, additionalAmount);
}

function checkLimitFromData(
  limits: PlanLimits,
  usage: Usage,
  limitType: keyof PlanLimits,
  additionalAmount: number,
): LimitCheck {
  const limit = limits[limitType];

  if (limit === -1) {
    return { allowed: true, current: 0, limit: -1, percent: 0 };
  }

  let current: number;
  switch (limitType) {
    case "monthlyWordLimit":
      current = usage.wordsScanned + additionalAmount;
      break;
    case "monthlyScanLimit":
      current = usage.scanCount + additionalAmount;
      break;
    case "documentStorageLimit":
      current = usage.documentCount + additionalAmount;
      break;
    case "perDocumentWordLimit":
      current = additionalAmount;
      break;
    default:
      current = 0;
  }

  const percent = Math.min(100, Math.round((current / limit) * 100));

  return { allowed: current <= limit, current, limit, percent };
}

/**
 * Check multiple limits in one call, loading plan/usage data only once.
 * Returns a map of limitType → LimitCheck. Stops early and returns
 * the first failing check if any limit is exceeded.
 */
export async function checkAllLimits(
  userId: string,
  checks: { limitType: keyof PlanLimits; additionalAmount: number }[]
): Promise<{ allAllowed: boolean; results: Record<string, LimitCheck> }> {
  const planSlug = await getUserPlanSlug(userId);
  const limits = await getPlanLimits(planSlug);
  const usage = await getCurrentUsage(userId);

  const results: Record<string, LimitCheck> = {};
  let allAllowed = true;

  for (const { limitType, additionalAmount } of checks) {
    const result = checkLimitFromData(limits, usage, limitType, additionalAmount);
    results[limitType] = result;
    if (!result.allowed) allAllowed = false;
  }

  return { allAllowed, results };
}

/**
 * Records usage after a successful scan.
 * Uses raw SQL upsert on the composite unique index (user_id, year_month).
 */
export async function recordScanUsage(
  userId: string,
  wordCount: number
): Promise<void> {
  const yearMonth = new Date().toISOString().slice(0, 7);

  await db.execute(sql`
    INSERT INTO usage_tracking (id, user_id, year_month, words_scanned, scan_count, updated_at)
    VALUES (gen_random_uuid(), ${userId}, ${yearMonth}, ${wordCount}, 1, NOW())
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      words_scanned = usage_tracking.words_scanned + ${wordCount},
      scan_count = usage_tracking.scan_count + 1,
      updated_at = NOW()
  `);
}
