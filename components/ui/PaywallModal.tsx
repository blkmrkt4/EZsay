"use client";

import { useState } from "react";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PaywallModal({ open, onClose }: PaywallModalProps) {
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubscribe() {
    setLoading(true);
    // TODO: Call /api/stripe/checkout to create a Stripe Checkout session
    // For now, just show a placeholder
    alert("Stripe checkout not yet configured. Subscription will be wired up before launch.");
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:mx-0 sm:p-8">
        <h2 className="text-center text-2xl font-bold">Unlock the editor</h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          You&apos;ve seen what EzSay found. Subscribe to fix it, section by section.
        </p>

        {/* Plan toggle */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setPlan("annual")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                plan === "annual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Annual
              <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                Save 40%
              </span>
            </button>
            <button
              onClick={() => setPlan("monthly")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                plan === "monthly"
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
          {plan === "annual" ? (
            <>
              <p className="text-4xl font-bold">
                $9<span className="text-lg font-normal text-gray-400">/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Billed annually at $108/year
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl font-bold">
                $15<span className="text-lg font-normal text-gray-400">/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">Billed monthly</p>
            </>
          )}

          <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-500">&#10003;</span>
              Unlimited document scans and edits
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-500">&#10003;</span>
              Section-by-section AI-guided editing
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-500">&#10003;</span>
              Citation checking and verification
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-500">&#10003;</span>
              Style learning that adapts to your writing
            </li>
          </ul>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
