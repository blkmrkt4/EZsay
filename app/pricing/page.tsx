"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import { createClient } from "@/lib/supabase/client";

type Billing = "monthly" | "yearly";

const DISCOUNT = 0.17; // 17% off when billed yearly

const PLANS = [
  {
    id: "individual",
    name: "Individual",
    descriptor: "For writers polishing their own work",
    monthly: 12,
    featured: false,
    features: [
      "Up to 50,000 words scanned / month",
      "Up to 20,000 words per document",
      "All six Auditor Score spectrums",
      "AI detection + A/B rewrites",
      "Plagiarism + citation verification",
      "Grammar and tone consistency",
      "Style Training (learns your voice)",
    ],
    cta: "Start Individual",
  },
  {
    id: "eaas",
    name: "Professional Editor",
    descriptor: "For editors working with multiple writers",
    monthly: 60,
    featured: true,
    features: [
      "Everything in Individual, plus:",
      "Unlimited document scans",
      "Multiple client style profiles",
      "Early access to new features",
    ],
    cta: "Start Editing",
  },
] as const;

function formatMoney(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p className="text-gray-400">Loading...</p></div>}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const [billing, setBilling] = useState<Billing>("monthly");
  // Checkout state — `loadingPlan` is the plan id currently being purchased
  // (drives the per-button loading text); `checkoutError` shows inline if
  // the API call fails or the user can't be redirected.
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Show a friendly note when the user lands on /pricing from somewhere
  // that bounced them — cancelled checkout, gated workspace route, or a
  // failed post-payment sync. Each `reason` maps to a tailored message so
  // the user understands why they're here instead of where they expected.
  useEffect(() => {
    if (searchParams.get("checkout") === "cancelled") {
      setCheckoutError("Checkout cancelled — no charge was made.");
      return;
    }
    const reason = searchParams.get("reason");
    if (reason === "subscription_required") {
      setCheckoutError("You'll need an active subscription to enter the workspace. Pick a plan to continue.");
    } else if (reason === "sync_failed") {
      setCheckoutError("We couldn't confirm your payment automatically. If you completed checkout, refresh in a moment or contact support.");
    } else if (reason === "session_mismatch") {
      setCheckoutError("That checkout session belongs to a different account. Sign in with the account you used to pay.");
    } else if (reason === "missing_session" || reason === "no_subscription") {
      setCheckoutError("Something went wrong returning from Stripe. Please try checkout again.");
    }
  }, [searchParams]);

  async function handleCheckout(planId: string) {
    setCheckoutError(null);
    setLoadingPlan(planId);

    // Auth gate: anonymous (signInAnonymously) users have a session but
    // no email → Stripe needs a real account. Send them to sign in first.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      router.push(`/login?redirect=/pricing`);
      return;
    }

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, billing }),
      });
      const json = await res.json();
      if (!json.success || !json.url) {
        setCheckoutError(json.error || "Could not start checkout. Please try again.");
        setLoadingPlan(null);
        return;
      }
      // Redirect to Stripe-hosted Checkout. No SDK needed.
      window.location.href = json.url;
    } catch {
      setCheckoutError("Could not connect to checkout. Please try again.");
      setLoadingPlan(null);
    }
  }

  const heroSlot = (
    <div className="text-center">
      <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
        Pricing designed for writers who{" "}
        <br />
        edit{" "}
        <span className="relative top-0.5 inline-block rounded-full bg-yellow-300 px-3 py-0.5">their own</span>{" "}
        words.
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
        Pick the plan that fits how you work. Switch or cancel any time.
      </p>
      <div className="mt-[50px] inline-flex items-center gap-3">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billing === "monthly"
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("yearly")}
            aria-pressed={billing === "yearly"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billing === "yearly"
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Yearly
          </button>
        </div>
        <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-900">
          Save 17%
        </span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <LandingNav middleSlot={heroSlot} />

      {/* ═══ Dark zone — plan cards + FAQ + footer ═══════════════════════ */}
      <div className="bg-gray-950 text-white rounded-t-[3rem] sm:rounded-t-[4rem]">

        {/* Plan cards */}
        <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
          {checkoutError && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-200"
            >
              {checkoutError}
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            {PLANS.map((plan) => {
              const monthlyPrice = plan.monthly;
              const yearlyMonthly = monthlyPrice * (1 - DISCOUNT);
              const shown = billing === "monthly" ? monthlyPrice : yearlyMonthly;
              const yearlyTotal = Math.round(yearlyMonthly * 12);

              return (
                <div
                  key={plan.id}
                  className={`relative flex h-full flex-col rounded-2xl p-8 ${
                    plan.featured
                      ? "border-2 border-yellow-300 bg-white/[0.03]"
                      : "border border-white/15"
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 right-6 rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-900">
                      Pro
                    </span>
                  )}

                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  <p className="mt-1 text-sm text-gray-400">{plan.descriptor}</p>

                  <div className="mt-8 flex items-baseline gap-2">
                    <span className="text-5xl font-bold tracking-tight text-white">
                      {formatMoney(shown)}
                    </span>
                    <span className="text-base text-gray-400">/ month</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {billing === "monthly"
                      ? "Billed monthly. Cancel anytime."
                      : `Billed $${yearlyTotal} yearly. Save 17%.`}
                  </p>

                  <ul className="mt-8 space-y-3">
                    {plan.features.map((feature, i) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-2 text-sm ${
                          i === 0 && plan.featured
                            ? "font-semibold text-white"
                            : "text-gray-300"
                        }`}
                      >
                        <svg
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            plan.featured ? "text-yellow-300" : "text-gray-500"
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-10">
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={loadingPlan !== null}
                      className={`flex w-full items-center justify-center gap-1.5 rounded-full px-6 py-3 text-sm font-medium transition-opacity disabled:opacity-60 ${
                        plan.featured
                          ? "bg-yellow-300 text-gray-900 hover:bg-yellow-400"
                          : "bg-white text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      {loadingPlan === plan.id ? "Redirecting…" : plan.cta}
                      {loadingPlan !== plan.id && (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                          />
                        </svg>
                      )}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </section>

        {/* Divider */}
        <div className="mx-auto max-w-5xl border-t border-white/10" />

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
          <p className="text-lg font-bold uppercase tracking-tight text-yellow-300 sm:text-3xl lg:text-4xl">
            FAQ
          </p>
          <div className="mt-10 space-y-8">
            {[
              {
                q: "What counts as a document?",
                a: "Anything you upload or paste — an essay, an article, a chapter, a blog post. Individual plans include up to 50,000 words of scans per month, which is roughly 15–20 typical essays or 5–6 longer chapters.",
              },
              {
                q: "What's different about Professional Editor?",
                a: "If you edit other people's writing professionally — freelance editing, tutoring, agency work — Professional Editor lets you keep a separate Style Training profile per client, so EzSay learns each writer's voice individually instead of mixing them. Plus unlimited scans.",
              },
              {
                q: "Can I switch plans?",
                a: "Yes, any time. Upgrades apply immediately and we pro-rate the difference. Downgrades take effect at the end of your current billing period.",
              },
              {
                q: "Is my writing used to train AI?",
                a: "No. Your documents are used only to generate suggestions for you and to train your personal Style Training profile, which stays on your account. We never use your writing to train public models.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="text-base font-semibold text-white sm:text-lg">
                  {item.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-300 sm:text-base">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Divider */}
        <div className="mx-auto max-w-5xl border-t border-white/10" />

        {/* Final nudge */}
        <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Still not sure? Run a free scan first.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/upload?free=1"
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow-300 px-7 py-3 text-sm font-medium text-gray-900 hover:bg-yellow-400"
            >
              Scan My Draft — Free
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-7 py-3 text-sm font-medium text-gray-400 hover:border-white/40 hover:text-gray-200"
            >
              Back to Home
            </Link>
          </div>
        </section>

        {/* Footer (dark, matches landing) */}
        <footer className="border-t border-white/10 px-6 py-6 sm:px-10">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span className="text-xs text-gray-500">
              EZsay. Your voice, louder.
            </span>
            <div className="flex flex-wrap justify-center gap-5">
              <Link href="/pricing" className="text-xs text-gray-500 hover:text-gray-300">
                Pricing
              </Link>
              <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-300">
                Terms
              </Link>
              <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-300">
                Privacy
              </Link>
              <Link href="/refund" className="text-xs text-gray-500 hover:text-gray-300">
                Refunds
              </Link>
              <Link href="/login" className="text-xs text-gray-500 hover:text-gray-300">
                Log In
              </Link>
              <Link href="/signup" className="text-xs text-gray-500 hover:text-gray-300">
                Sign Up
              </Link>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
