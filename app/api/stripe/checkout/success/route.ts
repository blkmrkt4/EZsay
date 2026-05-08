import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Stripe Checkout success landing.
 *
 * Webhooks can be delayed or, in local dev without `stripe listen`, never
 * arrive at all. This route reconciles the profile straight from Stripe
 * using the session_id Stripe appends to the success URL, so paying users
 * are granted access immediately. The webhook stays as the source of truth
 * for renewals, cancellations, and past_due transitions.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?redirect=/w`);
  }

  if (!sessionId) {
    return NextResponse.redirect(`${origin}/pricing?reason=missing_session`);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Reject if this session doesn't belong to the signed-in user. Prevents
    // someone from completing checkout, then loading /api/.../success with
    // a different account to grant *that* account a subscription.
    if (session.metadata?.supabaseUserId !== user.id) {
      return NextResponse.redirect(`${origin}/pricing?reason=session_mismatch`);
    }

    const subscription = session.subscription as unknown as {
      id: string;
      status: string;
      items: { data: { price: { id: string }; current_period_end?: number }[] };
      current_period_end?: number;
    } | null;

    if (!subscription) {
      return NextResponse.redirect(`${origin}/pricing?reason=no_subscription`);
    }

    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const periodEndUnix =
      subscription.items.data[0]?.current_period_end ??
      subscription.current_period_end;

    await db
      .update(profiles)
      .set({
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status === "active" ? "active" : subscription.status,
        subscriptionPlanId: priceId,
        subscriptionPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));

    return NextResponse.redirect(`${origin}/w?welcome=1`);
  } catch (err) {
    console.error("[Stripe] Checkout success reconciliation failed:", err);
    return NextResponse.redirect(`${origin}/pricing?reason=sync_failed`);
  }
}
