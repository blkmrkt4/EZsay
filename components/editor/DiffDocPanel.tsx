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

interface DiffDocPanelProps {
  sections: Section[];
  changes: ResolvedChange[];
  activeChangeId: string | null;
  onChangeClick: (id: string) => void;
}

export default function DiffDocPanel({ sections, changes, activeChangeId, onChangeClick }: DiffDocPanelProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeChangeId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeChangeId]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-3">Original Document</p>
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
                {section.rawText}
              </p>
            );
          }

          // Build annotated text with highlighted original phrases
          const fragments: React.ReactNode[] = [];
          let cursor = 0;

          for (const change of sectionChanges) {
            // Text before this change
            if (change.phraseStart > cursor) {
              fragments.push(
                <span key={`pre-${change.id}`}>
                  {section.rawText.slice(cursor, change.phraseStart)}
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
                className={`relative cursor-pointer line-through decoration-red-400 ${
                  isActive
                    ? "bg-red-200 text-red-800 ring-2 ring-red-400 rounded"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {section.rawText.slice(change.phraseStart, change.phraseEnd)}
                <sup className="ml-0.5 text-[8px] font-bold text-red-500 no-underline">{change.changeNumber}</sup>
              </span>
            );

            cursor = change.phraseEnd;
          }

          // Remaining text after last change
          if (cursor < section.rawText.length) {
            fragments.push(
              <span key={`post-${section.id}`}>
                {section.rawText.slice(cursor)}
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
