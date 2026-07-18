"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import EditingShell from "@/components/editor/EditingShell";
import CitationsTab from "@/components/citations/CitationsTab";

interface Section {
  id: string;
  index: number;
  currentText: string;
  isLocked: boolean;
  flagCount: number;
  flagsResolved: number;
}

interface Flag {
  id: string;
  sectionId: string;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
  explanation: string;
  patternType: string;
  status: string;
}

interface FlagOption {
  id: string;
  flagId: string;
  text: string;
  isBlend: boolean;
}

export default function EditPage() {
  const params = useParams();
  const docId = params.docId as string;
  const router = useRouter();

  const [sections, setSections] = useState<Section[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagOptions, setFlagOptions] = useState<FlagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editing" | "citations">("editing");

  const loadData = useCallback(async () => {
    let json;
    try {
      const res = await fetch(`/api/documents/${docId}`);
      json = await res.json();
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
      return;
    }
    if (!json.success) {
      setError(json.error || "Failed to load document.");
      return;
    }

    setSections(json.data.sections);
    setFlags(json.data.flags);

    // Load flag options if they exist
    if (json.data.flagOptions) {
      setFlagOptions(json.data.flagOptions);
    }

    // Generate options for open flags that don't have options yet
    const openFlags = json.data.flags.filter(
      (f: Flag) => f.status === "open"
    );
    const existingOptionFlagIds = new Set(
      (json.data.flagOptions || []).map((o: FlagOption) => o.flagId)
    );
    const needOptions = openFlags.filter(
      (f: Flag) => !existingOptionFlagIds.has(f.id)
    );

    if (needOptions.length > 0) {
      // Request options for the first few flags
      const batch = needOptions.slice(0, 5);
      let failCount = 0;
      for (const flag of batch) {
        try {
          const optRes = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              flagId: flag.id,
              documentId: docId,
            }),
          });
          const optJson = await optRes.json();
          if (optJson.success && optJson.data?.options) {
            setFlagOptions((prev) => [...prev, ...optJson.data.options]);
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }
      if (failCount > 0) {
        setSuggestError(
          `Failed to generate suggestions for ${failCount} flag${failCount > 1 ? "s" : ""}. You can skip these or try re-loading.`
        );
      }
    }

    setLoading(false);
  }, [docId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleFlagResolved(
    flagId: string,
    action: "accepted" | "rejected" | "skipped",
    optionId?: string,
    manualText?: string
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/flags/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, action, optionId, manualText }),
      });
      const json = await res.json();
      if (!json.success) return false;

      // Update local state only after confirmed
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, status: action } : f))
      );
      // An accept rewrites the whole section server-side and auto-skips its
      // other open flags — reload so the displayed text and sibling flag
      // statuses aren't stale (the server refuses re-resolves either way).
      if (action === "accepted") await loadData();
      return true;
    } catch {
      return false;
    }
  }

  function handleOptionRegenerated(
    oldOptionId: string,
    newOption: FlagOption,
  ) {
    setFlagOptions((prev) =>
      prev.map((o) => (o.id === oldOptionId ? newOption : o)),
    );
  }

  async function handleRescore() {
    try {
      const res = await fetch("/api/rescore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (json.success) {
        await loadData();
      } else {
        setError(json.error || "Re-evaluation failed. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-500">Loading editor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                loadData();
              }}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Try again
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:underline"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white px-6">
        <button
          onClick={() => setActiveTab("editing")}
          className={`px-4 py-3 text-sm font-medium ${
            activeTab === "editing"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Editing
        </button>
        <button
          onClick={() => setActiveTab("citations")}
          className={`px-4 py-3 text-sm font-medium ${
            activeTab === "citations"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Citations
        </button>
      </div>

      {/* Suggest error banner */}
      {suggestError && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2">
          <p className="text-sm text-amber-700">{suggestError}</p>
          <button
            onClick={() => {
              setSuggestError(null);
              loadData();
            }}
            className="ml-4 shrink-0 rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "citations" ? (
          <CitationsTab documentId={docId} />
        ) : (
    <EditingShell
      documentId={docId}
      sections={sections}
      flags={flags}
      flagOptions={flagOptions}
      onFlagResolved={handleFlagResolved}
      onRescore={handleRescore}
      onOptionRegenerated={handleOptionRegenerated}
    />
        )}
      </div>
    </div>
  );
}
