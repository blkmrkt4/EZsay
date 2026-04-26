import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
// Note: We use `as unknown as {...}` type assertions for subscription objects
// because Stripe SDK v22 wraps responses in Response<T> which doesn't expose
// properties directly. The runtime objects have the expected fields.

/**
 * Stripe webhook handler.
 * Verifies signature, handles subscription lifecycle events,
 * syncs subscription status to the profiles table.
 *
 * Never trust client-side subscription state for access control.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { success: false, error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabaseUserId;
        if (!userId) {
          console.error("checkout.session.completed: missing supabaseUserId in metadata");
          break;
        }

        // Retrieve the subscription to get plan details
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as {
          id: string;
          items: { data: { price: { id: string }; current_period_end?: number }[] };
          current_period_end?: number;
          status: string;
        };
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        // In recent Stripe API versions current_period_end moved from the
        // subscription root onto each item. Read both, prefer the item-level.
        const periodEndUnix = subscription.items.data[0]?.current_period_end ?? subscription.current_period_end;

        await db
          .update(profiles)
          .set({
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: "active",
            subscriptionPlanId: priceId,
            subscriptionPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, userId));

        console.log(`[Stripe] Subscription activated for user ${userId}`);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as {
          id: string;
          customer: string;
          items: { data: { price: { id: string }; current_period_end?: number }[] };
          current_period_end?: number;
          status: string;
        };
        const customerId = sub.customer;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const periodEndUnix = sub.items.data[0]?.current_period_end ?? sub.current_period_end;

        // Map Stripe status to our status
        let status: string;
        if (sub.status === "active") {
          status = "active";
        } else if (sub.status === "past_due") {
          status = "past_due";
        } else if (sub.status === "canceled" || sub.status === "unpaid") {
          status = "canceled";
        } else {
          status = sub.status;
        }

        await db
          .update(profiles)
          .set({
            stripeSubscriptionId: sub.id,
            subscriptionStatus: status,
            subscriptionPlanId: priceId,
            subscriptionPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
            updatedAt: new Date(),
          })
          .where(eq(profiles.stripeCustomerId, customerId));

        console.log(`[Stripe] Subscription ${event.type} for customer ${customerId}: ${status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const deletedSub = event.data.object as unknown as {
          customer: string;
          items?: { data: { current_period_end?: number }[] };
          current_period_end?: number;
        };
        const deletedCustomerId = deletedSub.customer;
        const periodEndUnix = deletedSub.items?.data?.[0]?.current_period_end ?? deletedSub.current_period_end;

        await db
          .update(profiles)
          .set({
            subscriptionStatus: "canceled",
            subscriptionPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
            updatedAt: new Date(),
          })
          .where(eq(profiles.stripeCustomerId, deletedCustomerId));

        console.log(`[Stripe] Subscription deleted for customer ${deletedCustomerId}`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Recovery from past_due
        await db
          .update(profiles)
          .set({
            subscriptionStatus: "active",
            updatedAt: new Date(),
          })
          .where(eq(profiles.stripeCustomerId, customerId));

        console.log(`[Stripe] Payment succeeded for customer ${customerId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await db
          .update(profiles)
          .set({
            subscriptionStatus: "past_due",
            updatedAt: new Date(),
          })
          .where(eq(profiles.stripeCustomerId, customerId));

        console.log(`[Stripe] Payment failed for customer ${customerId}`);
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Log but don't fail — returning non-200 makes Stripe retry indefinitely
    console.error(`[Stripe] Error handling ${event.type}:`, err);
  }

  return NextResponse.json({ success: true, received: true });
}
