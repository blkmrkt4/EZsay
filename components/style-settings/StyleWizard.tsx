"use client";

import { useState, useMemo, useCallback } from "react";
import { getDefinitionsForDocType, type PreferenceDefinition } from "@/lib/style-settings/definitions";
import { useStylePreferences } from "./useStylePreferences";
import WizardStep from "./WizardStep";

interface StyleWizardProps {
  documentType: string | null;
  onClose: () => void;
}

export default function StyleWizard({ documentType, onClose }: StyleWizardProps) {
  const { preferences, setPreference, save } = useStylePreferences(documentType);
  const [currentPage, setCurrentPage] = useState(0);

  // Group wizard-eligible definitions by wizardStep (each step = one page of up to 8 items)
  const pages = useMemo(() => {
    const defs = getDefinitionsForDocType(documentType)
      .filter((d) => d.wizardStep != null)
      .sort((a, b) => {
        const stepDiff = (a.wizardStep ?? 0) - (b.wizardStep ?? 0);
        if (stepDiff !== 0) return stepDiff;
        return (a.wizardPriority ?? 0) - (b.wizardPriority ?? 0);
      });

    // Group by wizardStep
    const grouped = new Map<number, PreferenceDefinition[]>();
    for (const d of defs) {
      const step = d.wizardStep!;
      const list = grouped.get(step) || [];
      list.push(d);
      grouped.set(step, list);
    }

    return Array.from(grouped.values());
  }, [documentType]);

  const totalPages = pages.length;
  const currentDefs = pages[currentPage] ?? [];
  const isLast = currentPage >= totalPages - 1;

  const PAGE_TITLES = [
    "Language & conventions",
    "Document formatting",
    "Voice & strictness",
  ];

  const handleNext = useCallback(async () => {
    if (isLast) {
      await save();
      await fetch("/api/style-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          preferences: {},
          wizardCompletedAt: new Date().toISOString(),
        }),
      });
      onClose();
    } else {
      setCurrentPage((p) => p + 1);
    }
  }, [isLast, save, documentType, onClose]);

  const handleBack = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1);
  }, [currentPage]);

  const handleSaveAndExit = useCallback(async () => {
    await save();
    onClose();
  }, [save, onClose]);

  if (currentDefs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Progress bar */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Page {currentPage + 1} of {totalPages}</span>
            <button
              onClick={handleSaveAndExit}
              className="text-gray-400 hover:text-gray-600"
            >
              Save and start writing
            </button>
          </div>
          <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
            <div
              className="h-1 rounded-full bg-blue-500 transition-all"
              style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
            />
          </div>
        </div>

        {/* Page title */}
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {PAGE_TITLES[currentPage] ?? `Page ${currentPage + 1}`}
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Set each preference below, or leave the defaults.
          </p>
        </div>

        {/* Questions grid */}
        <div className="max-h-[60vh] overflow-auto px-6 pb-4">
          <div className="space-y-3">
            {currentDefs.map((def) => (
              <WizardStep
                key={def.key}
                definition={def}
                value={preferences[def.key] ?? def.defaultValue}
                onChange={(val) => setPreference(def.key, val)}
              />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button
            onClick={handleBack}
            disabled={currentPage === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Back
          </button>

          <button
            onClick={handleNext}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={handleSaveAndExit}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
