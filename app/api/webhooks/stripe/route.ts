import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe webhook handler skeleton.
 *
 * When fully wired:
 * 1. Verify webhook signature using STRIPE_WEBHOOK_SECRET
 * 2. Handle events: checkout.session.completed, customer.subscription.updated,
 *    customer.subscription.deleted, invoice.payment_failed
 * 3. Sync subscription status to user record in Supabase
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

  // TODO: Verify signature with Stripe
  // const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);

  // TODO: Handle events
  // switch (event.type) {
  //   case "checkout.session.completed":
  //     // Set subscription active on user record
  //     break;
  //   case "customer.subscription.updated":
  //     // Sync plan changes
  //     break;
  //   case "customer.subscription.deleted":
  //     // Revoke access
  //     break;
  //   case "invoice.payment_failed":
  //     // Mark subscription as past_due
  //     break;
  // }

  return NextResponse.json({ success: true, received: true });
}
