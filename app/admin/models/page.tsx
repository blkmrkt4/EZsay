"use client";

import { useEffect, useState, useCallback } from "react";

interface Model {
  id: string;
  openrouterModelId: string;
  name: string;
  description: string | null;
  temperature: number;
  maxTokens: number;
}

export default function ModelLibraryPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ openrouterModelId: "", name: "", description: "", temperature: 0.7, maxTokens: 2048 });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/binds");
    const json = await res.json();
    if (json.success) setModels(json.data.models);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addModel() {
    if (!form.openrouterModelId || !form.name) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_model", ...form }),
    });
    setForm({ openrouterModelId: "", name: "", description: "", temperature: 0.7, maxTokens: 2048 });
    setAdding(false);
    await load();
  }

  async function deleteModel(id: string) {
    if (!confirm("Delete this model?")) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_model", id }),
    });
    await load();
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Model Library</h1>
          <p className="mt-1 text-sm text-gray-500">Add OpenRouter models and give them friendly names. These appear as choices in Activity Binds.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">+ Add Model</button>
      </div>

      {adding && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">OpenRouter Model ID</label>
            <input type="text" value={form.openrouterModelId} onChange={(e) => setForm({ ...form, openrouterModelId: e.target.value })} placeholder="e.g. anthropic/claude-sonnet-4-20250514" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Your Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Claude Sonnet (fast rewrite)" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What you use this model for" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Temperature</label>
              <input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0.7 })} className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Max Tokens</label>
              <input type="number" step="256" min="256" value={form.maxTokens} onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 2048 })} className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addModel} disabled={!form.openrouterModelId || !form.name} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">Add</button>
            <button onClick={() => setAdding(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {models.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <div>
              <p className="font-medium text-sm">{m.name}</p>
              <p className="text-xs text-gray-400 font-mono">{m.openrouterModelId}</p>
              {m.description && <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-gray-400">
                <span>temp {m.temperature}</span>
                <span className="mx-1">&middot;</span>
                <span>{m.maxTokens} tokens</span>
              </div>
              <button onClick={() => deleteModel(m.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
            </div>
          </div>
        ))}
        {models.length === 0 && !adding && (
          <p className="py-8 text-center text-sm text-gray-400">No models added yet. Click &quot;+ Add Model&quot; to get started.</p>
        )}
      </div>
    </div>
  );
}
