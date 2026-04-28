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

interface Section {
  id: string;
  index: number;
  rawText: string;
  currentText: string;
  isLocked: boolean;
}

interface DiffEditPanelProps {
  sections: Section[];
  changes: ResolvedChange[];
  activeChangeId: string | null;
  onChangeClick: (id: string) => void;
}

/**
 * Finds replacement positions within currentText by searching for each
 * replacement string in document order. Handles position drift from
 * earlier replacements changing string lengths.
 */
function findReplacementPositions(
  currentText: string,
  sectionChanges: ResolvedChange[],
): { change: ResolvedChange; start: number; end: number }[] {
  const positions: { change: ResolvedChange; start: number; end: number }[] = [];
  let searchFrom = 0;

  for (const change of sectionChanges) {
    const idx = currentText.indexOf(change.replacementText, searchFrom);
    if (idx >= 0) {
      positions.push({ change, start: idx, end: idx + change.replacementText.length });
      searchFrom = idx + change.replacementText.length;
    }
  }

  return positions;
}

export default function DiffEditPanel({ sections, changes, activeChangeId, onChangeClick }: DiffEditPanelProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeChangeId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeChangeId]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-3">Edited Document</p>
      <div className="space-y-3">
        {sections.map((section) => {
          if (section.isLocked) {
            return (
              <div key={section.id} className="text-xs text-gray-400 italic">
                [Citations — locked]
              </div>
            );
          }

          const sectionChanges = changes
            .filter((c) => c.sectionId === section.id)
            .sort((a, b) => a.phraseStart - b.phraseStart);

          if (sectionChanges.length === 0) {
            return (
              <p key={section.id} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {section.currentText}
              </p>
            );
          }

          const positions = findReplacementPositions(section.currentText, sectionChanges);

          if (positions.length === 0) {
            return (
              <p key={section.id} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {section.currentText}
              </p>
            );
          }

          const fragments: React.ReactNode[] = [];
          let cursor = 0;

          for (const { change, start, end } of positions) {
            if (start > cursor) {
              fragments.push(
                <span key={`pre-${change.id}`}>
                  {section.currentText.slice(cursor, start)}
                </span>
              );
            }

            const isActive = activeChangeId === change.id;
            fragments.push(
              <span
                key={change.id}
                ref={isActive ? activeRef : undefined}
                data-change-id={change.id}
                onClick={() => onChangeClick(change.id)}
                className={`relative cursor-pointer ${
                  isActive
                    ? "bg-green-200 text-green-900 ring-2 ring-green-400 rounded font-medium"
                    : "bg-green-100 text-green-800 font-medium"
                }`}
              >
                {section.currentText.slice(start, end)}
                <sup className="ml-0.5 text-[8px] font-bold text-green-600">{change.changeNumber}</sup>
              </span>
            );

            cursor = end;
          }

          if (cursor < section.currentText.length) {
            fragments.push(
              <span key={`post-${section.id}`}>
                {section.currentText.slice(cursor)}
              </span>
            );
          }

          return (
            <p key={section.id} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {fragments}
            </p>
          );
        })}
      </div>
    </div>
  );
}
