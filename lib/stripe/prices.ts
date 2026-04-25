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

export type PlanId = "individual" | "eaas";
export type BillingInterval = "monthly" | "yearly";
