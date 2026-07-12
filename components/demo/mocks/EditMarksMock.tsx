"use client";

/**
 * The heatmap scroll rail: orange tick marks down the right edge of the
 * Document panel showing where flags/edits sit, so you can jump to them.
 */
const TICKS = [6, 13, 19, 24, 30, 38, 44, 51, 58, 66, 73, 80, 88, 94];

export default function EditMarksMock() {
  return (
    <div className="flex h-full w-full flex-col p-5 text-left">
      <p className="mb-3 text-xs text-gray-500">
        The marks down the scroll rail show <span className="font-medium text-amber-600">where every edit is</span> in
        the document. Click a mark to jump straight to that flag.
      </p>
      <div className="relative flex flex-1 overflow-hidden rounded-lg border border-gray-200">
        {/* Document text */}
        <div className="flex-1 space-y-1.5 p-3 pr-6">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded ${i % 3 === 0 ? "bg-amber-100" : "bg-gray-100"}`}
              style={{ width: `${70 + ((i * 13) % 28)}%` }}
            />
          ))}
        </div>
        {/* Scroll rail with ticks */}
        <div className="relative w-3 shrink-0 border-l border-gray-200 bg-gray-50">
          {TICKS.map((t) => (
            <span
              key={t}
              className="absolute left-1/2 h-1 w-2 -translate-x-1/2 rounded-full bg-amber-400"
              style={{ top: `${t}%` }}
            />
          ))}
          {/* viewport thumb */}
          <span className="absolute left-1/2 top-2 h-6 w-2 -translate-x-1/2 rounded-full bg-gray-300" />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Denser clusters of marks = sections with more to review.</p>
    </div>
  );
}
