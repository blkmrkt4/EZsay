"use client";

import { useState } from "react";
import { type Citation, bucketOf } from "./types";

/**
 * The corrected reference list — copy-paste ready.
 *
 * Assembled ONLY from fixes the user has explicitly accepted or edited
 * (constraint #3: no silent corrections). Untouched entries appear as
 * they are in the document; entries with unaccepted suggestions keep
 * their original text and are counted in the pending note.
 */

function finalTextOf(c: Citation): string {
  const fixApplied =
    c.status !== "open" &&
    (c.userAction === "accepted" || c.userAction === "edited") &&
    c.correctedText;
  return (fixApplied ? c.correctedText : c.rawText) as string;
}

export default function CorrectedList({ entries }: { entries: Citation[] }) {
  const [copied, setCopied] = useState(false);

  if (entries.length === 0) return null;

  const pendingCount = entries.filter(
    (c) => c.status === "open" && (bucketOf(c) === "fabricated" || bucketOf(c) === "needs_correction"),
  ).length;

  const listText = entries.map(finalTextOf).join("\n\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(listText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/http) — leave the text selectable.
    }
  }

  return (
    <details className="rounded-lg border border-gray-200 overflow-hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Corrected Reference List</h3>
          {pendingCount > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
              {pendingCount} unresolved
            </span>
          )}
        </div>
        <span className="text-[9px] text-gray-400">Copy-paste ready</span>
      </summary>
      <div className="space-y-3 border-t border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-gray-400">
            Reflects only the fixes you have accepted.
            {pendingCount > 0 &&
              ` ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} still ${pendingCount === 1 ? "has" : "have"} unresolved issues and appear${pendingCount === 1 ? "s" : ""} unchanged below.`}
          </p>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded bg-gray-900 px-3 py-1 text-[10px] font-medium text-white hover:bg-gray-700"
          >
            {copied ? "Copied ✓" : "Copy list"}
          </button>
        </div>
        <div className="max-h-80 space-y-2.5 overflow-auto rounded border border-gray-200 bg-white p-3">
          {entries.map((c) => {
            const text = finalTextOf(c);
            const changed = text !== c.rawText;
            const unresolved = c.status === "open" && (bucketOf(c) === "fabricated" || bucketOf(c) === "needs_correction");
            return (
              <p key={c.id} className="text-[11px] font-mono leading-relaxed text-gray-800">
                {text}
                {changed && <span className="ml-1.5 rounded bg-green-100 px-1 py-0.5 text-[8px] font-sans font-semibold text-green-700">fixed</span>}
                {unresolved && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-sans font-semibold text-amber-700">unresolved</span>}
              </p>
            );
          })}
        </div>
      </div>
    </details>
  );
}
