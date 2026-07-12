"use client";

/** Mockup of the Analysis tab (dashboard): score ring, breakdown, items to review. */
const BREAKDOWN = [
  { label: "AI detectability", value: 78, color: "bg-red-500" },
  { label: "AI artifacts", value: 40, color: "bg-amber-500" },
  { label: "Writing quality", value: 22, color: "bg-green-500" },
  { label: "Citations", value: 10, color: "bg-green-500" },
  { label: "Tone consistency", value: 35, color: "bg-amber-500" },
];

const CATEGORIES = [
  { label: "Common AI phrases", count: 6 },
  { label: "Uniform length", count: 4 },
  { label: "Transition cycling", count: 3 },
  { label: "Synonym rotation", count: 1 },
];

export default function AnalysisMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4 p-6 text-left">
      <div className="flex items-center gap-5">
        {/* Score ring */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="78 100" strokeLinecap="round" />
          </svg>
          <div className="absolute text-center">
            <p className="text-2xl font-bold text-red-600">78</p>
            <p className="text-[9px] uppercase tracking-wide text-gray-400">Risk</p>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Analysis</h3>
          <p className="text-sm text-gray-500">14 items to review across 8 sections.</p>
          <p className="mt-1 text-xs text-gray-400">1,840 words · Professional</p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-2">
        {BREAKDOWN.map((b) => (
          <div key={b.label} className="flex items-center gap-3 text-xs">
            <span className="w-28 shrink-0 text-gray-500">{b.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${b.color}`} style={{ width: `${b.value}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right font-medium text-gray-600">{b.value}</span>
          </div>
        ))}
      </div>

      {/* Items to review by category */}
      <div className="rounded-lg border border-gray-200 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Items to review</p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <div key={c.label} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
              <span className="text-gray-600">{c.label}</span>
              <span className="font-semibold text-gray-800">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
