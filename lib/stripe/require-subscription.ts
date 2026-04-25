import { NextResponse } from "next/server";
import { getSubscription, hasActiveSubscription } from "./check-subscription";

/**
 * Checks subscription status and returns a 402 response if not active.
 * Returns null if the user has an active subscription.
 *
 * Usage in API routes:
 *   const gateResponse = await requireSubscription(user.id);
 *   if (gateResponse) return gateResponse;
 */
export async function requireSubscription(
  userId: string
): Promise<NextResponse | null> {
  const sub = await getSubscription(userId);
  if (hasActiveSubscription(sub.status)) return null;

  return NextResponse.json(
    { success: false, error: "Subscription required" },
    { status: 402 }
  );
}
