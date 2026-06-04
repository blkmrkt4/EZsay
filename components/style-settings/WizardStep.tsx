"use client";

import type { PreferenceDefinition } from "@/lib/style-settings/definitions";

interface WizardStepProps {
  definition: PreferenceDefinition;
  value: string | boolean | number;
  onChange: (value: string | boolean | number) => void;
}

/**
 * A single question row within a wizard page.
 * Compact layout: label + description on the left, input on the right.
 */
export default function WizardStep({ definition, value, onChange }: WizardStepProps) {
  const { label, description, inputType, options } = definition;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        {inputType === "boolean" && (
          <div className="flex gap-1.5">
            <button
              onClick={() => onChange(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                value === true
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => onChange(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                value === false
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
              }`}
            >
              No
            </button>
          </div>
        )}

        {inputType === "select" && options && (
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {inputType === "number" && (
          <input
            type="number"
            value={Number(value) || 0}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
            min={0}
            className="w-24 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}

        {inputType === "text" && (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-48 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}
      </div>
    </div>
  );
}
