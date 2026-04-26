export const STRIPE_PRICES = {
  individual: {
    monthly: process.env.STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID!,
    yearly: process.env.STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID!,
  },
  eaas: {
    monthly: process.env.STRIPE_EAAS_MONTHLY_PRICE_ID!,
    yearly: process.env.STRIPE_EAAS_ANNUAL_PRICE_ID!,
  },
} as const;

/**
 * `free` is the implicit default tier for users without a paid subscription.
 * It has no Stripe price (never billed) but does have plan limits — see
 * DEFAULT_LIMITS in plan-limits.ts. Anonymous and email-verified users with
 * no subscription resolve to this tier.
 */
export type PlanId = "free" | "individual" | "eaas";
export type BillingInterval = "monthly" | "yearly";
