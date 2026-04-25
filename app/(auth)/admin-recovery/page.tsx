"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminRecoveryPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    adminEmail: string | null;
    remainingCodes: number;
  } | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: code.trim() }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Invalid code");
        setLoading(false);
        return;
      }

      setSuccess({
        adminEmail: json.data.adminEmail,
        remainingCodes: json.data.remainingCodes,
      });
      setLoading(false);
    } catch {
      setError("Could not connect to the server.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Recovery code accepted
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Your admin account is{" "}
            <span className="font-medium text-gray-700">
              {success.adminEmail}
            </span>
            . Use the link below to reset your password via Supabase, then log in
            normally.
          </p>
          <p className="mt-2 text-xs text-amber-600">
            {success.remainingCodes} recovery code
            {success.remainingCodes !== 1 ? "s" : ""} remaining.
            {success.remainingCodes <= 2 &&
              " Generate new codes from the admin panel after logging in."}
          </p>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => router.push("/login")}
              className="block w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            EzSay
          </span>
        </div>

        <h1 className="text-center text-xl font-bold text-gray-900">
          Admin Recovery
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Enter one of your recovery codes to verify admin access.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            required
            maxLength={9}
            className="block w-full rounded-lg border border-gray-200 px-4 py-3 text-center font-mono text-lg tracking-widest text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />

          {error && <p className="text-center text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length < 9}
            className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Each code can only be used once. If you&apos;ve used all your codes,
          contact the system administrator.
        </p>
      </div>
    </div>
  );
}
