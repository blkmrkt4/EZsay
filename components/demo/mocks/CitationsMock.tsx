"use client";

/** Mockup of the Citations tab: locked citations with structural + verification checks. */
const CITES = [
  {
    text: "Smith, J. (2021). The Future of Work. Oxford University Press.",
    status: "ok",
    note: "Verified — source found.",
  },
  {
    text: "Jones et al (2019) Remote teams and output, J. Mgmt.",
    status: "warn",
    note: "Missing period after “al”; page range absent.",
  },
  {
    text: "Lee, K. (2024). Async Culture. (publisher unknown).",
    status: "verify",
    note: "Could not confirm this source exists.",
  },
];

const BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  warn: "bg-yellow-100 text-yellow-800",
  verify: "bg-orange-100 text-orange-700",
};
const BADGE_LABEL: Record<string, string> = { ok: "Verified", warn: "Format", verify: "Unconfirmed" };

export default function CitationsMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-3 p-6 text-left">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Citations</h3>
        <span className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500">Style: APA</span>
      </div>
      <p className="text-xs text-gray-500">
        Citations are locked from editing and never count toward your risk score. We only check format and
        whether the source is real — and every fix needs your explicit OK.
      </p>

      {CITES.map((c) => (
        <div key={c.text} className="rounded-lg border-l-4 border-l-blue-300 bg-blue-50/50 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-gray-800">{c.text}</p>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE[c.status]}`}>
              {BADGE_LABEL[c.status]}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">{c.note}</p>
          {c.status !== "ok" && (
            <div className="mt-2 flex gap-1.5">
              <button className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-600">Accept fix</button>
              <button className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-600">Edit</button>
              <button className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-600">Mark verified</button>
              <button className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-600">Dismiss</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
