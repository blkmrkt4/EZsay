"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PaywallModal from "@/components/ui/PaywallModal";
import { useSubscription, isActive } from "@/lib/hooks/useSubscription";

interface Section {
  id: string;
  index: number;
  rawText: string;
  currentText: string;
  aiSignalLevel: "high" | "medium" | "low" | "none";
  flagCount: number;
  flagsResolved: number;
  isLocked: boolean;
}

interface DocumentData {
  id: string;
  title: string;
  documentType: string;
  status: string;
  aiRiskScore: number | null;
}

interface FlagData {
  id: string;
  sectionId: string;
  flaggedPhrase: string;
  explanation: string;
  patternType: string;
  status: string;
}

const SIGNAL_COLORS: Record<string, string> = {
  high: "border-l-amber-500 bg-amber-50",
  medium: "border-l-yellow-400 bg-yellow-50",
  low: "border-l-blue-300 bg-blue-50",
  none: "border-l-gray-200 bg-white",
};

const SIGNAL_BADGE: Record<string, string> = {
  high: "bg-amber-100 text-amber-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
  none: "bg-gray-100 text-gray-500",
};

export default function ResultsPage() {
  const subscription = useSubscription();
  const params = useParams();
  const docId = params.docId as string;
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [sectionsList, setSections] = useState<Section[]>([]);
  const [flagsList, setFlags] = useState<FlagData[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const loadDocument = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const json = await res.json();
      if (json.success) {
        setDoc(json.data.document);
        setSections(json.data.sections);
        setFlags(json.data.flags);
      } else {
        setError(json.error || "Failed to load document.");
      }
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    }
  }, [docId]);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (json.success) {
        await loadDocument();
      } else {
        setError(json.error || "Scan failed. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    }
    setScanning(false);
  }, [docId, loadDocument]);

  useEffect(() => {
    loadDocument().then(() => {
      // Auto-trigger scan if document is just uploaded
    });
  }, [loadDocument]);

  // Auto-scan on first load if status is "uploaded"
  useEffect(() => {
    if (doc?.status === "uploaded" && !scanning) {
      triggerScan();
    }
  }, [doc?.status, scanning, triggerScan]);

  function handleEditClick() {
    if (subscription.loading) return;
    if (isActive(subscription.status)) {
      router.push(`/edit/${docId}`);
    } else {
      setShowPaywall(true);
    }
  }

  const scoreColor =
    doc?.aiRiskScore != null
      ? doc.aiRiskScore >= 70
        ? "text-red-600"
        : doc.aiRiskScore >= 40
          ? "text-amber-500"
          : "text-green-600"
      : "text-gray-300";

  const totalFlags = flagsList.length;
  const unlockedSections = sectionsList.filter((s) => !s.isLocked);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
        <div>
          <h1 className="text-2xl font-bold">{doc?.title ?? "Loading..."}</h1>
          {doc && (
            <p className="mt-1 text-sm text-gray-500">
              {doc.documentType} document
              {unlockedSections.length > 0 &&
                ` \u00B7 ${unlockedSections.length} sections`}
              {totalFlags > 0 && ` \u00B7 ${totalFlags} flags`}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            AI Risk Score
          </p>
          {scanning ? (
            <div className="mt-1">
              <div className="h-10 w-16 animate-pulse rounded bg-gray-200" />
              <p className="mt-1 text-xs text-gray-400">Scanning...</p>
            </div>
          ) : (
            <p className={`text-3xl font-bold sm:text-5xl ${scoreColor}`}>
              {doc?.aiRiskScore ?? "--"}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => {
              setError(null);
              if (doc?.status === "uploaded") triggerScan();
              else loadDocument();
            }}
            className="ml-4 shrink-0 rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Score interpretation */}
      {doc?.aiRiskScore != null && !scanning && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            {doc.aiRiskScore >= 70
              ? "This document contains several patterns commonly associated with AI-assisted writing across most sections."
              : doc.aiRiskScore >= 40
                ? "Some sections contain phrases and structures that detection tools may flag."
                : doc.aiRiskScore >= 15
                  ? "A few patterns were found, but overall the writing has few characteristics associated with AI."
                  : "Minimal patterns associated with AI-assisted writing were found."}
          </p>
        </div>
      )}

      {/* Section list */}
      {doc?.status === "scanned" && (
        <>
          <div className="mt-8">
            <h2 className="text-lg font-semibold">Flagged Sections</h2>
            <p className="mt-1 text-sm text-gray-500">
              Each section shows potential AI patterns. Subscribe to review and fix them.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {unlockedSections.map((section) => {
              const sectionFlags = flagsList.filter(
                (f) => f.sectionId === section.id
              );
              return (
                <div
                  key={section.id}
                  className={`rounded-lg border-l-4 p-4 ${SIGNAL_COLORS[section.aiSignalLevel]}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">
                        Section {section.index + 1}
                      </span>
                      {section.flagCount > 0 && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${SIGNAL_BADGE[section.aiSignalLevel]}`}
                        >
                          {section.flagCount} flag
                          {section.flagCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview of section text */}
                  <p className="mt-2 text-sm text-gray-700 line-clamp-3">
                    {section.currentText}
                  </p>

                  {/* Flag pills */}
                  {sectionFlags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sectionFlags.slice(0, 8).map((flag) => (
                        <span
                          key={flag.id}
                          className="rounded bg-white/80 px-2 py-0.5 text-xs text-gray-600 border border-gray-200"
                          title={flag.explanation}
                        >
                          {flag.flaggedPhrase.length > 30
                            ? flag.flaggedPhrase.slice(0, 30) + "..."
                            : flag.flaggedPhrase}
                        </span>
                      ))}
                      {sectionFlags.length > 8 && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          +{sectionFlags.length - 8} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Locked sections */}
            {sectionsList.filter((s) => s.isLocked).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium text-gray-400">
                  {sectionsList.filter((s) => s.isLocked).length} citation
                  section(s) detected and locked — not included in analysis.
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <button
              onClick={handleEditClick}
              className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Start Editing
            </button>
            <p className="mt-2 text-xs text-gray-400">
              Fix flagged patterns section by section with AI-guided suggestions.
            </p>
          </div>
        </>
      )}

      {/* Scanning state */}
      {scanning && (
        <div className="mt-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-500">
            Scanning your document for AI patterns...
          </p>
        </div>
      )}

      <PaywallModal open={showPaywall} onClose={() => setShowPaywall(false)} />
    </div>
  );
}
