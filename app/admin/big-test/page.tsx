"use client";

import { useEffect, useState, useCallback } from "react";

interface Doc {
  id: string;
  title: string;
}

interface ScoreResult {
  model: string;
  label: string;
  score: number;
  confidence: string;
  reasoning: string;
  error?: string;
  latencyMs: number;
}

export default function AdminBigTestPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoreResult[]>([]);

  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    const json = await res.json();
    if (json.success) {
      setDocs(json.data.map((d: any) => ({ id: d.id, title: d.title })));
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function runScores() {
    if (!activeDocId) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch("/api/debug/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: activeDocId }),
      });
      const json = await res.json();
      if (json.success) {
        setResults(json.data.results);
      } else {
        console.error("Big Test failed:", json.error);
      }
    } catch (err) {
      console.error("Big Test error:", err);
    } finally {
      setLoading(false);
    }
  }

  const avgScore = results.length > 0
    ? Math.round(
        results
          .filter((r) => !r.error && r.score >= 0)
          .reduce((sum, r) => sum + r.score, 0) /
        results.filter((r) => !r.error && r.score >= 0).length
      )
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-800">Big Test</h1>
          <span className="text-xs text-gray-400">Multi-model AI detection scoring</span>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <label className="text-xs font-medium text-gray-600">Document:</label>
          <select
            value={activeDocId ?? ""}
            onChange={(e) => setActiveDocId(e.target.value || null)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="">Select a document...</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
          <button
            onClick={runScores}
            disabled={!activeDocId || loading}
            className="rounded bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40"
          >
            {loading ? "Scoring..." : "Run 5 Models"}
          </button>
          {loading && (
            <div className="flex items-center gap-2 text-xs text-purple-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
              Querying models in parallel...
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {results.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center max-w-md">
              <p className="text-lg font-semibold text-gray-400">No results yet</p>
              <p className="mt-2 text-sm text-gray-400">Select one of your documents and click &quot;Run 5 Models&quot; to score it across multiple AI detection models.</p>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Summary bar */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Consensus Score</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Average across all successful models</p>
                </div>
                {avgScore !== null && (
                  <div className="text-right">
                    <span className={`text-3xl font-bold ${avgScore >= 70 ? "text-green-600" : avgScore >= 40 ? "text-yellow-600" : avgScore >= 15 ? "text-amber-600" : "text-red-600"}`}>
                      {avgScore}
                    </span>
                    <span className="text-lg text-gray-400">/100</span>
                    <p className={`text-xs mt-0.5 ${avgScore >= 70 ? "text-green-500" : avgScore >= 40 ? "text-yellow-500" : avgScore >= 15 ? "text-amber-500" : "text-red-500"}`}>
                      {avgScore >= 90 ? "Undetectable" : avgScore >= 70 ? "Human-like" : avgScore >= 40 ? "Mixed signals" : avgScore >= 15 ? "Detectable" : "Clearly AI"}
                    </p>
                  </div>
                )}
              </div>
              {/* Score bar visualization */}
              {results.filter((r) => !r.error).length > 0 && (
                <div className="mt-4 flex items-center gap-3">
                  {results.filter((r) => !r.error && r.score >= 0).map((r) => (
                    <div key={r.model} className="flex-1 text-center">
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.score >= 70 ? "bg-green-500" : r.score >= 40 ? "bg-yellow-500" : r.score >= 15 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${r.score}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1 truncate">{r.label}</p>
                      <p className={`text-xs font-bold ${r.score >= 70 ? "text-green-600" : r.score >= 40 ? "text-yellow-600" : r.score >= 15 ? "text-amber-600" : "text-red-600"}`}>{r.score}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Individual model cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((r) => (
                <div key={r.model} className={`rounded-lg border p-5 ${r.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">{r.label}</h3>
                      <p className="text-[10px] text-gray-400 font-mono">{r.model}</p>
                    </div>
                    {r.error ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">ERROR</span>
                    ) : (
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${r.score >= 70 ? "text-green-600" : r.score >= 40 ? "text-yellow-600" : r.score >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {r.score}
                        </span>
                        <span className="text-sm text-gray-400">/100</span>
                      </div>
                    )}
                  </div>

                  {r.error ? (
                    <p className="mt-2 text-xs text-red-500">{r.error}</p>
                  ) : (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.confidence === "high" ? "bg-blue-100 text-blue-700" : r.confidence === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-200 text-gray-600"}`}>
                          {r.confidence} confidence
                        </span>
                        <span className="text-[10px] text-gray-400">{r.latencyMs}ms</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{r.reasoning}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
