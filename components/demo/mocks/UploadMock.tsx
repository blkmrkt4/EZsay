"use client";

/**
 * HTML mockup of the library-panel upload form (mirrors app/w/page.tsx
 * ~lines 1620–1710): drag-drop zone, "or paste", editable Document Name,
 * document-type pills, Upload button.
 */
const DOC_TYPES = ["professional", "academic", "casual", "legal"];

export default function UploadMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-sm flex-col justify-center gap-4 p-6 text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Add a document
      </p>

      {/* Drag-drop zone */}
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
        <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-medium text-gray-600">Drop file or click to browse</p>
        <p className="text-xs text-gray-400">PDF, DOCX, or TXT</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
      </div>

      <textarea
        readOnly
        rows={2}
        value="Paste your text here…"
        className="resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-400"
      />

      {/* Editable document name — the rename-to-working-doc moment */}
      <div className="relative">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Document name
        </label>
        <div className="flex items-center rounded-md border-2 border-yellow-300 bg-yellow-50/40 px-3 py-2">
          <span className="text-sm font-medium text-gray-800">Q3 Strategy Memo</span>
          <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-gray-800" />
        </div>
      </div>

      {/* Document type pills */}
      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Document type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DOC_TYPES.map((t) => (
            <span
              key={t}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                t === "professional"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <button className="rounded-md bg-blue-600 py-2 text-sm font-medium text-white">
        Upload &amp; scan
      </button>
    </div>
  );
}
