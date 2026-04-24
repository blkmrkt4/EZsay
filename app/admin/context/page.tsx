"use client";

import { useEffect, useState, useCallback } from "react";

interface ContextItem {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  content: string | null;
}

const SOURCE_TYPES = [
  { value: "custom", label: "Custom (paste or upload)" },
  { value: "context_llm", label: "ContextLLM (global base context)" },
  { value: "phrase_library", label: "Phrase Library (active entries)" },
];

export default function ContextLibraryPage() {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", sourceType: "custom", content: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/binds");
    const json = await res.json();
    if (json.success) setItems(json.data.contexts);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addContext() {
    if (!form.name) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_context", ...form }),
    });
    setForm({ name: "", description: "", sourceType: "custom", content: "" });
    setAdding(false);
    await load();
  }

  async function deleteContext(id: string) {
    if (!confirm("Delete this context?")) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_context", id }),
    });
    await load();
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Context Library</h1>
          <p className="mt-1 text-sm text-gray-500">Named context resources — upload custom files or point to system resources. These appear as choices in Activity Binds.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">+ Add Context</button>
      </div>

      {adding && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Academic phrase list" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Source Type</label>
              <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })} className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm">
                {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this context is for" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
          </div>
          {form.sourceType === "custom" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">Content</label>
                <label className="cursor-pointer rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100">
                  Browse file...
                  <input
                    type="file"
                    accept=".txt,.md,.json,.csv,.xml,.html,.yaml,.yml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      setForm({ ...form, content: text, name: form.name || file.name.replace(/\.[^.]+$/, "") });
                    }}
                  />
                </label>
              </div>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} placeholder="Paste content, or use Browse to load a file from your computer..." className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed" />
              {form.content && <p className="mt-1 text-[10px] text-gray-400">{form.content.length.toLocaleString()} characters</p>}
            </div>
          )}
          {form.sourceType !== "custom" && (
            <p className="text-xs text-gray-500 bg-gray-100 rounded p-2">
              {form.sourceType === "context_llm"
                ? "This will load the active ContextLLM version at runtime — no content needed here."
                : "This will load all active phrase library entries at runtime — no content needed here."}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={addContext} disabled={!form.name} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">Add</button>
            <button onClick={() => setAdding(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  item.sourceType === "context_llm" ? "bg-purple-100 text-purple-700"
                  : item.sourceType === "phrase_library" ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {item.sourceType === "context_llm" ? "ContextLLM" : item.sourceType === "phrase_library" ? "Phrase Lib" : "Custom"}
                </span>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.content && (
                  <button onClick={() => setEditing(editing === item.id ? null : item.id)} className="text-xs text-gray-500 hover:text-gray-700">
                    {editing === item.id ? "Hide" : "View"}
                  </button>
                )}
                <button onClick={() => deleteContext(item.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </div>
            </div>
            {editing === item.id && item.content && (
              <div className="border-t border-gray-100 px-4 py-3">
                <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono max-h-60 overflow-auto">{item.content.slice(0, 2000)}{item.content.length > 2000 ? "\n..." : ""}</pre>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && !adding && (
          <p className="py-8 text-center text-sm text-gray-400">No context resources yet.</p>
        )}
      </div>
    </div>
  );
}
