"use client";

/**
 * Legend explaining what every highlight color means in the editor.
 * Colors mirror app/w/page.tsx SIGNAL_COLORS and the violet/green/grey
 * conventions documented in CLAUDE.md.
 */
const ROWS = [
  { swatch: "bg-amber-50 border-l-4 border-l-amber-500", label: "High AI signal", desc: "Strong AI-pattern writing — review first." },
  { swatch: "bg-yellow-50 border-l-4 border-l-yellow-400", label: "Medium signal", desc: "Some flagged phrasing or structure." },
  { swatch: "bg-blue-50 border-l-4 border-l-blue-300", label: "Low signal", desc: "Minor patterns worth a look." },
  { swatch: "bg-violet-100 border-l-4 border-l-violet-400", label: "Being edited now", desc: "The exact passage your current choice will replace." },
  { swatch: "bg-green-50 border-l-4 border-l-green-400", label: "Resolved", desc: "You've handled this section — dimmed and done." },
  { swatch: "bg-gray-100 border-l-4 border-l-gray-300", label: "Locked citation", desc: "Citations are never touched, flagged, or scored." },
];

export default function ShadingLegendMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-2.5 p-6 text-left">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        What the colors mean
      </p>
      {ROWS.map((r) => (
        <div key={r.label} className="flex items-stretch gap-3">
          <div className={`w-12 shrink-0 rounded ${r.swatch}`} />
          <div className="min-w-0 py-0.5">
            <p className="text-sm font-medium text-gray-800">{r.label}</p>
            <p className="text-xs text-gray-500">{r.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
