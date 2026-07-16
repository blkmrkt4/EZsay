"use client";

/**
 * The guided citations checklist — the required path to a bibliography that
 * stands up to scrutiny, as three numbered steps with live states:
 *
 *   1. Verify sources are real   (web existence check, incremental)
 *   2. Check quotes              (quote appears in source + fairly used)
 *   3. Resolve the findings      (the fix cards below)
 *
 * A completed step shows its RESULTS, not just a checkmark — "All 16 checked"
 * alone reads as "all sources are real" when what verification actually found
 * may be 14 wrong and 1 fabricated. The first step with work remaining is
 * highlighted; verify actions are incremental by default (only unchecked
 * entries — reset: false) with full re-verify demoted to a small text link.
 * When all three steps are clear a completion banner points at Save Version.
 */

type Progress = { done: number; total: number } | null;

export interface SourceResults {
  verified: number;
  wrongDetails: number;
  fabricated: number;
  uncertain: number;
}

export interface QuoteResults {
  verified: number;
  nearMatch: number;
  notFound: number;
  misrepresented: number;
  sourceFound: number;
  uncertain: number;
}

interface ChecklistProps {
  totalSources: number;
  uncheckedSources: number;
  totalQuotes: number;
  uncheckedQuotes: number;
  openFindings: number;
  sourceResults: SourceResults;
  quoteResults: QuoteResults;
  verifying: boolean;
  quoteVerifying: boolean;
  busy: boolean; // any check running — disables all actions
  verifyProgress: Progress;
  quoteProgress: Progress;
  onVerifySources: (full: boolean) => void;
  onVerifyQuotes: (full: boolean) => void;
  onJumpToFindings?: () => void;
  onSaveVersion?: () => void;
}

const CHIP_TONES = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-gray-100 text-gray-500",
} as const;

function Chip({ n, label, tone }: { n: number; label: string; tone: keyof typeof CHIP_TONES }) {
  if (n === 0) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${CHIP_TONES[tone]}`}>
      {n} {label}
    </span>
  );
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
  sourceResults,
  quoteResults,
  verifying,
  quoteVerifying,
  busy,
  verifyProgress,
  quoteProgress,
  onVerifySources,
  onVerifyQuotes,
  onJumpToFindings,
  onSaveVersion,
}: ChecklistProps) {
  if (totalSources === 0 && totalQuotes === 0) return null;

  const sourcesDone = uncheckedSources === 0;
  const quotesDone = uncheckedQuotes === 0;
  const findingsDone = openFindings === 0;
  const allDone = sourcesDone && quotesDone && findingsDone;

  const sourceProblems = sourceResults.wrongDetails + sourceResults.fabricated + sourceResults.uncertain;
  const quoteProblems = quoteResults.nearMatch + quoteResults.notFound + quoteResults.misrepresented + quoteResults.sourceFound + quoteResults.uncertain;

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
          {sourcesDone ? (
            sourceProblems === 0 ? (
              <Chip n={totalSources} label={`source${totalSources !== 1 ? "s" : ""} — all check out`} tone="green" />
            ) : (
              <>
                <span className="text-[10px] text-gray-500">All {totalSources} checked, with findings:</span>
                <Chip n={sourceResults.verified} label="confirmed real" tone="green" />
                <Chip n={sourceResults.wrongDetails} label="real but details wrong" tone="amber" />
                <Chip n={sourceResults.fabricated} label="not found — likely fabricated" tone="red" />
                <Chip n={sourceResults.uncertain} label="couldn't check" tone="gray" />
              </>
            )
          ) : (
            <span className="text-[10px] text-gray-500">
              {totalSources - uncheckedSources} of {totalSources} checked · {uncheckedSources} unchecked
            </span>
          )}
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
          {sourcesDone && sourceProblems > 0
            ? "The flagged sources are in step 3 — fix or dismiss each one below."
            : "Searches the web for each reference to confirm it exists and the author, year, and title match. Catches invented references."}
        </p>
        {verifying && <ProgressBar progress={verifyProgress} tone="purple" />}
      </div>

      {/* Step 2 — check quotes */}
      <div className={stepClass(2, quotesDone)}>
        <div className="flex flex-wrap items-center gap-2">
          <StepBadge n={2} done={quotesDone} />
          <span className="text-xs font-semibold text-gray-700">Check quotes against sources</span>
          {totalQuotes === 0 ? (
            <span className="text-[10px] text-gray-500">No quotations in this document</span>
          ) : quotesDone ? (
            quoteProblems === 0 ? (
              <Chip n={totalQuotes} label={`quote${totalQuotes !== 1 ? "s" : ""} — all check out`} tone="green" />
            ) : (
              <>
                <span className="text-[10px] text-gray-500">All {totalQuotes} checked, with findings:</span>
                <Chip n={quoteResults.verified} label="verified" tone="green" />
                <Chip n={quoteResults.nearMatch} label="close but not exact" tone="amber" />
                <Chip n={quoteResults.notFound} label="not found in source" tone="red" />
                <Chip n={quoteResults.misrepresented} label={`misrepresent${quoteResults.misrepresented === 1 ? "s" : ""} the source`} tone="red" />
                <Chip n={quoteResults.sourceFound} label="possible source found" tone="blue" />
                <Chip n={quoteResults.uncertain} label="couldn't check" tone="gray" />
              </>
            )
          ) : (
            <span className="text-[10px] text-gray-500">
              {totalQuotes} quote{totalQuotes !== 1 ? "s" : ""} · {uncheckedQuotes === totalQuotes ? "none" : totalQuotes - uncheckedQuotes} checked
            </span>
          )}
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
          {quotesDone && quoteProblems > 0
            ? "The flagged quotes are in step 3 — fix or dismiss each one below."
            : "Finds each quotation's source and checks it appears there — and that your sentence fairly represents it. Best run after step 1, which finds the source links it reuses."}
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
              : `${openFindings} item${openFindings !== 1 ? "s" : ""} need${openFindings === 1 ? "s" : ""} your decision`}
          </span>
          {!findingsDone && onJumpToFindings && (
            <span className="ml-auto">
              <button
                onClick={onJumpToFindings}
                className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                Show me
              </button>
            </span>
          )}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-gray-500">
          Go through the Document-Wide Findings and Reference Entries sections below and decide each one: accept the suggested fix, edit it, mark it verified, or dismiss it. Fixing a reference re-opens step 1 for that entry.
        </p>
      </div>
    </div>
  );
}
