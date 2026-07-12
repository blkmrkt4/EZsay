"use client";

/**
 * The full Style Rules panel (mirrors components/style-settings/StyleSettingsPanel):
 * a searchable list of Universal Preferences with toggles and dropdowns, plus
 * the Quick setup wizard entry.
 */
const ROWS: { label: string; desc: string; control: "toggle-on" | "toggle-off" | string }[] = [
  { label: "English variant", desc: "Which regional English conventions should your writing follow?", control: "American English" },
  { label: "Formality level", desc: "The expected level of formality in the writing.", control: "Formal" },
  { label: "Allow contractions", desc: "Are contractions like don't and it's acceptable?", control: "toggle-on" },
  { label: "Oxford comma", desc: "Use a comma before and in lists of three or more items?", control: "toggle-on" },
  { label: "Passive voice tolerance", desc: "How strictly should passive voice be flagged?", control: "Moderate" },
  { label: "Quotation marks", desc: "Double (American) or single (British) convention?", control: "Double quotes" },
  { label: "Spaces after a period", desc: "One space (modern) or two (traditional)?", control: "One space" },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 ${on ? "justify-end bg-blue-500" : "justify-start bg-gray-300"}`}>
      <span className="h-4 w-4 rounded-full bg-white" />
    </span>
  );
}

function Dropdown({ value }: { value: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700">
      {value}
      <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
    </span>
  );
}

export default function StyleRulesFullMock() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden p-5 text-left">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Style Rules</h3>
          <p className="text-xs text-gray-500">Set your document&apos;s style rules. These guide scanning and suggestions.</p>
        </div>
        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">Quick setup wizard</span>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs text-gray-400">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
        Search settings…
      </div>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Universal Preferences</p>
      <div className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-200">
        {ROWS.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{r.label}</p>
              <p className="truncate text-[11px] text-gray-500">{r.desc}</p>
            </div>
            {r.control === "toggle-on" ? <Toggle on /> : r.control === "toggle-off" ? <Toggle on={false} /> : <Dropdown value={r.control} />}
          </div>
        ))}
      </div>
    </div>
  );
}
