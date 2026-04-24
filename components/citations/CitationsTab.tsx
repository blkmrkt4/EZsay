"use client";

import { useState, useEffect, useCallback } from "react";

interface Citation {
  id: string;
  rawText: string;
  style: string;
  structuralFlags: StructuralFlag[] | null;
  verificationFlags: unknown;
  status: "open" | "resolved" | "dismissed";
  userAction: string | null;
  correctedText: string | null;
}

interface StructuralFlag {
  type: string;
  message: string;
  severity: "error" | "warning";
}

const STYLES = [
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "chicago", label: "Chicago" },
  { value: "harvard", label: "Harvard" },
  { value: "oxford", label: "Oxford" },
  { value: "bluebook", label: "Bluebook" },
  { value: "oscola", label: "OSCOLA" },
  { value: "business", label: "Business" },
];

interface CitationsTabProps {
  documentId: string;
}

export default function CitationsTab({ documentId }: CitationsTabProps) {
  const [citationsList, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadCitations = useCallback(async () => {
    try {
      const res = await fetch(`/api/citations?documentId=${documentId}`);
      const json = await res.json();
      if (json.success) setCitations(json.data);
      else setError(json.error || "Failed to load citations.");
    } catch {
      setError("Could not connect to the server.");
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    loadCitations();
  }, [loadCitations]);

  async function runStructuralCheck() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "structural_check", documentId }),
      });
      const json = await res.json();
      if (json.success) {
        await loadCitations();
      } else {
        setError(json.error || "Structural check failed. Please try again.");
      }
    } catch {
      setError("Could not connect to the server.");
    }
    setChecking(false);
  }

  async function resolveCitation(
    citationId: string,
    userAction: "accepted" | "edited" | "verified" | "dismissed",
    correctedText?: string
  ) {
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          citationId,
          userAction,
          correctedText,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError("Failed to save citation change. Please try again.");
        return;
      }
      setCitations((prev) =>
        prev.map((c) =>
          c.id === citationId
            ? { ...c, status: userAction === "dismissed" ? "dismissed" : "resolved", userAction }
            : c
        )
      );
      setEditingId(null);
    } catch {
      setError("Could not connect to the server.");
    }
  }

  const total = citationsList.length;
  const flagged = citationsList.filter((c) => c.status === "open").length;
  const resolved = citationsList.filter((c) => c.status === "resolved").length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Citations</h2>
          <p className="mt-1 text-sm text-gray-500">
            {total > 0
              ? `${total} citations \u00B7 ${flagged} flagged \u00B7 ${resolved} resolved`
              : "Run a structural check to find citations."}
          </p>
        </div>
        <button
          onClick={runStructuralCheck}
          disabled={checking}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {checking ? "Checking..." : citationsList.length > 0 ? "Re-check" : "Run Structural Check"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Style reference */}
      <div className="mt-4 flex gap-2">
        {STYLES.map((s) => (
          <span
            key={s.value}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
          >
            {s.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-400">Loading...</div>
      ) : citationsList.length === 0 ? (
        <div className="mt-8 text-center text-sm text-gray-400">
          No citations found yet. Click &quot;Run Structural Check&quot; to scan.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {citationsList.map((citation) => {
            const structFlags = (citation.structuralFlags || []) as StructuralFlag[];
            const isEditing = editingId === citation.id;

            return (
              <div
                key={citation.id}
                className={`rounded-lg border p-4 ${
                  citation.status === "open"
                    ? "border-amber-200 bg-amber-50/50"
                    : citation.status === "dismissed"
                      ? "border-gray-200 bg-gray-50 opacity-60"
                      : "border-green-200 bg-green-50/50"
                }`}
              >
                {/* Citation text */}
                <p className="text-sm font-mono text-gray-800">
                  {citation.correctedText || citation.rawText}
                </p>

                {/* Style badge */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    {citation.style.toUpperCase()}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      citation.status === "open"
                        ? "bg-amber-100 text-amber-700"
                        : citation.status === "resolved"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {citation.status}
                  </span>
                  {citation.userAction && (
                    <span className="text-xs text-gray-400">
                      {citation.userAction}
                    </span>
                  )}
                </div>

                {/* Structural flags */}
                {structFlags.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {structFlags.map((flag, i) => (
                      <p
                        key={i}
                        className={`text-xs ${
                          flag.severity === "error"
                            ? "text-red-600"
                            : "text-amber-600"
                        }`}
                      >
                        {flag.severity === "error" ? "\u2716" : "\u26A0"}{" "}
                        {flag.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div className="mt-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="block w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() =>
                          resolveCitation(citation.id, "edited", editText)
                        }
                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                      >
                        Save correction
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions — only for open citations */}
                {citation.status === "open" && !isEditing && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => resolveCitation(citation.id, "accepted")}
                      className="rounded bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(citation.id);
                        setEditText(citation.rawText);
                      }}
                      className="rounded bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                    >
                      Edit manually
                    </button>
                    <button
                      onClick={() => resolveCitation(citation.id, "verified")}
                      className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      Mark as verified
                    </button>
                    <button
                      onClick={() => resolveCitation(citation.id, "dismissed")}
                      className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
