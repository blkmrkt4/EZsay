"use client";

/** Mockup of the Review Edit Choices tab: before/after diff of your changes. */
export default function ReviewMock() {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4 p-6 text-left">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Review your edits</h3>
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
          11 of 14 resolved
        </span>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 text-sm leading-relaxed">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Section 1</p>
        <p className="text-gray-800">
          In today&apos;s{" "}
          <span className="rounded bg-red-50 px-0.5 text-red-500 line-through decoration-red-400">
            fast-paced business landscape, it is important to note that
          </span>{" "}
          <span className="rounded bg-green-100 px-0.5 text-green-800">
            our team learned that
          </span>{" "}
          leveraging synergies{" "}
          <span className="rounded bg-red-50 px-0.5 text-red-500 line-through decoration-red-400">
            will unlock transformative value for all stakeholders
          </span>{" "}
          <span className="rounded bg-green-100 px-0.5 text-green-800">
            cut handoff delays by a week
          </span>
          .
        </p>
      </div>

      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="h-3 w-3 rounded bg-red-50 ring-1 ring-red-200" /> Removed
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="h-3 w-3 rounded bg-green-100 ring-1 ring-green-300" /> Your replacement
        </span>
      </div>

      <p className="text-xs text-gray-500">
        Every change side-by-side before you commit. Nothing is altered without a choice you made.
      </p>
    </div>
  );
}
