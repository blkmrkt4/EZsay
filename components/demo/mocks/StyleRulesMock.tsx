"use client";

/** Mockup of the Style Rules panel: per-document-type preferences that steer scanning + suggestions. */
const RULES = [
  { label: "Contractions", value: "Allow (don't, we're)", on: true },
  { label: "First person", value: "Allowed — I / we", on: true },
  { label: "Oxford comma", value: "Required", on: true },
  { label: "Sentence length", value: "Vary — avoid uniformity", on: true },
  { label: "Em dashes", value: "Limit to occasional", on: false },
];

export default function StyleRulesMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-3 p-6 text-left">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Style Rules</h3>
        <p className="text-xs text-gray-500">
          Set how your writing should sound. These preferences guide scanning and the suggestions you&apos;re offered.
        </p>
      </div>

      {/* Doc-type tabs */}
      <div className="flex gap-1.5">
        {["Professional", "Academic", "Casual", "Legal"].map((t, i) => (
          <span
            key={t}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              i === 0 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {RULES.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">{r.label}</p>
              <p className="text-xs text-gray-500">{r.value}</p>
            </div>
            <span
              className={`flex h-5 w-9 items-center rounded-full px-0.5 ${r.on ? "justify-end bg-blue-500" : "justify-start bg-gray-300"}`}
            >
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">Each document type keeps its own rules — academic never bleeds into casual.</p>
    </div>
  );
}
