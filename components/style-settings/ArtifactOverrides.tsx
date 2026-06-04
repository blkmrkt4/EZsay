"use client";

import { useState, useEffect, useMemo } from "react";

interface ArtifactItem {
  id: string;
  category: string;
  item: string;
  example: string | null;
  notes: string | null;
  preference: string;
  isOverridden: boolean;
  sortOrder: number;
}

const PREFS = [
  { value: "always_remove", label: "Remove", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "always_keep", label: "Keep", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "ask_each_time", label: "Ask", color: "bg-blue-100 text-blue-700 border-blue-200" },
] as const;

export default function ArtifactOverrides() {
  const [items, setItems] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/style-preferences/artifact-overrides")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setItems(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      if (!seen.includes(item.category)) seen.push(item.category);
    }
    return seen;
  }, [items]);

  async function handleChange(itemId: string, preference: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, preference, isOverridden: true } : i,
      ),
    );

    await fetch("/api/style-preferences/artifact-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleTrainingId: itemId, preference }),
    });
  }

  async function bulkUpdate(category: string, preference: string) {
    const catItems = items.filter((i) => i.category === category);
    setItems((prev) =>
      prev.map((i) =>
        i.category === category ? { ...i, preference, isOverridden: true } : i,
      ),
    );

    for (const item of catItems) {
      await fetch("/api/style-preferences/artifact-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleTrainingId: item.id, preference }),
      });
    }
  }

  const removeCount = items.filter((i) => i.preference === "always_remove").length;
  const keepCount = items.filter((i) => i.preference === "always_keep").length;
  const askCount = items.filter((i) => i.preference === "ask_each_time").length;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          AI Artifact Handling
        </h3>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {loading ? (
            <p className="py-4 text-center text-xs text-gray-400">Loading...</p>
          ) : (
            <>
              <div className="mb-3 space-y-1 text-[11px] text-gray-500">
                <p><strong className="text-red-600">Remove</strong> — automatically stripped during every scan.</p>
                <p><strong className="text-green-600">Keep</strong> — never flagged, scanner skips entirely.</p>
                <p><strong className="text-blue-600">Ask</strong> — flagged for you to decide case by case.</p>
              </div>

              <div className="mb-3 flex gap-2 text-[10px]">
                <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">{removeCount} Remove</span>
                <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-green-700">{keepCount} Keep</span>
                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">{askCount} Ask</span>
              </div>

              <div className="space-y-4">
                {categories.map((cat) => {
                  const catItems = items
                    .filter((i) => i.category === cat)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                  return (
                    <div key={cat}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-700">{cat}</h4>
                        <div className="flex gap-1">
                          <span className="mr-1 text-[10px] text-gray-400">All:</span>
                          {PREFS.map((p) => (
                            <button
                              key={p.value}
                              onClick={() => bulkUpdate(cat, p.value)}
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${p.color}`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded border border-gray-200">
                        {catItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 last:border-0 hover:bg-gray-50"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-medium text-gray-700">{item.item}</span>
                              {item.example && (
                                <span className="ml-2 font-mono text-xs text-gray-400">{item.example}</span>
                              )}
                              {item.isOverridden && (
                                <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] font-medium text-blue-500">
                                  custom
                                </span>
                              )}
                            </div>
                            <div className="ml-2 flex shrink-0 gap-0.5">
                              {PREFS.map((p) => (
                                <button
                                  key={p.value}
                                  onClick={() => handleChange(item.id, p.value)}
                                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                    item.preference === p.value
                                      ? p.color + " border"
                                      : "text-gray-400 hover:bg-gray-100"
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
