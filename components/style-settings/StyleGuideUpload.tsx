"use client";

import { useState, useRef } from "react";
import { PREFERENCE_DEFINITIONS } from "@/lib/style-settings/definitions";

interface StyleGuideUploadProps {
  documentType: string | null;
  onParsed: () => void;
}

export default function StyleGuideUpload({ documentType, onParsed }: StyleGuideUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    parsed: Record<string, unknown>;
    count: number;
    fileName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (documentType) formData.append("documentType", documentType);

    try {
      const res = await fetch("/api/style-preferences/parse-guide", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (json.success) {
        setResult(json.data);
        if (json.data.count > 0) onParsed();
      } else {
        setError(json.error || "Upload failed");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function getLabelForKey(key: string): string {
    return PREFERENCE_DEFINITIONS.find((d) => d.key === key)?.label ?? key;
  }

  function formatValue(value: unknown): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
      // Try to find the option label
      for (const def of PREFERENCE_DEFINITIONS) {
        if (def.options) {
          const opt = def.options.find((o) => o.value === value);
          if (opt) return opt.label;
        }
      }
      return value;
    }
    return String(value);
  }

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Style Guide
        </h3>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-gray-400">
            Upload your institution's or organisation's style guide. We'll extract formatting rules and apply them to your settings.
          </p>

          {/* Upload area */}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
              uploading
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
            }`}
          >
            {uploading ? (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
                <p className="mt-2 text-xs text-blue-600">Analysing style guide...</p>
              </>
            ) : (
              <>
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-1.5 text-xs text-gray-500">
                  Drop a PDF, DOCX, or TXT file here, or click to browse
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">Max 5 MB</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />

          {/* Error */}
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <p className="text-xs font-medium text-green-700">
                  {result.count > 0
                    ? `Found ${result.count} rule${result.count !== 1 ? "s" : ""} in "${result.fileName}"`
                    : `No matching rules found in "${result.fileName}"`}
                </p>
              </div>

              {result.count > 0 && (
                <div className="mt-2 space-y-1">
                  {Object.entries(result.parsed).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-600">{getLabelForKey(key)}</span>
                      <span className="font-medium text-green-700">{formatValue(value)}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-[10px] text-gray-400">
                    These settings have been applied. You can review and change them above.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
