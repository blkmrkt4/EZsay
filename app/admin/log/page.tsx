"use client";

import { useEffect, useState, useCallback } from "react";

interface LogEntry {
  id: string;
  activityType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  outcome: string;
  createdAt: string;
}

const PAGE_SIZE = 100;

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  // Filters
  const [activityType, setActivityType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [model, setModel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (activityType) params.set("activityType", activityType);
    if (outcome) params.set("outcome", outcome);
    if (model) params.set("model", model);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/admin/log?${params}`);
    const json = await res.json();
    if (json.success) {
      setLogs(json.data.logs);
      setTotal(json.data.total);
    }
  }, [offset, activityType, outcome, model, from, to]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  function goToPage(page: number) {
    setOffset((page - 1) * PAGE_SIZE);
  }

  function resetFilters() {
    setActivityType("");
    setOutcome("");
    setModel("");
    setFrom("");
    setTo("");
    setOffset(0);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <button onClick={loadLogs} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Refresh</button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500">
          Activity
          <select value={activityType} onChange={(e) => { setActivityType(e.target.value); setOffset(0); }} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">All</option>
            <option value="scan_general">scan_general</option>
            <option value="scan_academic">scan_academic</option>
            <option value="suggest_rewrite">suggest_rewrite</option>
            <option value="suggest_academic">suggest_academic</option>
            <option value="suggest_tone">suggest_tone</option>
            <option value="evaluate_rewrite">evaluate_rewrite</option>
            <option value="citation_verify">citation_verify</option>
            <option value="expand_prose">expand_prose</option>
          </select>
        </label>

        <label className="text-xs text-gray-500">
          Outcome
          <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setOffset(0); }} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">All</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
            <option value="skipped">skipped</option>
            <option value="pending">pending</option>
          </select>
        </label>

        <label className="text-xs text-gray-500">
          Model
          <input value={model} onChange={(e) => { setModel(e.target.value); setOffset(0); }} placeholder="e.g. gpt-4o" className="ml-1 w-32 rounded border border-gray-300 px-2 py-1 text-xs" />
        </label>

        <label className="text-xs text-gray-500">
          From
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        </label>

        <label className="text-xs text-gray-500">
          To
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        </label>

        {(activityType || outcome || model || from || to) && (
          <button onClick={resetFilters} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">Clear</button>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">No LLM calls match the current filters.</p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Activity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Model</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Latency</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">{log.activityType}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">{log.modelUsed}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">{log.inputTokens + log.outputTokens}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">{log.latencyMs}ms</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${log.outcome === "accepted" ? "bg-green-100 text-green-700" : log.outcome === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>{log.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>{total} result{total !== 1 ? "s" : ""}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30">Prev</button>
                <span>Page {currentPage} of {totalPages}</span>
                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30">Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
