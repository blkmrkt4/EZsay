import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { stripe } from "@/lib/stripe";
import { ensureProfile } from "@/lib/stripe/ensure-profile";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const profile = await ensureProfile(user.id, user.email ?? "");

  if (!profile.stripeCustomerId) {
    return NextResponse.json(
      { success: false, error: "No billing account found. Subscribe first." },
      { status: 400 }
    );
  }

  try {
    const origin = request.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${origin}/w`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to open billing portal" },
      { status: 500 }
    );
  }
}
