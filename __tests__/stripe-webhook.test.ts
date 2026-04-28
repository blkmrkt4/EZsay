import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ── Mocks ────────────────────────────────────────────────────────────

const mockDbUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("@/db", () => ({
  db: {
    update: (...args: any[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  profiles: Symbol("profiles"),
}));

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: any[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: any[]) => mockSubscriptionsRetrieve(...args),
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ _field: a, _value: b })),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { profiles } from "@/db/schema";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(body: string, signature: string | null = "sig_test") {
  return {
    text: () => Promise.resolve(body),
    headers: {
      get: (key: string) => (key === "stripe-signature" ? signature : null),
    },
  } as any;
}

function makeEvent(type: string, data: any): Stripe.Event {
  return { type, data: { object: data } } as any;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Stripe webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chained mock for each test
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  describe("signature verification", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const res = await POST(makeRequest("body", null));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/stripe-signature/i);
      expect(mockConstructEvent).not.toHaveBeenCalled();
    });

    it("returns 400 when signature is invalid", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const res = await POST(makeRequest("body", "bad_sig"));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/invalid signature/i);
    });
  });

  describe("checkout.session.completed", () => {
    it("activates subscription and stores customer + plan info", async () => {
      const session = {
        metadata: { supabaseUserId: "user-abc" },
        subscription: "sub_123",
        customer: "cus_456",
      };
      mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", session));
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: "sub_123",
        items: { data: [{ price: { id: "price_ind_m" }, current_period_end: 1735689600 }] },
        status: "active",
      });

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      const res = await POST(makeRequest("body"));
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeCustomerId: "cus_456",
          stripeSubscriptionId: "sub_123",
          subscriptionStatus: "active",
          subscriptionPlanId: "price_ind_m",
        })
      );
    });

    it("handles missing supabaseUserId in metadata gracefully", async () => {
      const session = { metadata: {}, subscription: "sub_123", customer: "cus_456" };
      mockConstructEvent.mockReturnValue(makeEvent("checkout.session.completed", session));

      const res = await POST(makeRequest("body"));
      const json = await res.json();

      // Should not crash — just logs and returns 200
      expect(json.success).toBe(true);
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated", () => {
    it("maps active status correctly", async () => {
      const sub = {
        id: "sub_1",
        customer: "cus_1",
        items: { data: [{ price: { id: "price_ind_m" }, current_period_end: 1735689600 }] },
        status: "active",
      };
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.updated", sub));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "active" })
      );
    });

    it("maps past_due status correctly", async () => {
      const sub = {
        id: "sub_1",
        customer: "cus_1",
        items: { data: [{ price: { id: "price_ind_m" } }] },
        status: "past_due",
      };
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.updated", sub));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "past_due" })
      );
    });

    it("maps canceled status correctly", async () => {
      const sub = {
        id: "sub_1",
        customer: "cus_1",
        items: { data: [{ price: { id: "price_ind_m" } }] },
        status: "canceled",
      };
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.updated", sub));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "canceled" })
      );
    });

    it("maps unpaid to canceled", async () => {
      const sub = {
        id: "sub_1",
        customer: "cus_1",
        items: { data: [{ price: { id: "price_ind_m" } }] },
        status: "unpaid",
      };
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.updated", sub));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "canceled" })
      );
    });
  });

  describe("customer.subscription.deleted", () => {
    it("sets status to canceled", async () => {
      const sub = {
        customer: "cus_1",
        items: { data: [{ current_period_end: 1735689600 }] },
      };
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.deleted", sub));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "canceled" })
      );
    });
  });

  describe("invoice.payment_succeeded", () => {
    it("recovers from past_due to active", async () => {
      const invoice = { customer: "cus_1" };
      mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_succeeded", invoice));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "active" })
      );
    });
  });

  describe("invoice.payment_failed", () => {
    it("sets status to past_due", async () => {
      const invoice = { customer: "cus_1" };
      mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_failed", invoice));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: "past_due" })
      );
    });
  });

  describe("customer.deleted", () => {
    it("clears all subscription data", async () => {
      const customer = { id: "cus_1" };
      mockConstructEvent.mockReturnValue(makeEvent("customer.deleted", customer));

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await POST(makeRequest("body"));

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionStatus: "canceled",
          stripeSubscriptionId: null,
          subscriptionPlanId: null,
          subscriptionPeriodEnd: null,
        })
      );
    });
  });

  describe("error handling", () => {
    it("returns 200 even when handler throws (prevents Stripe retry loop)", async () => {
      mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_succeeded", { customer: "cus_1" }));
      mockDbUpdate.mockImplementation(() => {
        throw new Error("DB connection failed");
      });

      const res = await POST(makeRequest("body"));
      const json = await res.json();

      // Must return 200 — non-200 causes Stripe to retry indefinitely
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe("unhandled events", () => {
    it("returns 200 for unknown event types", async () => {
      mockConstructEvent.mockReturnValue(makeEvent("some.future.event", {}));

      const res = await POST(makeRequest("body"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });
});
