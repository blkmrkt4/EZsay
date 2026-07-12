"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STEPS } from "./steps";
import { CalloutLayer } from "./Callout";

const ArrowRightIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

export default function DemoWizard({
  initialStep = 0,
  initialDrill,
}: {
  initialStep?: number;
  initialDrill?: number;
}) {
  const router = useRouter();
  const total = STEPS.length;
  const startStep = Math.min(Math.max(initialStep, 0), total - 1);
  const [step, setStep] = useState(startStep);
  // null = on the main path; a number = index within the current step's detour.
  const [drill, setDrill] = useState<number | null>(() => {
    const d = STEPS[startStep].drill;
    if (initialDrill == null || !d) return null;
    return Math.min(Math.max(initialDrill, 0), d.steps.length - 1);
  });

  const isFirst = step === 0;
  const isLast = step === total - 1;
  const current = STEPS[step];
  const detour = current.drill;
  const inDrill = drill !== null;
  const drillCount = detour?.steps.length ?? 0;
  const drillLast = inDrill && drill === drillCount - 1;

  // Active content: a drill sub-screen when in a detour, else the main step.
  const view = inDrill && detour ? detour.steps[drill] : current;

  // Main-path navigation always leaves any detour first.
  const goStep = useCallback((i: number) => {
    setDrill(null);
    setStep(Math.min(Math.max(i, 0), total - 1));
  }, [total]);
  const next = useCallback(() => goStep(step + 1), [goStep, step]);
  const back = useCallback(() => goStep(step - 1), [goStep, step]);
  const exit = useCallback(() => router.push("/"), [router]);

  const enterDrill = useCallback(() => setDrill(0), []);
  const backToTour = useCallback(() => setDrill(null), []);
  // Forward past the last sub-screen returns to the main path.
  const drillNext = useCallback(() => {
    setDrill((d) => (d === null ? d : d < drillCount - 1 ? d + 1 : null));
  }, [drillCount]);
  const drillPrev = useCallback(() => {
    setDrill((d) => (d === null ? d : d > 0 ? d - 1 : null));
  }, []);

  // Keyboard navigation — behaves differently inside a detour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (inDrill) drillNext();
        else if (!isLast) next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (inDrill) drillPrev();
        else back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (inDrill) backToTour();
        else exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inDrill, isLast, next, back, exit, drillNext, drillPrev, backToTour]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col px-4 pb-10 sm:px-6">
      {/* Top bar: progress + dots + close. In a detour the main row stays put
          and a connected second row of sub-dots branches down from the active
          step's dot — so it's visually clear you've dropped into a tunnel. */}
      <div className={`flex items-center justify-between gap-4 pt-4 ${detour ? "pb-16" : "pb-4"}`}>
        <span className="shrink-0 text-sm font-medium text-gray-500">
          {inDrill ? (
            <>
              Step {step + 1} <span className="text-gray-300">·</span>{" "}
              <span className="text-amber-600">Detail {drill! + 1} of {drillCount}</span>
            </>
          ) : (
            <>Step {step + 1} of {total}</>
          )}
        </span>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          {STEPS.map((s, i) => {
            const isActive = i === step;
            return (
              <div key={s.id} className="relative flex items-center">
                <button
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  onClick={() => goStep(i)}
                  className={`h-2 rounded-full transition-all ${
                    isActive
                      ? inDrill
                        ? "w-6 bg-amber-500"
                        : "w-6 bg-gray-900"
                      : "w-2 bg-gray-300 hover:bg-gray-400"
                  }`}
                />
                {/* Tunnel branch: connector + second row of sub-dots, centered under
                    this dot. Shown (dimmed) on any step that has a detour so the deeper
                    layer is visible before you enter; full-strength once you're inside. */}
                {isActive && detour && (
                  <div
                    className={`absolute left-1/2 top-full z-10 flex -translate-x-1/2 flex-col items-center transition-opacity ${
                      inDrill ? "" : "opacity-60"
                    }`}
                  >
                    <span className="h-3.5 w-0.5 bg-amber-400" />
                    <div className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1.5 shadow-sm">
                      {detour.steps.map((d, di) => (
                        <button
                          key={d.id}
                          aria-label={`${inDrill ? "Go to" : "Open"} detail ${di + 1}: ${d.title}`}
                          onClick={() => setDrill(di)}
                          className={`h-2 rounded-full transition-all ${
                            inDrill && di === drill ? "w-5 bg-amber-500" : "w-2 bg-amber-300 hover:bg-amber-400"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={exit}
          className="flex shrink-0 items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-900"
        >
          Exit
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Copy */}
      <div className="mx-auto mt-4 max-w-2xl text-center">
        {inDrill ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">↳ {current.title}</p>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{current.eyebrow}</p>
        )}
        <h2 className="mt-1.5 text-2xl font-bold text-gray-900 sm:text-3xl">{view.title}</h2>
        <p className="mt-3 text-base leading-relaxed text-gray-600">{view.body}</p>
      </div>

      {/* Nav */}
      <div className="mx-auto mt-6 flex w-full max-w-2xl items-center justify-between gap-4">
        {inDrill ? (
          <>
            <button
              onClick={backToTour}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back to tour
            </button>
            <button
              onClick={drillNext}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-7 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] hover:bg-amber-600"
            >
              {drillLast ? "Done" : "Next"}
              <ArrowRightIcon />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={back}
              disabled={isFirst}
              className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>

            {isLast ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/signup"
                  className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400"
                >
                  Sign up
                </Link>
                <Link
                  href="/scan"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-7 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] hover:bg-gray-700"
                >
                  Scan my draft — free
                  <ArrowRightIcon />
                </Link>
              </div>
            ) : (
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-7 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] hover:bg-gray-700"
              >
                Got it
                <ArrowRightIcon />
              </button>
            )}
          </>
        )}
      </div>

      {/* Drill-in entry — only on the main path when this step has a detour */}
      {!inDrill && detour && (
        <div className="mx-auto mt-4 flex w-full max-w-2xl justify-center">
          <button
            onClick={enterDrill}
            className="group inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
              +
            </span>
            Go deeper: {detour.label}
            {drillCount > 1 && <span className="text-amber-500">· {drillCount}</span>}
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      <p className="mt-4 text-center text-xs text-gray-400">
        {inDrill ? (
          <>
            <kbd className="rounded border border-gray-300 px-1">←</kbd>{" "}
            <kbd className="rounded border border-gray-300 px-1">→</kbd> through details ·{" "}
            <kbd className="rounded border border-gray-300 px-1">Esc</kbd> back to tour
          </>
        ) : (
          <>
            Use <kbd className="rounded border border-gray-300 px-1">←</kbd>{" "}
            <kbd className="rounded border border-gray-300 px-1">→</kbd> to navigate ·{" "}
            <kbd className="rounded border border-gray-300 px-1">Esc</kbd> to exit
          </>
        )}
      </p>

      {/* Window-chrome frame around the visual */}
      <div
        className={`mt-6 overflow-hidden rounded-xl border bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ${
          inDrill ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          </span>
          <span className="ml-3 flex-1 rounded-md bg-white px-3 py-1 text-center text-xs text-gray-400 ring-1 ring-gray-200">
            {view.url}
          </span>
        </div>
        {/* Visual stage — fixed aspect so callout coordinates stay stable */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-white">
          <CalloutLayer callouts={view.callouts}>{view.visual}</CalloutLayer>
        </div>
      </div>

      {view.caption && (
        <p className="mt-2 text-center text-xs text-gray-400">{view.caption}</p>
      )}
    </div>
  );
}
