"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Document {
  id: string;
  title: string;
  documentType: string;
  status: string;
  aiRiskScore: number | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  scanning: "Scanning...",
  scanned: "Scanned",
  editing: "In Progress",
  complete: "Complete",
};

export default function DashboardPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
      if (json.success) setDocs(json.data);
      else setError(json.error || "Failed to load documents.");
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Your Documents</h1>
        <Link
          href="/upload"
          className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Upload New Document
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-12 text-center text-sm text-gray-400">
          Loading...
        </div>
      ) : docs.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            No documents yet. Upload one to get started.
          </p>
          <Link
            href="/upload"
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Upload your first document
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {docs.map((doc) => {
            const scoreColor =
              doc.aiRiskScore != null
                ? doc.aiRiskScore >= 70
                  ? "text-red-600"
                  : doc.aiRiskScore >= 40
                    ? "text-amber-500"
                    : "text-green-600"
                : "text-gray-300";

            const href =
              doc.status === "scanned" || doc.status === "editing"
                ? `/results/${doc.id}`
                : doc.status === "complete"
                  ? `/results/${doc.id}`
                  : `/results/${doc.id}`;

            return (
              <Link
                key={doc.id}
                href={href}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all sm:flex-row sm:items-center sm:justify-between sm:gap-0"
              >
                <div>
                  <p className="font-medium text-gray-900">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {doc.documentType} &middot;{" "}
                    {STATUS_LABELS[doc.status] ?? doc.status} &middot;{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:block sm:text-right">
                  {doc.aiRiskScore != null ? (
                    <p className={`text-2xl font-bold ${scoreColor}`}>
                      {doc.aiRiskScore}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-200">--</p>
                  )}
                  <p className="text-xs text-gray-400">Risk score</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
