"use client";

/**
 * The Citations tab in detail (mirrors components/citations + the real tab):
 * "best left for last" guidance, structural issue count, re-check / web-verify,
 * style selector, and a citation card with a structural error.
 */
export default function CitationsDetailMock() {
  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-5 text-left">
      {/* Best-left-for-last banner */}
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
        <p className="text-sm font-semibold text-yellow-800">Citations are best left for last.</p>
        <p className="mt-0.5 text-xs text-yellow-700">
          You still have 36 edits to review. Finish your edits first — rewrites can move text around a citation,
          so fixing them now may be wasted work.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-900">Citations</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          1 citation found · Style: <span className="font-medium">APA</span> · <span className="text-orange-600">1 structural issue</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white">Re-check</span>
        <span className="flex items-center gap-1.5 rounded-md bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" />
          Verifying…
        </span>
        <span className="text-[11px] text-gray-400">Searching the web to verify each citation…</span>
      </div>

      {/* Style row */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-sm font-medium text-gray-700">
          Citation Style <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">APA</span>
        </span>
        <span className="text-[11px] text-gray-400">Click to change style</span>
      </div>

      {/* Citation card with structural error */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">All Citations</p>
        <div className="rounded-lg border-l-4 border-l-yellow-400 bg-yellow-50/60 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">#1</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">reference</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">APA</span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-gray-800">
            Barnett MN, Finnemore M. Rules for the World: International Organi…
          </p>
          <p className="mt-1 text-[11px] text-red-600">Error: No publication year found.</p>
        </div>
      </div>
    </div>
  );
}
