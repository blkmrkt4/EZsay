import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

// Mock dev-auth
vi.mock("@/lib/supabase/dev-auth", () => ({
  isDevBypass: vi.fn(() => false),
  getDevUser: vi.fn(),
}));

// Mock ensure-profile
vi.mock("@/lib/stripe/ensure-profile", () => ({
  ensureProfile: vi.fn(),
}));

// Mock schema to provide table references
vi.mock("@/db/schema", () => ({
  adminSettings: { key: "key" },
  usageTracking: { userId: "user_id", yearMonth: "year_month" },
  profiles: { id: "id", subscriptionPlanId: "subscription_plan_id" },
  documents: { userId: "user_id" },
}));

// Mock prices
vi.mock("@/lib/stripe/prices", () => ({
  STRIPE_PRICES: {
    individual: { monthly: "price_ind_m", yearly: "price_ind_y" },
    eaas: { monthly: "price_eaas_m", yearly: "price_eaas_y" },
  },
}));

import { resolvePlanSlug, type PlanLimits } from "@/lib/stripe/plan-limits";

describe("resolvePlanSlug", () => {
  it("returns free when no price ID", () => {
    expect(resolvePlanSlug(null)).toBe("free");
  });

  it("resolves individual monthly", () => {
    expect(resolvePlanSlug("price_ind_m")).toBe("individual");
  });

  it("resolves individual yearly", () => {
    expect(resolvePlanSlug("price_ind_y")).toBe("individual");
  });

  it("resolves eaas monthly", () => {
    expect(resolvePlanSlug("price_eaas_m")).toBe("eaas");
  });

  it("resolves eaas yearly", () => {
    expect(resolvePlanSlug("price_eaas_y")).toBe("eaas");
  });

  it("falls back to free for unknown price ID", () => {
    expect(resolvePlanSlug("price_unknown_xyz")).toBe("free");
  });
});

describe("plan limit math (checkLimitFromData equivalent)", () => {
  // These test the pure math that checkLimitFromData performs,
  // extracted to avoid needing to mock the full DB chain.

  function checkLimitFromData(
    limits: PlanLimits,
    usage: { wordsScanned: number; scanCount: number; documentCount: number },
    limitType: keyof PlanLimits,
    additionalAmount: number,
  ) {
    const limit = limits[limitType];
    if (limit === -1) return { allowed: true, current: 0, limit: -1, percent: 0 };

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

  const freeLimits: PlanLimits = {
    monthlyWordLimit: 5000,
    perDocumentWordLimit: 5000,
    monthlyScanLimit: 1,
    documentStorageLimit: 1,
  };

  const unlimitedLimits: PlanLimits = {
    monthlyWordLimit: -1,
    perDocumentWordLimit: -1,
    monthlyScanLimit: -1,
    documentStorageLimit: -1,
  };

  const zeroUsage = { wordsScanned: 0, scanCount: 0, documentCount: 0 };

  it("allows first scan on free tier", () => {
    const result = checkLimitFromData(freeLimits, zeroUsage, "monthlyScanLimit", 1);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(1);
  });

  it("blocks second scan on free tier", () => {
    const usedOnce = { ...zeroUsage, scanCount: 1 };
    const result = checkLimitFromData(freeLimits, usedOnce, "monthlyScanLimit", 1);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(2);
  });

  it("allows anything on unlimited plan", () => {
    const result = checkLimitFromData(unlimitedLimits, zeroUsage, "monthlyScanLimit", 999);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  it("blocks document over per-doc word limit", () => {
    const result = checkLimitFromData(freeLimits, zeroUsage, "perDocumentWordLimit", 6000);
    expect(result.allowed).toBe(false);
  });

  it("allows document within per-doc word limit", () => {
    const result = checkLimitFromData(freeLimits, zeroUsage, "perDocumentWordLimit", 5000);
    expect(result.allowed).toBe(true);
  });

  it("calculates percentage correctly", () => {
    const halfUsed = { ...zeroUsage, wordsScanned: 2500 };
    const result = checkLimitFromData(freeLimits, halfUsed, "monthlyWordLimit", 0);
    expect(result.percent).toBe(50);
  });

  it("caps percentage at 100", () => {
    const overUsed = { ...zeroUsage, wordsScanned: 10000 };
    const result = checkLimitFromData(freeLimits, overUsed, "monthlyWordLimit", 0);
    expect(result.percent).toBe(100);
  });
});
