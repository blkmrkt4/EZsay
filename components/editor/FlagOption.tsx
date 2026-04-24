"use client";

interface FlagOptionProps {
  number: number;
  text: string;
  note: string;
  isSelected: boolean;
  isEditMyself?: boolean;
  onSelect: () => void;
}

/**
 * A single numbered option card. Visually subordinate to the original text.
 */
export default function FlagOption({
  number,
  text,
  note,
  isSelected,
  isEditMyself,
  onSelect,
}: FlagOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
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
              <p className="mt-1 text-xs text-gray-400">{note}</p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
