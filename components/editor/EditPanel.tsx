"use client";

import OriginalTextBlock from "./OriginalTextBlock";
import FlagOption from "./FlagOption";

interface FlagData {
  id: string;
  flaggedPhrase: string;
  phraseStart: number;
  phraseEnd: number;
  explanation: string;
}

interface OptionData {
  id: string;
  text: string;
  note: string;
}

interface EditPanelProps {
  sectionText: string;
  flag: FlagData | null;
  options: OptionData[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  currentFlagNum: number;
  totalFlags: number;
  docPanelOpen: boolean;
  onToggleDocPanel: () => void;
  isManualEditing: boolean;
  manualText: string;
  onManualTextChange: (text: string) => void;
}

/**
 * Panel 2 — Edit Panel. Always visible, primary panel.
 * Shows the user's original text prominently, then flag explanation,
 * then numbered replacement options.
 */
export default function EditPanel({
  sectionText,
  flag,
  options,
  selectedIndex,
  onSelect,
  currentFlagNum,
  totalFlags,
  docPanelOpen,
  onToggleDocPanel,
  isManualEditing,
  manualText,
  onManualTextChange,
}: EditPanelProps) {
  if (!flag) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">
          No flags to review. Your document looks good.
        </p>
      </div>
    );
  }

  // Build all options including "Edit myself" as last
  const allOptions = [
    ...options.map((o, i) => ({
      number: i + 1,
      text: o.text,
      note: o.note,
      isEditMyself: false,
    })),
    {
      number: options.length + 1,
      text: "",
      note: "",
      isEditMyself: true,
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <p className="text-sm font-medium text-gray-700">
          Flag {currentFlagNum} of {totalFlags}
        </p>
        <button
          onClick={onToggleDocPanel}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          {docPanelOpen ? "Hide document" : "Show document"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* User's original text — most prominent element */}
        <OriginalTextBlock
          text={sectionText}
          flaggedPhrase={flag.flaggedPhrase}
          phraseStart={flag.phraseStart}
          phraseEnd={flag.phraseEnd}
        />

        {/* Flag explanation — muted, subordinate */}
        <p className="text-xs text-gray-400">
          {flag.explanation}
        </p>

        {/* Numbered replacement options — secondary visual weight */}
        <div className="space-y-2">
          {allOptions.map((opt) => (
            <FlagOption
              key={opt.number}
              number={opt.number}
              text={opt.text}
              note={opt.note}
              isSelected={selectedIndex === opt.number - 1}
              isEditMyself={opt.isEditMyself}
              onSelect={() => onSelect(opt.number - 1)}
            />
          ))}
        </div>

        {/* Manual editing textarea — shown when "Edit myself" is active */}
        {isManualEditing && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 p-4">
            <label className="mb-2 block text-xs font-medium text-gray-600">
              Edit the paragraph below, then press Confirm to apply your changes
            </label>
            <textarea
              value={manualText}
              onChange={(e) => onManualTextChange(e.target.value)}
              rows={6}
              autoFocus
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
