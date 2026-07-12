"use client";

/**
 * The Scan button + AUDITOR score in the workspace header (mirrors
 * CommandCapsule / AuditorScoreRing): pressing Scan re-runs analysis and
 * produces a single weighted Auditor score.
 */
export default function AuditorScanMock() {
  const score = 72;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 text-center">
      {/* Mock header strip */}
      <div className="flex w-full max-w-xl items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <img src="/brand/ezsay-mark-black.svg" alt="" className="h-7 w-7" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white">Scan</span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Auditor</span>
            <span className="relative flex h-9 w-9 items-center justify-center">
              <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${score} 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute text-xs font-bold text-amber-600">{score}</span>
            </span>
          </span>
        </div>
      </div>

      <p className="max-w-sm text-sm text-gray-500">
        The <span className="font-medium text-gray-700">Scan</span> button runs a full pass and rolls every
        spectrum — AI, artifacts, writing quality, plagiarism, citations, tone — into one weighted{" "}
        <span className="font-medium text-gray-700">Auditor score</span>. Re-scan anytime to watch it move as you edit.
      </p>
    </div>
  );
}
