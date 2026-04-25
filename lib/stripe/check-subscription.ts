import { isDevBypass } from "@/lib/supabase/dev-auth";
import { ensureProfile } from "./ensure-profile";

export interface SubscriptionInfo {
  status: string;
  planId: string | null;
  periodEnd: Date | null;
}

/**
 * Returns the subscription status for a user.
 * In dev bypass mode, always returns active.
 */
export async function getSubscription(
  userId: string
): Promise<SubscriptionInfo> {
  if (isDevBypass()) {
    return { status: "active", planId: "dev", periodEnd: null };
  }

  const profile = await ensureProfile(userId, "");
  return {
    status: profile.subscriptionStatus ?? "none",
    planId: profile.subscriptionPlanId ?? null,
    periodEnd: profile.subscriptionPeriodEnd ?? null,
  };
}

/**
 * Returns true if the user has an active or past_due subscription.
 * past_due still grants access — Stripe is retrying payment.
 */
export function hasActiveSubscription(status: string): boolean {
  return status === "active" || status === "past_due";
}
