"use client";

import { useRef, useEffect } from "react";

interface ResolvedChange {
  id: string;
  sectionId: string;
  sectionIndex: number;
  originalPhrase: string;
  replacementText: string;
  explanation: string;
  patternType: string;
  phraseStart: number;
  phraseEnd: number;
  changeNumber: number;
}

const PATTERN_COLORS: Record<string, string> = {
  banned_word: "bg-amber-100 text-amber-700",
  banned_structure: "bg-orange-100 text-orange-700",
  synonym_rotation: "bg-purple-100 text-purple-700",
  uniform_length: "bg-blue-100 text-blue-700",
  uniform_density: "bg-blue-100 text-blue-700",
  transition_pattern: "bg-yellow-100 text-yellow-700",
};

interface DiffChoicesPanelProps {
  changes: ResolvedChange[];
  totalFlags: number;
  acceptedCount: number;
  rejectedCount: number;
  skippedCount: number;
  currentScore: number | null;
  initialScore: number | null;
  activeChangeId: string | null;
  onChangeClick: (id: string) => void;
}

export default function DiffChoicesPanel({
  changes,
  totalFlags,
  acceptedCount,
  rejectedCount,
  skippedCount,
  currentScore,
  initialScore,
  activeChangeId,
  onChangeClick,
}: DiffChoicesPanelProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeChangeId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeChangeId]);

  const hasScoreDelta = currentScore != null && initialScore != null;
  const scoreDelta = hasScoreDelta ? currentScore - initialScore : null;

  return (
    <div className="flex h-full flex-col">
      {/* Stats summary */}
      <div className="border-b border-gray-200 px-3 py-3 space-y-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Summary</p>

        {hasScoreDelta && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Score:</span>
            <span className="text-xs text-red-500">{initialScore}</span>
            <span className="text-xs text-gray-400">&rarr;</span>
            <span className={`text-xs font-bold ${currentScore! >= 70 ? "text-green-600" : currentScore! >= 40 ? "text-yellow-600" : "text-red-600"}`}>
              {currentScore}
            </span>
            {scoreDelta !== null && scoreDelta !== 0 && (
              <span className={`text-[10px] font-medium ${scoreDelta > 0 ? "text-green-600" : "text-red-600"}`}>
                ({scoreDelta > 0 ? "+" : ""}{scoreDelta})
              </span>
            )}
          </div>
        )}

        <div className="flex gap-3 text-[10px]">
          <span className="text-green-600">{acceptedCount} accepted</span>
          <span className="text-gray-400">{skippedCount} skipped</span>
          <span className="text-red-500">{rejectedCount} rejected</span>
        </div>

        <p className="text-[10px] text-gray-400">{totalFlags} flags total, {changes.length} changes applied</p>
      </div>

      {/* Change list */}
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {changes.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-gray-400 text-center">No changes made yet.</p>
          </div>
        )}

        {changes.map((change) => {
          const isActive = activeChangeId === change.id;
          return (
            <button
              key={change.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onChangeClick(change.id)}
              className={`w-full rounded-lg p-2.5 text-left transition-all ${
                isActive
                  ? "border-2 border-blue-500 bg-blue-50 shadow-sm"
                  : "border border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">
                  {change.changeNumber}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${PATTERN_COLORS[change.patternType] ?? "bg-gray-100 text-gray-600"}`}>
                  {change.patternType.replace(/_/g, " ")}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-red-500 line-through leading-snug">
                  {change.originalPhrase}
                </p>
                <p className="text-[11px] text-green-700 font-medium leading-snug">
                  {change.replacementText}
                </p>
              </div>

              {change.explanation && (
                <p className="mt-1.5 text-[9px] text-gray-400 leading-snug">
                  {change.explanation}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
