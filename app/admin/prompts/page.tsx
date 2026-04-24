"use client";

import { useEffect, useState, useCallback } from "react";

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPrompt: string;
}

export default function PromptLibraryPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", systemPrompt: "", userPrompt: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/binds");
    const json = await res.json();
    if (json.success) setPrompts(json.data.prompts);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addPrompt() {
    if (!form.name) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_prompt", ...form }),
    });
    setForm({ name: "", description: "", systemPrompt: "", userPrompt: "" });
    setAdding(false);
    await load();
  }

  async function updatePrompt(p: Prompt) {
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_prompt", ...p }),
    });
    setEditing(null);
    await load();
  }

  async function deletePrompt(id: string) {
    if (!confirm("Delete this prompt?")) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_prompt", id }),
    });
    await load();
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prompt Library</h1>
          <p className="mt-1 text-sm text-gray-500">Create named prompt pairs (system + user). These appear as choices in Activity Binds.</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">+ Add Prompt</button>
      </div>

      {adding && (
        <PromptForm
          form={form}
          onChange={setForm}
          onSave={addPrompt}
          onCancel={() => setAdding(false)}
          saveLabel="Add"
        />
      )}

      <div className="mt-4 space-y-2">
        {prompts.map((p) => (
          <div key={p.id} className="rounded-lg border border-gray-200">
            <button onClick={() => setEditing(editing === p.id ? null : p.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50">
              <div>
                <p className="font-medium text-sm">{p.name}</p>
                {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{p.systemPrompt.length + p.userPrompt.length} chars</span>
                <svg className={`h-4 w-4 text-gray-400 transition-transform ${editing === p.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </div>
            </button>
            {editing === p.id && (
              <div className="border-t border-gray-100">
                <PromptEditor
                  prompt={p}
                  onSave={updatePrompt}
                  onDelete={() => deletePrompt(p.id)}
                />
              </div>
            )}
          </div>
        ))}
        {prompts.length === 0 && !adding && (
          <p className="py-8 text-center text-sm text-gray-400">No prompts added yet.</p>
        )}
      </div>
    </div>
  );
}

function PromptForm({ form, onChange, onSave, onCancel, saveLabel }: {
  form: { name: string; description: string; systemPrompt: string; userPrompt: string };
  onChange: (f: typeof form) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Name</label>
          <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="e.g. Surface scan prompt" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Description</label>
          <input type="text" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="What this prompt is for" className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">System Prompt</label>
        <textarea value={form.systemPrompt} onChange={(e) => onChange({ ...form, systemPrompt: e.target.value })} rows={8} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed" placeholder="The system-level instruction..." />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">User Prompt</label>
        <textarea value={form.userPrompt} onChange={(e) => onChange({ ...form, userPrompt: e.target.value })} rows={8} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed" placeholder="The user-level message template..." />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!form.name} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-40">{saveLabel}</button>
        <button onClick={onCancel} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function PromptEditor({ prompt, onSave, onDelete }: {
  prompt: Prompt;
  onSave: (p: Prompt) => void;
  onDelete: () => void;
}) {
  const [p, setP] = useState(prompt);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500">Name</label>
          <input type="text" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Description</label>
          <input type="text" value={p.description || ""} onChange={(e) => setP({ ...p, description: e.target.value })} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">System Prompt</label>
        <textarea value={p.systemPrompt} onChange={(e) => setP({ ...p, systemPrompt: e.target.value })} rows={10} className="mt-1 block w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed focus:bg-white" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">User Prompt</label>
        <textarea value={p.userPrompt} onChange={(e) => setP({ ...p, userPrompt: e.target.value })} rows={10} className="mt-1 block w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed focus:bg-white" />
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => onSave(p)} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">Save</button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Delete</button>
      </div>
    </div>
  );
}
