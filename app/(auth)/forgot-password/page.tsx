"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // redirectTo points at our existing /auth/callback route, which
    // exchanges the recovery code for a session and then forwards the user
    // to /reset-password where they set a new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?redirect=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex justify-center">
            <span className="text-xl font-bold tracking-tight text-gray-900">EzSay</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Check your email</h1>
          <p className="mt-3 text-sm text-gray-500">
            If an account exists for <span className="font-medium text-gray-700">{email}</span>, we sent a reset link. Click it to set a new password.
          </p>
          <p className="mt-6 text-sm">
            <Link href="/login" className="font-medium text-gray-900 hover:text-gray-700">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <span className="text-xl font-bold tracking-tight text-gray-900">EzSay</span>
        </div>

        <h1 className="text-center text-xl font-bold text-gray-900">Reset your password</h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Enter the email you signed up with. We&apos;ll send you a link to set a new password.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email *"
            required
            className="block w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="my-5 border-t border-gray-100" />

        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-gray-900 hover:text-gray-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
