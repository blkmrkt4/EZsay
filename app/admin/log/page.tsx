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

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const loadLogs = useCallback(async () => {
    const res = await fetch("/api/admin/log");
    const json = await res.json();
    if (json.success) setLogs(json.data);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <button onClick={loadLogs} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Refresh</button>
      </div>

      {logs.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">No LLM calls logged yet.</p>
      ) : (
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
      )}
    </div>
  );
}
