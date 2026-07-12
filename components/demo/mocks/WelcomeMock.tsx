"use client";

/** Intro visual for the first step — a before→after score transformation. */
export default function WelcomeMock() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/brand/ezsay-mark-black.svg" alt="EzSay" className="h-12 w-12" onError={(e) => (e.currentTarget.style.display = "none")} />

      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="text-5xl font-bold text-red-600">78</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">Reads as AI</p>
        </div>

        <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>

        <div className="text-center">
          <p className="text-5xl font-bold text-green-600">19</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">Sounds like you</p>
        </div>
      </div>

      <p className="max-w-sm text-sm text-gray-500">
        EzSay doesn&apos;t rewrite your work for you. It shows you the AI-pattern phrasing, then walks you
        through fixing it — one decision at a time. You stay the author.
      </p>
    </div>
  );
}
