"use client";

/**
 * The document picker opened, showing version history (mirrors the doc
 * dropdown in app/w/page.tsx): search, selected doc, a VERSIONS list of
 * saved revisions, and "New document".
 */
const VERSIONS = [
  { label: "Q3 Strategy Memo — Jun9 · v3", date: "6/9/2026", score: 41 },
  { label: "Q3 Strategy Memo — Jun7 · v2", date: "6/7/2026", score: 63 },
  { label: "Q3 Strategy Memo — Jun5 · v1", date: "6/5/2026", score: 78 },
];

export default function LibraryVersionsMock() {
  return (
    <div className="flex h-full w-full items-start justify-center p-6 text-left">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
        {/* Selected document row (the picker trigger) */}
        <div className="flex items-center justify-between rounded-t-xl border-b border-gray-100 px-3 py-2.5">
          <span className="text-sm font-medium text-gray-800">Q3 Strategy Memo</span>
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
        </div>

        {/* Search */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            Find document…
          </div>
        </div>

        {/* Active doc with check */}
        <div className="mt-2 flex items-center justify-between px-3 py-2">
          <span className="text-sm text-gray-800">Q3 Strategy Memo</span>
          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        </div>

        {/* Versions */}
        <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Versions</p>
        <div className="px-1.5 pb-1">
          {VERSIONS.map((v) => (
            <div key={v.label} className="flex items-center justify-between rounded-md px-1.5 py-2 hover:bg-gray-50">
              <span className="truncate text-[13px] text-gray-700">{v.label}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-xs font-bold ${v.score >= 70 ? "text-red-600" : v.score >= 40 ? "text-amber-500" : "text-green-600"}`}>{v.score}</span>
                <span className="text-[10px] text-gray-400">{v.date}</span>
              </div>
            </div>
          ))}
        </div>

        {/* New document */}
        <button className="flex w-full items-center gap-2 rounded-b-xl border-t border-gray-100 px-3 py-2.5 text-sm text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New document
        </button>
      </div>
    </div>
  );
}
