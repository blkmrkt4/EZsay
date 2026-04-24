"use client";

import { useState } from "react";
import MobileFullScreenEdit from "./MobileFullScreenEdit";

interface FlagInfo {
  id: string;
  flaggedPhrase: string;
  phraseStart: number;
  phraseEnd: number;
  explanation: string;
}

interface OptionInfo {
  id: string;
  text: string;
  note: string;
}

interface MobileEditViewProps {
  sectionText: string;
  flag: FlagInfo | null;
  options: OptionInfo[];
  currentFlagNum: number;
  totalFlags: number;
  onConfirm: (optionId: string) => void;
  onConfirmManual: (text: string) => void;
  onSkip: () => void;
  onRejectAll: () => void;
  onRescore: () => void;
}

export default function MobileEditView({
  sectionText,
  flag,
  options,
  currentFlagNum,
  totalFlags,
  onConfirm,
  onConfirmManual,
  onSkip,
  onRejectAll,
  onRescore,
}: MobileEditViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showFullScreenEdit, setShowFullScreenEdit] = useState(false);

  const editMyselfIndex = options.length;

  if (!flag) {
    return (
      <div className="flex h-screen flex-col items-center justify-center px-6">
        <p className="text-lg font-medium text-gray-900">All flags resolved</p>
        <p className="mt-2 text-sm text-gray-500">
          No more flags to review. You can re-evaluate to check your score.
        </p>
        <button
          onClick={onRescore}
          className="mt-6 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white"
        >
          Re-evaluate
        </button>
      </div>
    );
  }

  // Build highlighted original text
  const before = sectionText.slice(0, flag.phraseStart);
  const flagged = sectionText.slice(flag.phraseStart, flag.phraseEnd);
  const after = sectionText.slice(flag.phraseEnd);

  function handleConfirm() {
    if (selectedIndex === null) return;

    if (selectedIndex === editMyselfIndex) {
      setShowFullScreenEdit(true);
      return;
    }

    const option = options[selectedIndex];
    if (option) {
      onConfirm(option.id);
      setSelectedIndex(null);
    }
  }

  function handleFullScreenDone(text: string) {
    setShowFullScreenEdit(false);
    onConfirmManual(text);
    setSelectedIndex(null);
  }

  if (showFullScreenEdit) {
    return (
      <MobileFullScreenEdit
        sectionText={sectionText}
        flaggedPhrase={flag.flaggedPhrase}
        onDone={handleFullScreenDone}
        onCancel={() => setShowFullScreenEdit(false)}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Sticky header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-gray-700">
          Flag {currentFlagNum} of {totalFlags}
        </span>
        <button
          onClick={onRescore}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
        >
          Re-evaluate
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-4 pb-24 pt-4">
        {/* Original text block */}
        <div className="rounded-lg border-2 border-gray-300 bg-white p-4">
          <p className="text-base leading-relaxed text-gray-900">
            {before}
            <mark className="rounded bg-amber-200 px-0.5 underline decoration-amber-400">
              {flagged}
            </mark>
            {after}
          </p>
        </div>

        {/* Explanation */}
        <p className="mt-2 text-xs text-gray-500">{flag.explanation}</p>

        {/* Options */}
        <div className="mt-4 space-y-2">
          {options.map((option, i) => (
            <button
              key={option.id}
              onClick={() => setSelectedIndex(i)}
              className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
                selectedIndex === i
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    selectedIndex === i
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-gray-800">
                    {option.text}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{option.note}</p>
                </div>
              </div>
            </button>
          ))}

          {/* Edit myself option */}
          <button
            onClick={() => setSelectedIndex(editMyselfIndex)}
            className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
              selectedIndex === editMyselfIndex
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  selectedIndex === editMyselfIndex
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {editMyselfIndex + 1}
              </span>
              <p className="text-sm font-medium text-gray-700">
                Edit this paragraph myself
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-3">
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIndex === null}
            className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            onClick={onRejectAll}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600"
          >
            Reject
          </button>
        </div>
        <p className="mt-2 pb-1 text-center text-xs text-gray-400">
          {currentFlagNum} of {totalFlags} flags
        </p>
      </div>
    </div>
  );
}
