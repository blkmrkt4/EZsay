import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for the static legal pages (Terms, Privacy, Refund).
 * Light-mode, prose-width column with a simple top bar back to home and a
 * footer cross-linking the other legal pages. Matches the landing brand
 * (gray-900 text, yellow accent) without pulling in the marketing nav.
 */
export default function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-gray-100 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight text-gray-900">
            EzSay
          </Link>
          <Link
            href="/"
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-gray-400">Last updated: {lastUpdated}</p>

        <div className="legal-prose mt-10 text-[15px] leading-relaxed text-gray-700">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="text-xs text-gray-400">EzSay. Your voice, louder.</span>
          <div className="flex gap-5">
            <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-700">
              Terms
            </Link>
            <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-700">
              Privacy
            </Link>
            <Link href="/refund" className="text-xs text-gray-400 hover:text-gray-700">
              Refunds
            </Link>
            <Link href="/pricing" className="text-xs text-gray-400 hover:text-gray-700">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A titled section within a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
