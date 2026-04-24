"use client";

import { useEffect, useState, useCallback } from "react";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const json = await res.json();
    if (json.success) setSettings(json.data);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  async function saveSetting(key: string, value: string) {
    setSaving(key);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSettings((prev) => ({ ...prev, [key]: value }));
    setTimeout(() => setSaving(null), 1500);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="mt-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">OpenRouter API Key</h3>
          <p className="text-xs text-gray-500">Used for all LLM calls. Overrides the OPENROUTER_API_KEY env var.</p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={settings.openrouter_api_key || ""}
              onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
              placeholder="sk-or-..."
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono"
            />
            <button onClick={() => saveSetting("openrouter_api_key", settings.openrouter_api_key || "")} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              {saving === "openrouter_api_key" ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700">Test Mode</h3>
          <p className="text-xs text-gray-500">When enabled, routes all LLM calls to a cheaper model for development.</p>
          <div className="mt-2">
            <button
              onClick={() => saveSetting("test_mode", settings.test_mode === "true" ? "false" : "true")}
              className={`rounded px-4 py-2 text-sm font-medium ${settings.test_mode === "true" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}
            >
              {settings.test_mode === "true" ? "Test Mode ON" : "Test Mode OFF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
