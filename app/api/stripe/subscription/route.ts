import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { getSubscription } from "@/lib/stripe/check-subscription";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sub = await getSubscription(user.id);

  return NextResponse.json({
    success: true,
    data: {
      status: sub.status,
      planId: sub.planId,
      periodEnd: sub.periodEnd?.toISOString() ?? null,
    },
  });
}
