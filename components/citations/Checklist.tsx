"use client";

/**
 * The guided citations checklist — the required path to a bibliography that
 * stands up to scrutiny, as three numbered steps with live states:
 *
 *   1. Verify sources are real   (web existence check, incremental)
 *   2. Check quotes              (quote appears in source + fairly used)
 *   3. Resolve the findings      (the fix cards below)
 *
 * The first step with work remaining is highlighted; verify actions are
 * incremental by default (only unchecked entries — reset: false), with
 * full re-verify demoted to a small text link. When all three steps are
 * clear a completion banner points at Save Version / Re-scan / Download.
 */

type Progress = { done: number; total: number } | null;

interface ChecklistProps {
  totalSources: number;
  uncheckedSources: number;
  totalQuotes: number;
  uncheckedQuotes: number;
  openFindings: number;
  verifying: boolean;
  quoteVerifying: boolean;
  busy: boolean; // any check running — disables all actions
  verifyProgress: Progress;
  quoteProgress: Progress;
  onVerifySources: (full: boolean) => void;
  onVerifyQuotes: (full: boolean) => void;
  onSaveVersion?: () => void;
}

function ProgressBar({ progress, tone }: { progress: Progress; tone: "purple" | "indigo" }) {
  if (!progress || progress.total === 0) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${tone === "purple" ? "bg-purple-100" : "bg-indigo-100"}`}>
      <div
        className={`h-full rounded-full transition-all ${tone === "purple" ? "bg-purple-500" : "bg-indigo-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return done ? (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-700">✓</span>
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600">{n}</span>
  );
}

export default function Checklist({
  totalSources,
  uncheckedSources,
  totalQuotes,
  uncheckedQuotes,
  openFindings,
  verifying,
  quoteVerifying,
  busy,
  verifyProgress,
  quoteProgress,
  onVerifySources,
  onVerifyQuotes,
  onSaveVersion,
}: ChecklistProps) {
  if (totalSources === 0 && totalQuotes === 0) return null;

  const sourcesDone = uncheckedSources === 0;
  const quotesDone = uncheckedQuotes === 0;
  const findingsDone = openFindings === 0;
  const allDone = sourcesDone && quotesDone && findingsDone;

  // The first step with work remaining is "current".
  const currentStep = !sourcesDone ? 1 : !quotesDone ? 2 : !findingsDone ? 3 : 0;

  const stepClass = (n: number, done: boolean) =>
    `rounded-md border p-2.5 ${
      done ? "border-green-200 bg-green-50/50" :
      currentStep === n ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200" :
      "border-gray-200 bg-gray-50"
    }`;

  if (allDone) {
    return (
      <div className="mt-3 max-w-3xl rounded-md border border-green-300 bg-green-50 p-3">
        <p className="text-sm font-semibold text-green-800">✓ Citations complete</p>
        <p className="mt-1 text-[11px] leading-snug text-green-700">
          Every source is verified, every quote is checked, and every finding is resolved — your bibliography stands up to scrutiny.
        </p>
        <div className="mt-2 flex items-center gap-3">
          {onSaveVersion && (
            <button
              onClick={onSaveVersion}
              className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              Save a version
            </button>
          )}
          <span className="text-[10px] text-green-700">Then Re-scan for your final score, or download the edited file.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 max-w-3xl space-y-2">
      <p className="text-[11px] font-medium text-gray-600">
        Three steps to a bibliography that stands up to scrutiny — all three are needed:
      </p>

      {/* Step 1 — verify sources */}
      <div className={stepClass(1, sourcesDone)}>
        <div className="flex flex-wrap items-center gap-2">
          <StepBadge n={1} done={sourcesDone} />
          <span className="text-xs font-semibold text-gray-700">Verify sources are real</span>
          <span className="text-[10px] text-gray-500">
            {sourcesDone
              ? `All ${totalSources} checked`
              : `${totalSources - uncheckedSources} of ${totalSources} checked · ${uncheckedSources} unchecked`}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {sourcesDone ? (
              <button
                onClick={() => onVerifySources(true)}
                disabled={busy}
                className="text-[10px] text-gray-400 underline hover:text-gray-600 disabled:opacity-40"
                title="Wipe all source verdicts and re-check everything from the web"
              >
                Re-verify all
              </button>
            ) : (
              <button
                onClick={() => onVerifySources(false)}
                disabled={busy}
                className="rounded bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-700 disabled:opacity-40"
              >
                {verifying ? "Verifying…" : `Verify ${uncheckedSources} source${uncheckedSources !== 1 ? "s" : ""}`}
              </button>
            )}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-gray-500">
          Searches the web for each reference to confirm it exists and the author, year, and title match. Catches invented references.
        </p>
        {verifying && <ProgressBar progress={verifyProgress} tone="purple" />}
      </div>

      {/* Step 2 — check quotes */}
      <div className={stepClass(2, quotesDone)}>
        <div className="flex flex-wrap items-center gap-2">
          <StepBadge n={2} done={quotesDone} />
          <span className="text-xs font-semibold text-gray-700">Check quotes against sources</span>
          <span className="text-[10px] text-gray-500">
            {totalQuotes === 0
              ? "No quotations in this document"
              : quotesDone
                ? `All ${totalQuotes} checked`
                : `${totalQuotes} quote${totalQuotes !== 1 ? "s" : ""} · ${uncheckedQuotes === totalQuotes ? "none" : totalQuotes - uncheckedQuotes} checked`}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {totalQuotes > 0 && (quotesDone ? (
              <button
                onClick={() => onVerifyQuotes(true)}
                disabled={busy}
                className="text-[10px] text-gray-400 underline hover:text-gray-600 disabled:opacity-40"
                title="Wipe all quote verdicts and re-check everything"
              >
                Re-check all quotes
              </button>
            ) : (
              <button
                onClick={() => onVerifyQuotes(false)}
                disabled={busy}
                className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {quoteVerifying ? "Checking…" : `Check ${uncheckedQuotes} quote${uncheckedQuotes !== 1 ? "s" : ""}`}
              </button>
            ))}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-gray-500">
          Finds each quotation&apos;s source and checks it appears there — and that your sentence fairly represents it. Best run after step 1, which finds the source links it reuses.
        </p>
        {quoteVerifying && <ProgressBar progress={quoteProgress} tone="indigo" />}
      </div>

      {/* Step 3 — resolve findings */}
      <div className={stepClass(3, findingsDone)}>
        <div className="flex flex-wrap items-center gap-2">
          <StepBadge n={3} done={findingsDone} />
          <span className="text-xs font-semibold text-gray-700">Resolve the findings</span>
          <span className="text-[10px] text-gray-500">
            {findingsDone
              ? "Nothing needs a decision"
              : `${openFindings} item${openFindings !== 1 ? "s" : ""} below need${openFindings === 1 ? "s" : ""} your decision`}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-gray-500">
          Work through the cards below — accept the suggested fix, edit it, mark it verified, or dismiss it. Fixing a reference re-opens step 1 for that entry.
        </p>
      </div>
    </div>
  );
}
