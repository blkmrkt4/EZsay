import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import {
  getUserPlanSlug,
  getPlanLimits,
  getCurrentUsage,
  type PlanLimits,
} from "@/lib/stripe/plan-limits";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const planSlug = await getUserPlanSlug(user.id);
  const limits = await getPlanLimits(planSlug);
  const usage = await getCurrentUsage(user.id);

  // Compute warnings — limits at 80%+ that aren't unlimited
  const warnings: string[] = [];
  const checks: { key: keyof PlanLimits; current: number }[] = [
    { key: "monthlyWordLimit", current: usage.wordsScanned },
    { key: "monthlyScanLimit", current: usage.scanCount },
    { key: "documentStorageLimit", current: usage.documentCount },
  ];

  for (const { key, current } of checks) {
    const limit = limits[key];
    if (limit === -1) continue; // unlimited
    const percent = Math.round((current / limit) * 100);
    if (percent >= 80) {
      warnings.push(key);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      planSlug,
      limits,
      usage,
      warnings,
    },
  });
}
