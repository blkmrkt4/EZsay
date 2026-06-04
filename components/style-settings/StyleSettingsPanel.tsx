"use client";

import { useState, useMemo } from "react";
import {
  PREFERENCE_CATEGORIES,
  getDefinitionsForDocType,
} from "@/lib/style-settings/definitions";
import { useStylePreferences } from "./useStylePreferences";
import SettingsCategory from "./SettingsCategory";
import ArtifactOverrides from "./ArtifactOverrides";
import StyleGuideUpload from "./StyleGuideUpload";
import StyleWizard from "./StyleWizard";

interface StyleSettingsPanelProps {
  documentType?: string | null;
}

export default function StyleSettingsPanel({ documentType }: StyleSettingsPanelProps) {
  const docType = documentType ?? null;
  const { preferences, setPreference, loading, saving, reload } = useStylePreferences(docType);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  const filteredDefs = useMemo(() => {
    const all = getDefinitionsForDocType(docType);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.key.toLowerCase().includes(q),
    );
  }, [docType, search]);

  const isSearching = search.trim().length > 0;

  // Group filtered definitions by category
  const visibleCategories = useMemo(() => {
    return PREFERENCE_CATEGORIES.filter((cat) => {
      if (cat.documentTypes.includes("all")) return true;
      return docType && cat.documentTypes.includes(docType);
    }).map((cat) => ({
      ...cat,
      definitions: filteredDefs.filter((d) => d.category === cat.key),
    }));
  }, [filteredDefs, docType]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
          <p className="mt-3 text-xs text-gray-400">Loading preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showWizard && (
        <StyleWizard
          documentType={docType}
          onClose={() => setShowWizard(false)}
        />
      )}

      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Style Rules</h2>
            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-[10px] text-gray-400">Saving...</span>
              )}
              <button
                onClick={() => setShowWizard(true)}
                className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100"
              >
                Quick setup wizard
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Set your document's style rules. These preferences guide scanning and suggestions.
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 px-4 py-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings..."
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-auto">
          {visibleCategories.map((cat) => (
            <SettingsCategory
              key={cat.key}
              label={cat.label}
              definitions={cat.definitions}
              preferences={preferences}
              onPreferenceChange={setPreference}
              forceOpen={isSearching}
            />
          ))}

          {/* AI Artifact Handling — always visible */}
          <ArtifactOverrides />

          {/* Style Guide upload */}
          <StyleGuideUpload
            documentType={docType}
            onParsed={reload}
          />

          {/* Empty search state */}
          {isSearching && filteredDefs.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400">
                No settings match &ldquo;{search}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
