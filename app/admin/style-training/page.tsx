"use client";

import { useEffect, useState, useCallback } from "react";

interface StyleItem {
  id: string;
  category: string;
  item: string;
  example: string | null;
  notes: string | null;
  preference: "always_remove" | "always_keep" | "ask_each_time";
  sortOrder: number;
}

const PREF_LABELS: Record<string, { label: string; color: string; short: string }> = {
  always_remove: { label: "Always Remove", color: "bg-red-100 text-red-700 border-red-200", short: "Remove" },
  always_keep: { label: "Always Keep", color: "bg-green-100 text-green-700 border-green-200", short: "Keep" },
  ask_each_time: { label: "Ask Me Each Time", color: "bg-blue-100 text-blue-700 border-blue-200", short: "Ask" },
};

const PREF_OPTIONS: ("always_remove" | "always_keep" | "ask_each_time")[] = ["always_remove", "always_keep", "ask_each_time"];

export default function StyleTrainingPage() {
  const [items, setItems] = useState<StyleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/style-training");
    const json = await res.json();
    if (json.success) setItems(json.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updatePreference(id: string, preference: string) {
    await fetch("/api/admin/style-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_preference", id, preference }),
    });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, preference: preference as StyleItem["preference"] } : i));
  }

  async function bulkUpdate(category: string, preference: string) {
    await fetch("/api/admin/style-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_update", category, preference }),
    });
    setItems((prev) => prev.map((i) => i.category === category ? { ...i, preference: preference as StyleItem["preference"] } : i));
  }

  // Group by category
  const categories = [...new Set(items.map((i) => i.category))];
  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat),
  }));

  // Stats
  const removeCount = items.filter((i) => i.preference === "always_remove").length;
  const keepCount = items.filter((i) => i.preference === "always_keep").length;
  const askCount = items.filter((i) => i.preference === "ask_each_time").length;

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold">Style Training</h1>
      <p className="mt-1 text-sm text-gray-500">
        Control how formatting artifacts are handled during scans. Items set to &quot;Always Remove&quot; are
        automatically stripped. &quot;Always Keep&quot; items are never flagged. &quot;Ask Me Each Time&quot;
        items appear as suggestions during your hands-on review.
      </p>

      {/* Summary stats */}
      <div className="mt-4 flex gap-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-red-700">{removeCount}</p>
          <p className="text-[10px] text-red-500">Always Remove</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-green-700">{keepCount}</p>
          <p className="text-[10px] text-green-500">Always Keep</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-blue-700">{askCount}</p>
          <p className="text-[10px] text-blue-500">Ask Each Time</p>
        </div>
      </div>

      {/* Categories */}
      <div className="mt-6 space-y-6">
        {grouped.map(({ category, items: catItems }) => (
          <div key={category}>
            {/* Category header with bulk actions */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-700">{category}</h2>
              <div className="flex gap-1">
                <span className="text-[10px] text-gray-400 mr-1">Set all:</span>
                {PREF_OPTIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => bulkUpdate(category, p)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-medium ${PREF_LABELS[p].color}`}
                  >
                    {PREF_LABELS[p].short}
                  </button>
                ))}
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 w-1/3">Item</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 w-1/6">Example</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 w-1/4">Notes</th>
                    <th className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 w-1/4">Preference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {catItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-700">{item.item}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 font-mono">{item.example}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{item.notes}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center gap-0.5">
                          {PREF_OPTIONS.map((p) => (
                            <button
                              key={p}
                              onClick={() => updatePreference(item.id, p)}
                              className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                                item.preference === p
                                  ? PREF_LABELS[p].color + " border"
                                  : "text-gray-400 hover:bg-gray-100"
                              }`}
                            >
                              {PREF_LABELS[p].short}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
