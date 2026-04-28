"use client";

import { useEffect, useState, useCallback } from "react";

interface EventCount {
  eventName: string;
  category: string;
  count: number;
  uniqueUsers: number;
}

interface LimitHit {
  limitType: string;
  count: number;
  uniqueUsers: number;
}

interface FeatureUsage {
  feature: string;
  count: number;
}

interface MetricsData {
  eventCounts: EventCount[];
  totalUniqueUsers: number;
  scanAverages: {
    avgRiskScore: number | null;
    avgFlagCount: number | null;
    avgWordCount: number | null;
    scanCount: number;
  } | null;
  limitHits: LimitHit[];
  featureUsage: FeatureUsage[];
}

const CATEGORY_ORDER = ["activation", "value", "retention", "monetization"];
const CATEGORY_COLORS: Record<string, string> = {
  activation: "bg-blue-50 border-blue-200",
  value: "bg-green-50 border-green-200",
  retention: "bg-purple-50 border-purple-200",
  monetization: "bg-amber-50 border-amber-200",
};
const CATEGORY_TITLES: Record<string, string> = {
  activation: "Activation",
  value: "Value",
  retention: "Retention",
  monetization: "Monetization Signals",
};

function getCount(counts: EventCount[], name: string): number {
  return Number(counts.find((c) => c.eventName === name)?.count ?? 0);
}

function getUnique(counts: EventCount[], name: string): number {
  return Number(counts.find((c) => c.eventName === name)?.uniqueUsers ?? 0);
}

export default function AdminMetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/admin/metrics?${params}`);
    const json = await res.json();
    if (json.success) setData(json.data);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-8 text-sm text-gray-400">Loading metrics...</div>;

  const ec = data.eventCounts;

  // Computed activation metrics
  const uploads = getCount(ec, "upload_completed");
  const intakeCompleted = getCount(ec, "intake_completed");
  const intakeSkipped = getCount(ec, "intake_skipped");
  const intakeTotal = intakeCompleted + intakeSkipped;
  const scansStarted = getCount(ec, "scan_started");
  const reviewOpened = getCount(ec, "review_tab_opened");

  // Value metrics
  const accepted = getCount(ec, "flag_accepted");
  const rejected = getCount(ec, "flag_rejected");
  const skipped = getCount(ec, "flag_skipped");
  const totalResolved = accepted + rejected + skipped;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Metrics</h1>
        <button onClick={load} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Refresh</button>
      </div>

      {/* Date filters */}
      <div className="mt-4 flex items-end gap-3">
        <label className="text-xs text-gray-500">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs text-gray-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">Clear</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{data.totalUniqueUsers} unique user{data.totalUniqueUsers !== 1 ? "s" : ""}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Activation */}
        <div className={`rounded-lg border p-4 ${CATEGORY_COLORS.activation}`}>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{CATEGORY_TITLES.activation}</h2>
          <div className="space-y-2">
            <Metric label="Uploads completed" value={uploads} />
            <Metric label="Intake completed" value={intakeCompleted} sub={intakeTotal > 0 ? `${Math.round((intakeCompleted / intakeTotal) * 100)}% completion rate` : undefined} />
            <Metric label="Intake skipped" value={intakeSkipped} />
            <Metric label="Scans started" value={scansStarted} sub={uploads > 0 ? `${Math.round((scansStarted / uploads) * 100)}% of uploads` : undefined} />
            <Metric label="First flag accepted" value={getUnique(ec, "first_flag_accepted")} sub="unique users" />
            <Metric label="Review tab opened" value={reviewOpened} />
          </div>
        </div>

        {/* Value */}
        <div className={`rounded-lg border p-4 ${CATEGORY_COLORS.value}`}>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{CATEGORY_TITLES.value}</h2>
          <div className="space-y-2">
            <Metric label="Flags accepted" value={accepted} sub={totalResolved > 0 ? `${Math.round((accepted / totalResolved) * 100)}% acceptance rate` : undefined} />
            <Metric label="Flags rejected" value={rejected} />
            <Metric label="Flags skipped" value={skipped} />
            {data.scanAverages && (
              <>
                <Metric label="Avg AI risk score" value={data.scanAverages.avgRiskScore ?? 0} sub={`across ${data.scanAverages.scanCount} scans`} />
                <Metric label="Avg flags per scan" value={data.scanAverages.avgFlagCount ?? 0} />
                <Metric label="Avg words per scan" value={data.scanAverages.avgWordCount ?? 0} />
              </>
            )}
          </div>
        </div>

        {/* Retention */}
        <div className={`rounded-lg border p-4 ${CATEGORY_COLORS.retention}`}>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{CATEGORY_TITLES.retention}</h2>
          <div className="space-y-2">
            <Metric label="Documents created" value={getCount(ec, "document_created")} sub={`by ${getUnique(ec, "document_created")} users`} />
            <Metric label="Review tab used" value={getCount(ec, "review_opened") + reviewOpened} sub={`by ${getUnique(ec, "review_tab_opened")} users`} />
          </div>
        </div>

        {/* Monetization */}
        <div className={`rounded-lg border p-4 ${CATEGORY_COLORS.monetization}`}>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{CATEGORY_TITLES.monetization}</h2>
          <div className="space-y-2">
            {data.limitHits.length > 0 ? (
              data.limitHits.map((lh) => (
                <Metric key={lh.limitType} label={`Limit hit: ${lh.limitType}`} value={Number(lh.count)} sub={`${lh.uniqueUsers} user${Number(lh.uniqueUsers) !== 1 ? "s" : ""}`} />
              ))
            ) : (
              <p className="text-xs text-gray-400">No limit hits yet</p>
            )}
            {data.featureUsage.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider pt-2">Feature Usage</p>
                {data.featureUsage.map((fu) => (
                  <Metric key={fu.feature} label={fu.feature} value={Number(fu.count)} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Raw event counts */}
      <details className="mt-6">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">All event counts (raw)</summary>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Count</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...ec].sort((a, b) => {
                const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
                return catDiff !== 0 ? catDiff : Number(b.count) - Number(a.count);
              }).map((e) => (
                <tr key={e.eventName}>
                  <td className="px-3 py-2 text-xs font-mono">{e.eventName}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.category}</td>
                  <td className="px-3 py-2 text-right text-xs">{Number(e.count).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">{Number(e.uniqueUsers).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="text-right">
        <span className="text-sm font-bold text-gray-800">{Number(value).toLocaleString()}</span>
        {sub && <span className="ml-1.5 text-[10px] text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}
