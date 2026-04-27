import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { stripe } from "@/lib/stripe";
import { STRIPE_PRICES, type PlanId, type BillingInterval } from "@/lib/stripe/prices";
import { ensureProfile } from "@/lib/stripe/ensure-profile";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { plan, billing } = (await request.json()) as {
    plan: string;
    billing: string;
  };

  // Validate plan and billing
  if (!["individual", "eaas"].includes(plan)) {
    return NextResponse.json(
      { success: false, error: "Invalid plan" },
      { status: 400 }
    );
  }
  if (!["monthly", "yearly"].includes(billing)) {
    return NextResponse.json(
      { success: false, error: "Invalid billing interval" },
      { status: 400 }
    );
  }

  // The "free" tier has no Stripe price — checkout only applies to paid plans.
  if (plan === "free" || !(plan in STRIPE_PRICES)) {
    return NextResponse.json(
      { success: false, error: "Plan is not purchasable" },
      { status: 400 }
    );
  }
  const paidPlan = plan as Exclude<PlanId, "free">;
  const priceId = STRIPE_PRICES[paidPlan]?.[billing as BillingInterval];
  if (!priceId) {
    return NextResponse.json(
      { success: false, error: "Price not configured" },
      { status: 500 }
    );
  }

  try {
    const profile = await ensureProfile(user.id, user.email ?? "");

    // Get or create Stripe Customer
    let stripeCustomerId = profile.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabaseUserId: user.id },
      });
      stripeCustomerId = customer.id;

      await db
        .update(profiles)
        .set({ stripeCustomerId, updatedAt: new Date() })
        .where(eq(profiles.id, user.id));
    }

    // Create Checkout Session
    const origin = request.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/w?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      // Top-level metadata is what the webhook handler reads from
      // session.metadata.supabaseUserId on checkout.session.completed.
      // Also mirrored onto the subscription so it's accessible from
      // customer.subscription.* events later.
      metadata: { supabaseUserId: user.id, plan },
      subscription_data: {
        metadata: { supabaseUserId: user.id, plan },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: "Stripe did not return a checkout URL. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
