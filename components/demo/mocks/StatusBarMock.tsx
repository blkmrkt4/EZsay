"use client";

/**
 * The workspace status bar (bottom-left of /w): live word & character count,
 * section / flag / citation tallies, items-to-review, and last-scan depth.
 */
export default function StatusBarMock() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 text-center">
      {/* The status strip, shown in context at the bottom of a faux editor */}
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="space-y-1.5 p-4">
          <div className="h-2 w-5/6 rounded bg-gray-100" />
          <div className="h-2 w-full rounded bg-gray-100" />
          <div className="h-2 w-2/3 rounded bg-gray-100" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
          <span className="font-medium text-gray-700">6,090 words · 42,072 chars</span>
          <span className="text-gray-300">|</span>
          <span>42 sections · 36 flags + 1 citation · 36 items to review</span>
          <span className="text-gray-300">|</span>
          <span>Last scan: comprehensive</span>
        </div>
      </div>

      <p className="max-w-sm text-sm text-gray-500">
        The status bar in the bottom-left keeps a live <span className="font-medium text-gray-700">word and
        character count</span> as you edit, alongside how many items are left to review and when you last scanned.
      </p>
    </div>
  );
}
