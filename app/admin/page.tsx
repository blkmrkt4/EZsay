"use client";

import { useEffect, useState, useCallback } from "react";

interface Bind {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  modelId: string | null;
  fallbackModelId1: string | null;
  fallbackModelId2: string | null;
  promptId: string | null;
  contextIds: string[];
}

interface ModelItem { id: string; name: string; openrouterModelId: string; description: string | null; temperature: number; maxTokens: number; }
interface PromptItem { id: string; name: string; description: string | null; systemPrompt: string; userPrompt: string; }
interface ContextItem { id: string; name: string; sourceType: string; description: string | null; content: string | null; }

export default function AdminDashboard() {
  const [binds, setBinds] = useState<Bind[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newBind, setNewBind] = useState({ name: "", slug: "", description: "" });
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const load = useCallback(async () => {
    const [bindsRes, settingsRes] = await Promise.all([
      fetch("/api/admin/binds"),
      fetch("/api/admin/settings"),
    ]);
    const bindsJson = await bindsRes.json();
    const settingsJson = await settingsRes.json();
    if (bindsJson.success) {
      setBinds(bindsJson.data.binds);
      setModels(bindsJson.data.models);
      setPrompts(bindsJson.data.prompts);
      setContexts(bindsJson.data.contexts);
    }
    if (settingsJson.success && settingsJson.data.openrouter_api_key) {
      setApiKey(settingsJson.data.openrouter_api_key);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveApiKey() {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "openrouter_api_key", value: apiKey }),
    });
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  }

  async function createBind() {
    if (!newBind.name || !newBind.slug) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...newBind }),
    });
    setCreating(false);
    setNewBind({ name: "", slug: "", description: "" });
    await load();
  }

  async function updateBind(id: string, updates: Partial<Bind>) {
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, ...updates }),
    });
    await load();
  }

  async function deleteBind(id: string) {
    if (!confirm("Delete this activity bind?")) return;
    await fetch("/api/admin/binds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await load();
  }

  // Lookup helpers
  const getModel = (id: string | null) => models.find((m) => m.id === id);
  const getPrompt = (id: string | null) => prompts.find((p) => p.id === id);
  const getContext = (id: string) => contexts.find((c) => c.id === id);

  const configured = (b: Bind) => b.modelId && b.promptId;

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold">Activity Binds</h1>
      <p className="mt-1 text-sm text-gray-500">
        Each row is an activity. Double-click to expand and see the full configuration.
        System activities have a SYS badge and can&apos;t be deleted.
      </p>

      {/* OpenRouter API Key */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 shrink-0">OpenRouter Key</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-or-..." className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono" />
        <button onClick={saveApiKey} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">{apiKeySaved ? "Saved" : "Save"}</button>
      </div>

      {/* Warnings */}
      {models.length === 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No models in your library. <a href="/admin/models" className="underline font-medium">Add models first</a>.
        </div>
      )}
      {prompts.length === 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No prompts in your library. <a href="/admin/prompts" className="underline font-medium">Add prompts first</a>.
        </div>
      )}

      {/* Create custom */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{binds.length} Activities</h2>
        <button onClick={() => setCreating(!creating)} className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200">+ Custom Bind</button>
      </div>

      {creating && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input type="text" value={newBind.name} onChange={(e) => setNewBind({ ...newBind, name: e.target.value })} placeholder="Name" className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <input type="text" value={newBind.slug} onChange={(e) => setNewBind({ ...newBind, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="slug" className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono" />
            <input type="text" value={newBind.description} onChange={(e) => setNewBind({ ...newBind, description: e.target.value })} placeholder="Description" className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={createBind} disabled={!newBind.name || !newBind.slug} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-40">Create</button>
            <button onClick={() => setCreating(false)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Bind rows */}
      <div className="mt-3 space-y-1">
        {binds.map((bind) => {
          const isOpen = expandedId === bind.id;
          const model = getModel(bind.modelId);
          const fb1 = getModel(bind.fallbackModelId1);
          const fb2 = getModel(bind.fallbackModelId2);
          const prompt = getPrompt(bind.promptId);
          const ctxItems = (bind.contextIds || []).map(getContext).filter(Boolean) as ContextItem[];

          return (
            <div key={bind.id} className={`rounded-lg border ${configured(bind) ? "border-gray-200" : "border-amber-200"} ${!bind.isActive ? "opacity-50" : ""}`}>
              {/* Summary row — inline dropdowns + chevron to expand detail */}
              <div className="flex items-center gap-3 px-4 py-2">
                {/* Left: badges + name */}
                <div className="flex items-center gap-2 min-w-0 shrink-0" style={{ width: "40%" }}>
                  {bind.isSystem && <span className="rounded bg-gray-200 px-1 py-0.5 text-[9px] font-medium text-gray-500 shrink-0">SYS</span>}
                  {!configured(bind) && <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-600 shrink-0">NEEDS CONFIG</span>}
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{bind.name}</span>
                    <span className="ml-2 text-[10px] text-gray-400 font-mono">{bind.slug}</span>
                  </div>
                </div>

                {/* Inline dropdowns */}
                <select
                  value={bind.modelId || ""}
                  onChange={(e) => { e.stopPropagation(); updateBind(bind.id, { modelId: e.target.value || null }); }}
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded border px-1.5 py-1 text-xs w-36 ${bind.modelId ? "border-gray-300 text-gray-700" : "border-amber-300 bg-amber-50 text-amber-600"}`}
                >
                  <option value="">Model...</option>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>

                <select
                  value={bind.promptId || ""}
                  onChange={(e) => { e.stopPropagation(); updateBind(bind.id, { promptId: e.target.value || null }); }}
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded border px-1.5 py-1 text-xs w-36 ${bind.promptId ? "border-gray-300 text-gray-700" : "border-amber-300 bg-amber-50 text-amber-600"}`}
                >
                  <option value="">Prompt...</option>
                  {prompts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Context — inline dropdown, shows first item + "..." if multiple */}
                <select
                  value=""
                  onChange={(e) => {
                    e.stopPropagation();
                    const cids = bind.contextIds || [];
                    if (e.target.value && !cids.includes(e.target.value)) {
                      updateBind(bind.id, { contextIds: [...cids, e.target.value] } as Partial<Bind>);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded border px-1.5 py-1 text-xs w-36 ${ctxItems.length > 0 ? "border-gray-300 text-gray-700" : "border-gray-300 text-gray-400"}`}
                >
                  <option value="">
                    {ctxItems.length === 0
                      ? "Context..."
                      : ctxItems.length === 1
                        ? ctxItems[0].name
                        : `${ctxItems[0].name} +${ctxItems.length - 1}...`}
                  </option>
                  {contexts.filter((c) => !(bind.contextIds || []).includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>+ {c.name}</option>
                  ))}
                </select>

                {/* Edit detail button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedId(isOpen ? null : bind.id); }}
                  className="shrink-0 rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  Edit
                </button>
              </div>

              {/* Expanded detail view — read-only summary of what's bound */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-5 bg-gray-50/50">
                  {bind.description && <p className="text-sm text-gray-600 mb-4">{bind.description}</p>}

                  <div className="grid grid-cols-3 gap-6">
                    {/* ── Model ────────────────────────────────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Model</h3>
                        <a href="/admin/models" className="text-[10px] text-blue-600 hover:underline">Edit in library</a>
                      </div>

                      {/* Primary */}
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-gray-500">Primary</label>
                          <select value={bind.modelId || ""} onChange={(e) => updateBind(bind.id, { modelId: e.target.value || null })} className={`mt-0.5 block w-full rounded border px-2 py-1.5 text-sm ${bind.modelId ? "border-gray-300" : "border-amber-300 bg-amber-50"}`}>
                            <option value="">Select...</option>
                            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          {model && (
                            <p className="mt-0.5 text-[10px] text-gray-400">
                              <span className="font-mono">{model.openrouterModelId}</span>
                              <span className="ml-2">temp {model.temperature} &middot; {model.maxTokens} tok</span>
                            </p>
                          )}
                        </div>
                        {/* Fallback 1 */}
                        <div>
                          <label className="text-[10px] text-gray-500">Fallback 1</label>
                          <select value={bind.fallbackModelId1 || ""} onChange={(e) => updateBind(bind.id, { fallbackModelId1: e.target.value || null })} className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                            <option value="">None</option>
                            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          {fb1 && <p className="mt-0.5 text-[10px] text-gray-400 font-mono">{fb1.openrouterModelId}</p>}
                        </div>
                        {/* Fallback 2 */}
                        <div>
                          <label className="text-[10px] text-gray-500">Fallback 2</label>
                          <select value={bind.fallbackModelId2 || ""} onChange={(e) => updateBind(bind.id, { fallbackModelId2: e.target.value || null })} className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                            <option value="">None</option>
                            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          {fb2 && <p className="mt-0.5 text-[10px] text-gray-400 font-mono">{fb2.openrouterModelId}</p>}
                        </div>
                      </div>
                    </div>

                    {/* ── Prompt (read-only preview) ───────────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Prompt</h3>
                        <a href="/admin/prompts" className="text-[10px] text-blue-600 hover:underline">Edit in library</a>
                      </div>
                      {prompt ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">System Prompt</label>
                            <div className="mt-0.5 rounded border border-gray-200 bg-white p-2 font-mono text-[11px] text-gray-600 leading-relaxed max-h-40 overflow-auto whitespace-pre-wrap">
                              {prompt.systemPrompt || <span className="text-gray-400 italic">Empty</span>}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">User Prompt</label>
                            <div className="mt-0.5 rounded border border-gray-200 bg-white p-2 font-mono text-[11px] text-gray-600 leading-relaxed max-h-40 overflow-auto whitespace-pre-wrap">
                              {prompt.userPrompt || <span className="text-gray-400 italic">Empty</span>}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-600">
                          No prompt selected. <a href="/admin/prompts" className="underline font-medium">Create one</a>.
                        </div>
                      )}
                    </div>

                    {/* ── Context ──────────────────────────────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Context</h3>
                        <a href="/admin/context" className="text-[10px] text-blue-600 hover:underline">Edit in library</a>
                      </div>
                      <select
                        value=""
                        onChange={(e) => {
                          const cids = bind.contextIds || [];
                          if (e.target.value && !cids.includes(e.target.value)) {
                            updateBind(bind.id, { contextIds: [...cids, e.target.value] } as Partial<Bind>);
                          }
                        }}
                        className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">Add context...</option>
                        {contexts.filter((c) => !(bind.contextIds || []).includes(c.id)).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {ctxItems.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {ctxItems.map((ctx) => (
                            <div key={ctx.id} className="flex items-center justify-between rounded bg-white border border-gray-200 px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${ctx.sourceType === "context_llm" ? "bg-purple-100 text-purple-700" : ctx.sourceType === "phrase_library" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                  {ctx.sourceType === "context_llm" ? "CTX" : ctx.sourceType === "phrase_library" ? "LIB" : "FILE"}
                                </span>
                                <span className="text-xs">{ctx.name}</span>
                              </div>
                              <button onClick={() => updateBind(bind.id, { contextIds: (bind.contextIds || []).filter((i) => i !== ctx.id) } as Partial<Bind>)} className="text-[10px] text-gray-400 hover:text-red-500">&times;</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-gray-400">No context (optional)</p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
                    <button
                      onClick={() => updateBind(bind.id, { isActive: !bind.isActive })}
                      className={`rounded border px-3 py-1 text-xs ${bind.isActive ? "border-orange-300 text-orange-600" : "border-green-300 text-green-600"}`}
                    >
                      {bind.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {!bind.isSystem && (
                      <button onClick={() => deleteBind(bind.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
