"use client";

/**
 * The document-formatting setup wizard (mirrors the Quick setup wizard modal):
 * a paged form of formatting questions with Yes/No toggles and dropdowns.
 */
function YesNo({ yes }: { yes: boolean }) {
  return (
    <span className="flex shrink-0 gap-1">
      <span className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${yes ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "border border-gray-200 text-gray-500"}`}>Yes</span>
      <span className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${!yes ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "border border-gray-200 text-gray-500"}`}>No</span>
    </span>
  );
}
function Select({ value }: { value: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700">
      {value}
      <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
    </span>
  );
}

const ROWS: { label: string; desc: string; control: React.ReactNode }[] = [
  { label: "Citation placement", desc: "Where do citations appear in your document?", control: <Select value="Inline (in-text)" /> },
  { label: "First person allowed", desc: "Is first person (I, we) acceptable?", control: <YesNo yes={false} /> },
  { label: "Paragraph indentation", desc: "Should each paragraph's first line be indented?", control: <YesNo yes={false} /> },
  { label: "Line spacing", desc: "What line spacing does your institution require?", control: <Select value="Double" /> },
  { label: "Heading format", desc: "How should section headings be formatted?", control: <Select value="Unnumbered" /> },
  { label: "Bibliography / reference list", desc: "Must the document end with a reference list?", control: <YesNo yes /> },
];

export default function FormattingWizardMock() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-left">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Wizard header + progress */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Page 2 of 2</span>
            <span className="font-medium text-blue-600">Save and start writing</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-full rounded-full bg-blue-500" />
          </div>
          <h3 className="mt-3 text-lg font-bold text-gray-900">Document formatting</h3>
          <p className="text-[11px] text-gray-500">Set each preference below, or leave the defaults.</p>
        </div>

        <div className="mt-2 max-h-[230px] divide-y divide-gray-100 overflow-hidden px-5">
          {ROWS.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{r.label}</p>
                <p className="truncate text-[11px] text-gray-500">{r.desc}</p>
              </div>
              {r.control}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <span className="text-sm text-gray-500">Back</span>
          <span className="rounded-md bg-blue-600 px-5 py-1.5 text-sm font-medium text-white">Done</span>
        </div>
      </div>
    </div>
  );
}
