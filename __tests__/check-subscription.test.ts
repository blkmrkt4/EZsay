import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dev-auth before importing module under test
vi.mock("@/lib/supabase/dev-auth", () => ({
  isDevBypass: vi.fn(() => false),
  getDevUser: vi.fn(() => ({ id: "dev-id", email: "dev@ezsay.local" })),
}));

// Mock ensure-profile
vi.mock("@/lib/stripe/ensure-profile", () => ({
  ensureProfile: vi.fn(),
}));

import { getSubscription, hasActiveSubscription } from "@/lib/stripe/check-subscription";
import { isDevBypass } from "@/lib/supabase/dev-auth";
import { ensureProfile } from "@/lib/stripe/ensure-profile";

describe("hasActiveSubscription", () => {
  it("returns true for active", () => {
    expect(hasActiveSubscription("active")).toBe(true);
  });

  it("returns true for past_due (Stripe is retrying)", () => {
    expect(hasActiveSubscription("past_due")).toBe(true);
  });

  it("returns false for canceled", () => {
    expect(hasActiveSubscription("canceled")).toBe(false);
  });

  it("returns false for none", () => {
    expect(hasActiveSubscription("none")).toBe(false);
  });

  it("returns false for unpaid", () => {
    expect(hasActiveSubscription("unpaid")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasActiveSubscription("")).toBe(false);
  });
});

describe("getSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active subscription in dev bypass mode", async () => {
    vi.mocked(isDevBypass).mockReturnValue(true);

    const result = await getSubscription("any-user-id");

    expect(result.status).toBe("active");
    expect(result.planId).toBe("dev");
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it("reads subscription from profile in production", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    vi.mocked(ensureProfile).mockResolvedValue({
      id: "user-1",
      email: "user@test.com",
      role: "user",
      subscriptionStatus: "active",
      subscriptionPlanId: "price_123",
      subscriptionPeriodEnd: new Date("2026-05-01"),
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await getSubscription("user-1");

    expect(result.status).toBe("active");
    expect(result.planId).toBe("price_123");
    expect(result.periodEnd).toEqual(new Date("2026-05-01"));
  });

  it("returns none status when profile has no subscription", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    vi.mocked(ensureProfile).mockResolvedValue({
      id: "user-2",
      email: "user@test.com",
      role: "user",
      subscriptionStatus: null,
      subscriptionPlanId: null,
      subscriptionPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await getSubscription("user-2");

    expect(result.status).toBe("none");
    expect(result.planId).toBeNull();
  });
});
