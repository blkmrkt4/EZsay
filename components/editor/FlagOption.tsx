"use client";

import { useState, useRef, useEffect } from "react";

interface FlagOptionProps {
  number: number;
  text: string;
  note: string;
  isSelected: boolean;
  isEditMyself?: boolean;
  onSelect: () => void;
  onRegenerate?: (direction: string) => void;
  isRegenerating?: boolean;
}

const NUDGE_DIRECTIONS = [
  { key: "more_casual", label: "More casual" },
  { key: "more_formal", label: "More formal" },
  { key: "closer_to_original", label: "Closer to original" },
  { key: "simpler", label: "Simpler" },
] as const;

/**
 * A single numbered option card. Visually subordinate to the original text.
 * Includes a regenerate button with directional nudge popover.
 */
export default function FlagOption({
  number,
  text,
  note,
  isSelected,
  isEditMyself,
  onSelect,
  onRegenerate,
  isRegenerating,
}: FlagOptionProps) {
  const [showNudges, setShowNudges] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showNudges) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowNudges(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNudges]);

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        disabled={isRegenerating}
        className={`w-full rounded-lg border p-3 text-left transition-colors ${
          isRegenerating
            ? "border-gray-200 bg-gray-50 opacity-60"
            : isSelected
              ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
              : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {number}
          </span>
          <div className="min-w-0 flex-1">
            {isEditMyself ? (
              <p className="text-sm font-medium text-gray-700">
                Edit this paragraph myself in the document
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
                {isRegenerating ? (
                  <p className="mt-1 text-xs text-blue-500">Regenerating...</p>
                ) : (
                  note && <p className="mt-1 text-xs text-gray-400">{note}</p>
                )}
              </>
            )}
          </div>
        </div>
      </button>

      {/* Regenerate button — hover-visible, not shown for "Edit myself" or while regenerating */}
      {!isEditMyself && onRegenerate && !isRegenerating && (
        <div className="absolute right-2 top-2" ref={popoverRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNudges(!showNudges);
            }}
            className="rounded-md p-1 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100"
            title="Try a different version"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
          </button>

          {/* Nudge direction popover */}
          {showNudges && (
            <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              <p className="mb-1.5 px-1 text-xs font-medium text-gray-500">
                Try a different angle
              </p>
              {NUDGE_DIRECTIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNudges(false);
                    onRegenerate(d.key);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spinner overlay when regenerating */}
      {isRegenerating && (
        <div className="absolute right-3 top-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}
