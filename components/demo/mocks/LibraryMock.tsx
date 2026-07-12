"use client";

/**
 * HTML mockup of the document library/dashboard (mirrors
 * app/(dashboard)/dashboard/page.tsx and the workspace library panel):
 * cards with title, type · status · date, word count, items-to-review,
 * and a right-aligned risk score colored red≥70 / amber≥40 / green<40.
 */
interface MockDoc {
  title: string;
  type: string;
  status: string;
  date: string;
  words: number;
  toReview: number;
  versions: number;
  score: number | null;
}

const DOCS: MockDoc[] = [
  { title: "Q3 Strategy Memo", type: "Professional", status: "Scanned", date: "Jun 9, 2026", words: 1840, toReview: 14, versions: 1, score: 78 },
  { title: "Climate Policy Essay", type: "Academic", status: "In Progress", date: "Jun 7, 2026", words: 3120, toReview: 6, versions: 3, score: 52 },
  { title: "Personal Statement", type: "Casual", status: "Complete", date: "Jun 2, 2026", words: 640, toReview: 0, versions: 4, score: 21 },
];

function scoreColor(score: number) {
  return score >= 70 ? "text-red-600" : score >= 40 ? "text-amber-500" : "text-green-600";
}

export default function LibraryMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-3 p-6 text-left">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Your Documents</h3>
        <span className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
          Add document
        </span>
      </div>

      {DOCS.map((d) => (
        <div
          key={d.title}
          className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{d.title}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {d.type} · {d.status} · {d.date} · {d.versions}v
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-gray-400">
              <span>{d.words.toLocaleString()} words</span>
              <span className="text-gray-300">|</span>
              {d.toReview > 0 ? (
                <span className="font-medium text-amber-600">{d.toReview} items to review</span>
              ) : (
                <span className="font-medium text-green-600">All resolved ✓</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-2xl font-bold ${scoreColor(d.score!)}`}>{d.score}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Risk</p>
          </div>
        </div>
      ))}
    </div>
  );
}
