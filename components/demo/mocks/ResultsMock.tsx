"use client";

/**
 * HTML mockup of the read-only results screen (mirrors
 * app/results/[docId]/page.tsx): big colored AI-RISK SCORE, interpretation
 * box, and flagged-section cards with left-border severity shading.
 * Colors copied verbatim from that file's SIGNAL_COLORS / SIGNAL_BADGE.
 */
const SIGNAL_COLORS: Record<string, string> = {
  high: "border-l-amber-500 bg-amber-50",
  medium: "border-l-yellow-400 bg-yellow-50",
  low: "border-l-blue-300 bg-blue-50",
};
const SIGNAL_BADGE: Record<string, string> = {
  high: "bg-amber-100 text-amber-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};

const SECTIONS = [
  {
    level: "high",
    n: 1,
    flags: 5,
    text: "In today's fast-paced business landscape, it is important to note that leveraging synergies across the organization will unlock transformative value for all stakeholders moving forward.",
    pills: ["it is important to note", "fast-paced landscape", "leveraging synergies", "transformative value"],
  },
  {
    level: "medium",
    n: 2,
    flags: 3,
    text: "Furthermore, the data clearly demonstrates a robust correlation. Moreover, these findings underscore the need for a comprehensive approach. Additionally, we must consider the broader implications.",
    pills: ["Furthermore", "Moreover", "Additionally"],
  },
  {
    level: "low",
    n: 3,
    flags: 1,
    text: "Our team shipped the redesign in six weeks. It wasn't perfect, but customers noticed — support tickets dropped by a third the month after launch.",
    pills: ["uniform sentence length"],
  },
];

export default function ResultsMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4 overflow-hidden p-6 text-left">
      {/* Header with score */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Q3 Strategy Memo</h3>
          <p className="mt-0.5 text-xs text-gray-500">Professional document · 8 sections · 14 flags</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">AI Risk Score</p>
          <p className="text-5xl font-bold text-red-600">78</p>
        </div>
      </div>

      {/* Interpretation */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-700">
          This document contains several patterns commonly associated with AI-assisted writing across most sections.
        </p>
      </div>

      {/* Flagged sections */}
      <div className="space-y-2.5">
        {SECTIONS.map((s) => (
          <div key={s.n} className={`rounded-lg border-l-4 p-3 ${SIGNAL_COLORS[s.level]}`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Section {s.n}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SIGNAL_BADGE[s.level]}`}>
                {s.flags} flag{s.flags !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs text-gray-700">{s.text}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.pills.map((p) => (
                <span key={p} className="rounded border border-gray-200 bg-white/80 px-2 py-0.5 text-[11px] text-gray-600">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        1 citation section detected and locked — never flagged or scored.
      </p>
    </div>
  );
}
