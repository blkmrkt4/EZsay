"use client";

interface Section {
  id: string;
  index: number;
  currentText: string;
  isLocked: boolean;
  flagCount: number;
  flagsResolved: number;
}

interface DocPanelProps {
  sections: Section[];
  activeSectionIndex: number;
  completedSections: Set<number>;
  onSectionClick: (index: number) => void;
}

/**
 * Panel 1 — Doc Panel. Full essay text, scrollable.
 * Active section highlighted green. Completed sections faded.
 */
export default function DocPanel({
  sections,
  activeSectionIndex,
  completedSections,
  onSectionClick,
}: DocPanelProps) {
  return (
    <div className="h-full overflow-auto p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Full Document
      </h3>
      <div className="space-y-1">
        {sections.map((section) => {
          const isActive = section.index === activeSectionIndex;
          const isCompleted = completedSections.has(section.index);
          const isLocked = section.isLocked;

          return (
            <div
              key={section.id}
              onClick={() => {
                if (!isLocked) onSectionClick(section.index);
              }}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm leading-relaxed transition-colors ${
                isLocked
                  ? "cursor-default bg-gray-50 text-gray-400"
                  : isActive
                    ? "bg-green-100 text-gray-900 ring-1 ring-green-300"
                    : isCompleted
                      ? "bg-gray-50 text-gray-400"
                      : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {isLocked && (
                <span className="text-xs text-gray-400">[Citations] </span>
              )}
              {section.currentText}
            </div>
          );
        })}
      </div>
    </div>
  );
}
