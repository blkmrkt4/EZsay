"use client";

import { useRef, useEffect, useState } from "react";

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
  tone_inconsistency: "bg-rose-100 text-rose-700",
};

const PATTERN_LABELS: Record<string, string> = {
  banned_word: "AI Phrase",
  banned_structure: "Structure",
  synonym_rotation: "Synonym Rotation",
  uniform_length: "Uniform Length",
  uniform_density: "Density",
  transition_pattern: "Transition",
  tone_inconsistency: "Tone Shift",
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className="border-b border-gray-200 px-3 py-2.5 space-y-1.5">
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
      </div>

      {/* Compact change list */}
      <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
        {changes.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-gray-400 text-center">No changes made yet.</p>
          </div>
        )}

        {changes.map((change) => {
          const isActive = activeChangeId === change.id;
          const isExpanded = expandedId === change.id;
          return (
            <div key={change.id}>
              <button
                ref={isActive ? activeRef : undefined}
                onClick={() => {
                  onChangeClick(change.id);
                  setExpandedId(isExpanded ? null : change.id);
                }}
                className={`w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left transition-all ${
                  isActive
                    ? "bg-blue-50 border border-blue-400"
                    : "border border-transparent hover:bg-gray-50"
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[8px] font-bold text-gray-600">
                  {change.changeNumber}
                </span>
                <span className={`rounded px-1 py-0.5 text-[8px] font-medium ${PATTERN_COLORS[change.patternType] ?? "bg-gray-100 text-gray-600"}`}>
                  {PATTERN_LABELS[change.patternType] ?? change.patternType.replace(/_/g, " ")}
                </span>
                <svg className={`ml-auto h-3 w-3 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </button>

              {isExpanded && (
                <div className="ml-6 mr-1 mb-1 rounded border border-gray-200 bg-white p-2 space-y-1">
                  <p className="text-[10px] text-red-500 line-through leading-snug">{change.originalPhrase}</p>
                  <p className="text-[10px] text-green-700 font-medium leading-snug">{change.replacementText}</p>
                  {change.explanation && (
                    <p className="text-[9px] text-gray-400 leading-snug">{change.explanation}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
