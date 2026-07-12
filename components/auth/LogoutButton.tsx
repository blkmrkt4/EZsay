"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
  children: ReactNode;
  title?: string;
}

/**
 * Signs the user out and hard-navigates to the landing page. The full
 * page load (rather than a client-side route push) guarantees every
 * server component re-renders in the signed-out state.
 */
export default function LogoutButton({ className, children, title }: LogoutButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      title={title ?? "Log out"}
      className={className}
    >
      {children}
    </button>
  );
}
