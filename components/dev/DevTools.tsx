"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface UserSummary {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

/**
 * Dev-only floating widget. Visible only when NODE_ENV=development. Lives
 * bottom-right on every page (mounted from app/layout.tsx). Lets the dev
 * see who they're signed in as, jump between key routes, and reset the
 * account back to a "brand new" state without manual SQL surgery.
 *
 * The reset endpoint (/api/dev/reset) re-checks NODE_ENV server-side so
 * shipping this widget to prod can't expose nuclear options even if the
 * client check is bypassed.
 */
export default function DevTools() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(
        data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? null,
              isAnonymous: !!data.user.is_anonymous,
            }
          : null,
      );
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      setUser(
        session?.user
          ? {
              id: session.user.id,
              email: session.user.email ?? null,
              isAnonymous: !!session.user.is_anonymous,
            }
          : null,
      );
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Hide entirely outside dev. process.env.NODE_ENV is statically inlined
  // at build time so this whole component tree-shakes out of prod bundles.
  if (process.env.NODE_ENV !== "development") return null;

  function clearLocalStorage() {
    try {
      localStorage.removeItem("ezsay_free_scan_doc_id");
    } catch {
      /* ignore */
    }
  }

  async function handleResetData() {
    if (!confirm("Wipe your documents, scans, and usage? Account stays signed in.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dev/reset?mode=reset", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setMessage(`Failed: ${json.error}`);
      } else {
        clearLocalStorage();
        setMessage("Data wiped. Refresh to see the fresh state.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);
    try {
      await supabase.auth.signOut();
      clearLocalStorage();
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleNuke() {
    if (
      !confirm(
        "NUKE: delete account + all data + sign out + go home. Forces brand-new visitor state. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dev/reset?mode=nuke", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setMessage(`Nuke failed: ${json.error}`);
        setBusy(false);
        return;
      }
      // Account is gone server-side. Now drop the local session cookie
      // and clear localStorage so the next page load is truly fresh.
      await supabase.auth.signOut();
      clearLocalStorage();
      router.push("/");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Nuke failed");
      setBusy(false);
    }
  }

  // Collapsed pill (default state)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dev Tools"
        className="fixed bottom-3 right-3 z-[200] rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg ring-2 ring-amber-300/60 hover:bg-amber-600"
      >
        DEV
      </button>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-3 right-3 z-[200] w-[280px] rounded-lg border border-amber-300 bg-white font-mono text-[11px] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-amber-500 px-3 py-1.5 text-white">
        <span className="font-bold uppercase tracking-wider">Dev Tools</span>
        <button
          onClick={() => setOpen(false)}
          className="text-white hover:text-amber-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* User state */}
      <div className="border-b border-amber-100 bg-amber-50/40 px-3 py-2 text-gray-700">
        {user ? (
          <>
            <div className="truncate">
              <span className="text-gray-500">user:</span>{" "}
              <span className="font-semibold">
                {user.email ?? (user.isAnonymous ? "(anonymous)" : "(no email)")}
              </span>
            </div>
            <div className="text-[10px] text-gray-500">
              id: {user.id.slice(0, 8)}…
              {user.isAnonymous && (
                <span className="ml-1 rounded bg-amber-200 px-1 py-px text-[9px] font-bold text-amber-800">
                  ANON
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="text-gray-500 italic">signed out</span>
        )}
        <div className="mt-1 text-[10px] text-gray-400">
          path: <span className="text-gray-600">{pathname}</span>
        </div>
      </div>

      {/* Quick nav */}
      <div className="border-b border-amber-100 px-3 py-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">Go to</div>
        <div className="grid grid-cols-2 gap-1">
          <Link href="/" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Home
          </Link>
          <Link href="/w" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Workspace
          </Link>
          <Link href="/scan" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Free Scan
          </Link>
          <Link href="/pricing" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Pricing
          </Link>
          <Link href="/login" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Login
          </Link>
          <Link href="/admin" className="rounded bg-gray-100 px-2 py-1 text-center text-gray-700 hover:bg-gray-200">
            Admin
          </Link>
        </div>
      </div>

      {/* Reset actions */}
      <div className="px-3 py-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">Reset</div>
        <div className="space-y-1">
          <button
            onClick={handleResetData}
            disabled={busy || !user}
            className="block w-full rounded bg-blue-600 px-2 py-1.5 text-left text-white hover:bg-blue-700 disabled:opacity-40"
            title="Delete docs/scans/usage. Account stays."
          >
            🧹 Wipe my scans (keep account)
          </button>
          <button
            onClick={handleSignOut}
            disabled={busy || !user}
            className="block w-full rounded bg-gray-700 px-2 py-1.5 text-left text-white hover:bg-gray-800 disabled:opacity-40"
            title="Clear session. Account and data stay in DB."
          >
            🚪 Sign out only
          </button>
          <button
            onClick={handleNuke}
            disabled={busy || !user}
            className="block w-full rounded bg-red-600 px-2 py-1.5 text-left text-white hover:bg-red-700 disabled:opacity-40"
            title="Delete account + data + sign out. Brand-new state."
          >
            💥 Nuke me (delete account, go home)
          </button>
        </div>
        {message && (
          <p className="mt-2 text-[10px] text-gray-700">{message}</p>
        )}
      </div>
    </div>
  );
}
