"use client";

import type { PreferenceDefinition } from "@/lib/style-settings/definitions";

interface SettingRowProps {
  definition: PreferenceDefinition;
  value: string | boolean | number;
  onChange: (value: string | boolean | number) => void;
}

export default function SettingRow({ definition, value, onChange }: SettingRowProps) {
  const { label, description, inputType, options } = definition;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <div className="shrink-0">
        {inputType === "boolean" && (
          <button
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        )}

        {inputType === "select" && options && (
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
            className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}

        {inputType === "text" && (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-48 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}
      </div>
    </div>
  );
}
