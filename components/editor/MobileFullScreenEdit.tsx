"use client";

import { useState } from "react";

interface MobileFullScreenEditProps {
  sectionText: string;
  flaggedPhrase: string;
  onDone: (text: string) => void;
  onCancel: () => void;
}

export default function MobileFullScreenEdit({
  sectionText,
  flaggedPhrase,
  onDone,
  onCancel,
}: MobileFullScreenEditProps) {
  const [text, setText] = useState(sectionText);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <button
          onClick={onCancel}
          className="text-sm font-medium text-gray-500"
        >
          Cancel
        </button>
        <span className="text-sm font-medium text-gray-900">
          Edit paragraph
        </span>
        <button
          onClick={() => onDone(text)}
          className="text-sm font-medium text-blue-600"
        >
          Done
        </button>
      </div>

      {/* Hint */}
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
        <p className="text-xs text-gray-500">
          Flagged phrase:{" "}
          <span className="font-medium text-amber-700">{flaggedPhrase}</span>
        </p>
      </div>

      {/* Editable text */}
      <div className="flex-1 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-full w-full resize-none border-0 text-base leading-relaxed text-gray-900 focus:outline-none focus:ring-0"
          autoFocus
        />
      </div>
    </div>
  );
}
