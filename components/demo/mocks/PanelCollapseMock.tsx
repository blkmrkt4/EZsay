"use client";

/**
 * Illustrates collapsing/expanding panels via the caret in each panel header
 * (Document / Edit / Choices). Shows the Choices panel collapsed to a rail to
 * give the editor more room.
 */
function PanelHeader({ label, side }: { label: string; side: "left" | "right" }) {
  const caret =
    side === "left" ? "M15.75 19.5 8.25 12l7.5-7.5" : "m8.25 4.5 7.5 7.5-7.5 7.5";
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="flex h-5 w-5 items-center justify-center rounded bg-white ring-1 ring-gray-200">
        <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={caret} />
        </svg>
      </span>
    </div>
  );
}

export default function PanelCollapseMock() {
  return (
    <div className="flex h-full w-full flex-col p-5 text-left">
      <p className="mb-3 text-xs text-gray-500">
        Every panel has a <span className="font-medium text-gray-700">caret</span> in its header — click it (or
        press its shortcut) to collapse the panel and hand the space to the others.
      </p>
      <div className="flex flex-1 overflow-hidden rounded-lg border border-gray-200">
        {/* Document */}
        <div className="flex w-[34%] flex-col border-r border-gray-200">
          <PanelHeader label="Document" side="left" />
          <div className="space-y-1.5 p-2">
            <div className="h-2 w-full rounded bg-gray-100" />
            <div className="h-2 w-5/6 rounded bg-gray-100" />
            <div className="h-2 w-full rounded bg-gray-100" />
            <div className="h-2 w-2/3 rounded bg-gray-100" />
          </div>
        </div>
        {/* Edit (gains space) */}
        <div className="flex flex-1 flex-col">
          <PanelHeader label="Edit" side="right" />
          <div className="space-y-2 p-3">
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
              <div className="h-2 w-3/4 rounded bg-amber-200/70" />
            </div>
            <div className="h-7 rounded-md border border-gray-200" />
            <div className="h-7 rounded-md border border-gray-200" />
          </div>
        </div>
        {/* Choices collapsed to a rail */}
        <div className="flex w-7 shrink-0 flex-col items-center border-l border-gray-200 bg-gray-50 py-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white ring-1 ring-gray-200">
            <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </span>
          <span className="mt-3 text-[9px] font-semibold uppercase tracking-wide text-gray-400 [writing-mode:vertical-rl]">
            Choices
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Here the Choices panel is collapsed — click its caret to bring it back.</p>
    </div>
  );
}
