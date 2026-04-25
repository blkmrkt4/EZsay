"use client";

import { useState } from "react";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  defaultPlan?: "individual" | "eaas";
}

export default function PaywallModal({
  open,
  onClose,
  defaultPlan = "individual",
}: PaywallModalProps) {
  const [plan, setPlan] = useState<"individual" | "eaas">(defaultPlan);
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const pricing = {
    individual: { monthly: 12, yearly: 9.96 },
    eaas: { monthly: 60, yearly: 49.8 },
  };

  const price = pricing[plan][billing];
  const yearlyTotal = Math.round(pricing[plan].yearly * 12);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Failed to start checkout");
        setLoading(false);
        return;
      }

      window.location.href = json.url;
    } catch {
      setError("Could not connect to the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:mx-0 sm:p-8">
        <h2 className="text-center text-2xl font-bold">Unlock the editor</h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          You&apos;ve seen what EzSay found. Subscribe to fix it.
        </p>

        {/* Plan toggle */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setPlan("individual")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                plan === "individual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setPlan("eaas")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                plan === "eaas"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Professional
            </button>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="mt-3 flex justify-center">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setBilling("yearly")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                billing === "yearly"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Yearly
              <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                Save 17%
              </span>
            </button>
            <button
              onClick={() => setBilling("monthly")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                billing === "monthly"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Pricing card */}
        <div className="mt-6 rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-4xl font-bold">
            ${billing === "yearly" ? price.toFixed(2) : price}
            <span className="text-lg font-normal text-gray-400">/mo</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {billing === "yearly"
              ? `Billed $${yearlyTotal}/year. Save 17%.`
              : "Billed monthly. Cancel anytime."}
          </p>

          <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
            {plan === "individual" ? (
              <>
                <FeatureItem>Up to 50,000 words scanned / month</FeatureItem>
                <FeatureItem>All six Auditor Score spectrums</FeatureItem>
                <FeatureItem>AI detection + A/B rewrites</FeatureItem>
                <FeatureItem>Plagiarism + citation verification</FeatureItem>
                <FeatureItem>Grammar and tone consistency</FeatureItem>
                <FeatureItem>Style Training (learns your voice)</FeatureItem>
              </>
            ) : (
              <>
                <FeatureItem>Everything in Individual, plus:</FeatureItem>
                <FeatureItem>Unlimited document scans</FeatureItem>
                <FeatureItem>Multiple client style profiles</FeatureItem>
                <FeatureItem>Early access to new features</FeatureItem>
              </>
            )}
          </ul>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Subscribe"}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-gray-400 hover:text-gray-600"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 text-green-500">&#10003;</span>
      {children}
    </li>
  );
}
