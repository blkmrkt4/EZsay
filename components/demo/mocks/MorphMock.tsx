"use client";

/**
 * Mockup of the "Compare the options in context" stage (MorphStage):
 * the passage shown once, with each divergence point stacking all option
 * variants inline, numbered to match the Choices panel.
 */
function Variants({ items }: { items: string[] }) {
  return (
    <span className="mx-1 inline-flex flex-col gap-0.5 rounded-md border border-amber-200 bg-amber-50/60 p-1 align-text-bottom">
      {items.map((v, i) => (
        <span key={i} className="flex items-start gap-1.5 px-1 text-sm text-gray-700">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500">
            {i + 1}
          </span>
          <span>{v}</span>
        </span>
      ))}
    </span>
  );
}

export default function MorphMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-3 p-6 text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Compare the options in context
      </p>
      <div className="rounded-lg border border-gray-200 p-4 text-base leading-loose text-gray-800">
        <span className="text-gray-400">The new onboarding flow </span>
        <Variants items={["cut signup time in half.", "halved how long signup takes.", "made signups noticeably faster."]} />
        <span className="text-gray-400"> Within a month, </span>
        <Variants items={["activation climbed 18%.", "we saw activation rise 18%.", "18% more users activated."]} />
      </div>
      <p className="text-xs text-gray-500">
        Shared wording stays dimmed; only the words that actually differ between options are stacked — so you
        compare the real choice, not three near-identical paragraphs. Pick a whole option on the right; mix-and-match
        is intentionally off so paragraphs stay coherent.
      </p>
    </div>
  );
}
