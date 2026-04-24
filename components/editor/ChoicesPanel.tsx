"use client";

interface Choice {
  number: number;
  label: string;
  isEditMyself?: boolean;
}

interface ChoicesPanelProps {
  choices: Choice[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onRejectAll: () => void;
  currentFlag: number;
  totalFlags: number;
  isManualEditing?: boolean;
}

/**
 * Panel 3 — Choices Panel. Always visible, fixed width on the right.
 * Compact numbered buttons that stay in sync with the Edit Panel.
 */
export default function ChoicesPanel({
  choices,
  selectedIndex,
  onSelect,
  onConfirm,
  onSkip,
  onRejectAll,
  currentFlag,
  totalFlags,
  isManualEditing,
}: ChoicesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700">Your choice</h3>
        <p className="mt-1 text-xs text-gray-500">
          Which version would you like to use?
        </p>
      </div>

      {/* Choice buttons */}
      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {choices.map((choice) => (
          <button
            key={choice.number}
            onClick={() => onSelect(choice.number - 1)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selectedIndex === choice.number - 1
                ? "bg-blue-600 text-white"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                selectedIndex === choice.number - 1
                  ? "bg-white text-blue-600"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {choice.number}
            </span>
            <span className="truncate">
              {choice.isEditMyself ? "Edit myself" : `Option ${choice.number}`}
            </span>
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-200 p-3 space-y-2">
        <button
          onClick={onConfirm}
          disabled={selectedIndex === null}
          className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {isManualEditing ? "Save edit" : "Confirm"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 rounded-md border border-gray-300 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            onClick={onRejectAll}
            className="flex-1 rounded-md border border-gray-300 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Reject all
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-2">
        <p className="text-xs text-gray-400 text-center">
          {currentFlag} of {totalFlags} flags
        </p>
        <p className="mt-1 text-xs text-gray-300 text-center">
          1-{choices.length} select &middot; Enter confirm &middot; S skip &middot; R reject
        </p>
      </div>
    </div>
  );
}
