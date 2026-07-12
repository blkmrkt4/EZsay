"use client";

/**
 * HTML mockup of the full /w workspace: left icon rail, tab strip
 * (Analysis · Edit · Review Edit Choices | Citations), Doc panel,
 * Edit panel, Choices panel. Used for the "workspace overview" step and
 * reused (focused) by EditPanesMock. Compact but layout-faithful.
 */
const TABS = ["Analysis", "Edit", "Review Edit Choices"];

function RailIcon({ active = false, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-md ${
        active ? "bg-gray-900 text-white" : "text-gray-400"
      }`}
    >
      {children}
    </div>
  );
}

export default function WorkspaceMock() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-white text-left text-[11px]">
      {/* Left rail */}
      <div className="flex w-10 shrink-0 flex-col items-center gap-3 border-r border-gray-200 bg-gray-50 py-3">
        <RailIcon>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.5 1.5 0 0 1 2.12 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" /></svg>
        </RailIcon>
        <RailIcon>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </RailIcon>
        <RailIcon active>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
        </RailIcon>
        <RailIcon>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.03 7.03 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.241.437-.613.43-.992a6.93 6.93 0 0 1 0-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /></svg>
        </RailIcon>
      </div>

      {/* Doc panel */}
      <div className="hidden w-[28%] shrink-0 flex-col border-r border-gray-200 sm:flex">
        <div className="border-b border-gray-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Document
        </div>
        <div className="flex-1 space-y-2 overflow-hidden p-3 leading-relaxed">
          <p className="rounded border-l-2 border-l-green-400 bg-green-50 px-2 py-1 text-gray-400 line-through decoration-gray-300">
            Resolved opening paragraph that you already cleaned up earlier.
          </p>
          <p className="rounded border-l-2 border-l-violet-400 bg-violet-50 px-2 py-1 text-gray-700">
            In today&apos;s fast-paced business landscape, it is{" "}
            <span className="rounded bg-violet-200 px-0.5 ring-1 ring-violet-400">important to note</span>{" "}
            that leveraging synergies will unlock value.
          </p>
          <p className="px-2 py-1 text-gray-500">
            Furthermore, the data clearly demonstrates a robust correlation between the two variables.
          </p>
        </div>
      </div>

      {/* Edit panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tab strip */}
        <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50/80 px-2 py-1">
          {TABS.map((t, i) => (
            <span
              key={t}
              className={`rounded px-2 py-1 text-[10px] font-medium ${
                i === 1 ? "bg-white text-blue-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500"
              }`}
            >
              {t}
            </span>
          ))}
          <div className="mx-1 h-3 w-px bg-gray-300" />
          <span className="rounded px-2 py-1 text-[10px] font-medium text-gray-500">Citations</span>
        </div>

        <div className="flex-1 space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Common AI Phrase</span>
            <span className="text-[10px] text-gray-400">Flag 3 of 14</span>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-gray-700">
            …it is <span className="rounded bg-amber-200 px-0.5">important to note</span> that leveraging synergies…
          </div>
          <p className="text-[10px] text-gray-400">Common AI filler phrase — detection tools flag it often.</p>
          <div className="space-y-1.5">
            {["…that synergies will unlock value.", "…synergies should unlock real value.", "Edit this paragraph myself"].map((o, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-gray-200 px-2 py-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500">{i + 1}</span>
                <span className="text-gray-600">{o}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Choices panel */}
      <div className="hidden w-[20%] shrink-0 flex-col border-l border-gray-200 bg-gray-50 p-3 lg:flex">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Your choice</p>
        <p className="mt-1 text-gray-500">Which version would you like to use?</p>
        <div className="mt-2 space-y-1.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${n === 1 ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500">{n}</span>
              <span className="text-gray-600">Option {n}</span>
            </div>
          ))}
        </div>
        <button className="mt-3 rounded-md bg-blue-600 py-1.5 text-white">Confirm</button>
        <div className="mt-1.5 flex gap-1.5">
          <button className="flex-1 rounded-md border border-gray-300 py-1 text-gray-500">Skip</button>
          <button className="flex-1 rounded-md border border-gray-300 py-1 text-gray-500">Reject</button>
        </div>
        <p className="mt-2 text-[10px] text-gray-400">3 of 14 flags</p>
      </div>
    </div>
  );
}
