"use client";

import { useState } from "react";
import type { PreferenceDefinition } from "@/lib/style-settings/definitions";
import SettingRow from "./SettingRow";

interface SettingsCategoryProps {
  label: string;
  definitions: PreferenceDefinition[];
  preferences: Record<string, string | boolean | number>;
  onPreferenceChange: (key: string, value: string | boolean | number) => void;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

export default function SettingsCategory({
  label,
  definitions,
  preferences,
  onPreferenceChange,
  defaultOpen = true,
  forceOpen = false,
}: SettingsCategoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isOpen = forceOpen || open;

  const basicDefs = definitions.filter((d) => !d.advanced);
  const advancedDefs = definitions.filter((d) => d.advanced);

  if (definitions.length === 0) return null;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => !forceOpen && setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </h3>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="space-y-1 px-4 pb-4">
          {/* Basic settings — always visible */}
          {basicDefs.map((def) => (
            <SettingRow
              key={def.key}
              definition={def}
              value={preferences[def.key] ?? def.defaultValue}
              onChange={(val) => onPreferenceChange(def.key, val)}
            />
          ))}

          {/* Advanced toggle + settings */}
          {advancedDefs.length > 0 && (
            <>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-blue-600 hover:bg-blue-50"
              >
                <svg
                  className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                {showAdvanced ? "Hide advanced options" : `Advanced options (${advancedDefs.length})`}
              </button>

              {showAdvanced && (
                <div className="ml-2 space-y-1 border-l-2 border-blue-100 pl-3 pt-1">
                  {advancedDefs.map((def) => (
                    <SettingRow
                      key={def.key}
                      definition={def}
                      value={preferences[def.key] ?? def.defaultValue}
                      onChange={(val) => onPreferenceChange(def.key, val)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
