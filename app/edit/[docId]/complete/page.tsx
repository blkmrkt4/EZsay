"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface DocumentData {
  id: string;
  title: string;
  documentType: string;
  aiRiskScore: number | null;
}

interface SectionData {
  id: string;
  currentText: string;
  isLocked: boolean;
  flagCount: number;
  flagsResolved: number;
}

interface FlagData {
  id: string;
  status: string;
}

export default function CompletionPage() {
  const params = useParams();
  const docId = params.docId as string;
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [sectionsList, setSections] = useState<SectionData[]>([]);
  const [flagsList, setFlags] = useState<FlagData[]>([]);
  const [originalScore, setOriginalScore] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/documents/${docId}`);
    const json = await res.json();
    if (json.success) {
      setDoc(json.data.document);
      setSections(json.data.sections);
      setFlags(json.data.flags);
    }
  }, [docId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentScore = doc?.aiRiskScore ?? 0;
  const totalFlags = flagsList.length;
  const accepted = flagsList.filter((f) => f.status === "accepted").length;
  const rejected = flagsList.filter((f) => f.status === "rejected").length;
  const skipped = flagsList.filter((f) => f.status === "skipped").length;

  // Build the full document text from sections
  const fullText = sectionsList.map((s) => s.currentText).join("\n\n");

  async function copyToClipboard() {
    setCopying(true);
    await navigator.clipboard.writeText(fullText);
    setTimeout(() => setCopying(false), 1500);
  }

  async function downloadTxt() {
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc?.title || "document"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadDocx() {
    const res = await fetch(`/api/documents/export?documentId=${docId}&format=docx`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc?.title || "document"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const scoreColor =
    currentScore >= 70
      ? "text-red-600"
      : currentScore >= 40
        ? "text-amber-500"
        : "text-green-600";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Session Complete</h1>
        <p className="mt-2 text-sm text-gray-500">{doc?.title}</p>
      </div>

      {/* Score */}
      <div className="mt-8 rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          AI Risk Score
        </p>
        <p className={`mt-1 text-5xl font-bold ${scoreColor}`}>
          {currentScore}
        </p>
        {originalScore != null && originalScore !== currentScore && (
          <p className="mt-2 text-sm text-gray-500">
            {currentScore < originalScore
              ? `Down from ${originalScore} (${originalScore - currentScore} point improvement)`
              : `Up from ${originalScore}`}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold text-green-600">{accepted}</p>
          <p className="text-xs text-gray-500">Accepted</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-400">{skipped}</p>
          <p className="text-xs text-gray-500">Skipped</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-2xl font-bold text-red-400">{rejected}</p>
          <p className="text-xs text-gray-500">Rejected</p>
        </div>
      </div>

      {/* Export */}
      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Export</h2>
        <div className="flex gap-3">
          <button
            onClick={copyToClipboard}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copying ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            onClick={downloadDocx}
            className="flex-1 rounded-lg border border-blue-300 bg-blue-50 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Download .docx
          </button>
          <button
            onClick={downloadTxt}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download .txt
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-center gap-4">
        <Link
          href={`/edit/${docId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Continue editing
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:underline"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}
