"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LandingNavProps {
  /**
   * Optional middle column. When provided, the nav renders as a 3-column
   * layout (logo | middleSlot | menu) — lets callers tuck hero content
   * into the nav row so the tall logo does not push it below the fold.
   */
  middleSlot?: ReactNode;
}

export default function LandingNav({ middleSlot }: LandingNavProps = {}) {
  const navRef = useRef<HTMLElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  // Auth-aware nav: when signed-in, swap "Log In" for "Workspace" so authed
  // users don't get bounced through /login → middleware redirect → workspace
  // layout's subscription gate → /pricing (which reads as "Log In sends me
  // to pricing" — confusing).
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const pathname = usePathname();
  const onHome = pathname === "/";

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolledPast(!entry.isIntersecting),
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsAuthed(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setIsAuthed(!!session?.user);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <nav
        ref={navRef}
        className={`flex items-start gap-6 px-6 py-4 sm:px-10 sm:pl-14 ${
          middleSlot ? "justify-between" : "justify-between"
        }`}
      >
        <Link
          href="/"
          aria-label="EzSay home"
          className="inline-flex shrink-0 items-center pl-4"
        >
          <img src="/brand/ezsay-lockup-black.svg" alt="EzSay" className="h-[134px] w-auto" />
        </Link>

        {middleSlot && (
          <div className="min-w-0 flex-1 pt-[150px]">{middleSlot}</div>
        )}

        <div className="flex shrink-0 items-center gap-5">
          {onHome ? (
            <Link href="/pricing" className="hidden text-sm text-gray-500 hover:text-gray-900 sm:block">
              Pricing
            </Link>
          ) : (
            <Link href="/" className="hidden text-sm text-gray-500 hover:text-gray-900 sm:block">
              Home
            </Link>
          )}
          {isAuthed ? (
            <Link href="/w" className="text-sm text-gray-500 hover:text-gray-900">
              Workspace
            </Link>
          ) : (
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900">
              Log In
            </Link>
          )}
          <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900">
            Watch Demo
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Floating sticky pill — appears when the main nav scrolls out of view */}
      <div
        aria-hidden={!scrolledPast}
        className={`fixed inset-x-0 top-4 z-50 flex justify-center px-4 transition-all duration-300 ease-out ${
          scrolledPast
            ? "opacity-100 translate-y-0"
            : "pointer-events-none -translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-center gap-1 rounded-full bg-gray-900 pl-3 pr-1 py-1 text-sm text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
          <Link
            href="/"
            aria-label="EzSay home"
            tabIndex={scrolledPast ? 0 : -1}
            className="inline-flex items-center pr-3"
          >
            <img src="/brand/ezsay-mark-white.svg" alt="" className="h-5 w-5" />
          </Link>
          {onHome ? (
            <Link
              href="/pricing"
              tabIndex={scrolledPast ? 0 : -1}
              className="hidden rounded-full px-3 py-1.5 text-gray-300 hover:text-white sm:inline-block"
            >
              Pricing
            </Link>
          ) : (
            <Link
              href="/"
              tabIndex={scrolledPast ? 0 : -1}
              className="hidden rounded-full px-3 py-1.5 text-gray-300 hover:text-white sm:inline-block"
            >
              Home
            </Link>
          )}
          {isAuthed ? (
            <Link
              href="/w"
              tabIndex={scrolledPast ? 0 : -1}
              className="rounded-full px-3 py-1.5 text-gray-300 hover:text-white"
            >
              Workspace
            </Link>
          ) : (
            <Link
              href="/login"
              tabIndex={scrolledPast ? 0 : -1}
              className="rounded-full px-3 py-1.5 text-gray-300 hover:text-white"
            >
              Log In
            </Link>
          )}
          <Link
            href="/upload?free=1"
            tabIndex={scrolledPast ? 0 : -1}
            className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 font-medium text-gray-900 hover:bg-gray-100"
          >
            Watch Demo
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </>
  );
}
