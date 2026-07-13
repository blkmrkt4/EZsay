"use client";

import { type Citation, bucketOf, shortNameOf, type AuditBucket } from "./types";

/**
 * Verdict summary — the at-a-glance table from the citation audit:
 * how many entries are verified, need correction, look fabricated, or
 * haven't been checked yet, with the short names of each.
 */

const TILES: {
  bucket: AuditBucket;
  label: string;
  icon: string;
  tone: string;
  nameTone: string;
}[] = [
  { bucket: "verified", label: "Verified", icon: "✅", tone: "border-green-200 bg-green-50 text-green-800", nameTone: "text-green-700" },
  { bucket: "needs_correction", label: "Needs correction", icon: "🟡", tone: "border-amber-200 bg-amber-50 text-amber-800", nameTone: "text-amber-700" },
  { bucket: "fabricated", label: "Fabricated / wrong source", icon: "🔴", tone: "border-red-200 bg-red-50 text-red-800", nameTone: "text-red-700" },
  { bucket: "uncertain", label: "Uncertain", icon: "⚪", tone: "border-gray-200 bg-gray-50 text-gray-700", nameTone: "text-gray-500" },
  { bucket: "unchecked", label: "Not yet verified", icon: "⏳", tone: "border-gray-200 bg-white text-gray-600", nameTone: "text-gray-400" },
];

export default function AuditSummary({ entries }: { entries: Citation[] }) {
  if (entries.length === 0) return null;

  const groups = new Map<AuditBucket, Citation[]>();
  for (const c of entries) {
    const b = bucketOf(c);
    groups.set(b, [...(groups.get(b) ?? []), c]);
  }

  const resolvedCount = entries.filter((c) => c.status !== "open").length;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-700">Citation Audit</h3>
        <span className="text-[10px] text-gray-400">
          {entries.length} reference{entries.length !== 1 ? "s" : ""}
          {resolvedCount > 0 && ` · ${resolvedCount} resolved`}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        {TILES.map(({ bucket, label, icon, tone, nameTone }) => {
          const items = groups.get(bucket) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={bucket} className={`rounded-lg border px-3 py-2 ${tone}`}>
              <p className="text-xs font-semibold">
                {icon} {label} — {items.length}
              </p>
              <p className={`mt-0.5 text-[10px] leading-relaxed ${nameTone}`}>
                {items.map((c) => shortNameOf(c.rawText)).join(", ")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
