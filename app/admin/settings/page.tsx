"use client";

import { useEffect, useState, useCallback } from "react";

interface PlanLimitsConfig {
  individual: { monthlyWordLimit: number; perDocumentWordLimit: number; monthlyScanLimit: number; documentStorageLimit: number };
  eaas: { monthlyWordLimit: number; perDocumentWordLimit: number; monthlyScanLimit: number; documentStorageLimit: number };
}

const DEFAULT_PLAN_LIMITS: PlanLimitsConfig = {
  individual: { monthlyWordLimit: 50000, perDocumentWordLimit: 10000, monthlyScanLimit: 30, documentStorageLimit: 20 },
  eaas: { monthlyWordLimit: -1, perDocumentWordLimit: -1, monthlyScanLimit: -1, documentStorageLimit: -1 },
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimitsConfig>(DEFAULT_PLAN_LIMITS);

  // Recovery codes
  const [recoveryStatus, setRecoveryStatus] = useState<{ total: number; remaining: number } | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [generatingCodes, setGeneratingCodes] = useState(false);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const json = await res.json();
    if (json.success) {
      setSettings(json.data);
      if (json.data.plan_limits) {
        try {
          setPlanLimits(JSON.parse(json.data.plan_limits));
        } catch { /* keep defaults */ }
      }
    }
  }, []);

  useEffect(() => { loadSettings(); loadRecoveryCodes(); }, [loadSettings]);

  const loadRecoveryCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/recovery-codes");
      const json = await res.json();
      if (json.success) {
        setRecoveryStatus({ total: json.data.total, remaining: json.data.remaining });
      }
    } catch { /* non-critical */ }
  }, []);

  async function handleGenerateCodes() {
    setGeneratingCodes(true);
    setNewCodes(null);
    const res = await fetch("/api/admin/recovery-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" }),
    });
    const json = await res.json();
    if (json.success) {
      setNewCodes(json.data.codes);
      loadRecoveryCodes();
    }
    setGeneratingCodes(false);
  }

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
        {/* Plan Limits */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700">Plan Limits</h3>
          <p className="text-xs text-gray-500">
            Configure usage limits per subscription plan. Use -1 for unlimited.
          </p>

          <div className="mt-4 space-y-6">
            {(["individual", "eaas"] as const).map((plan) => (
              <div key={plan} className="rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  {plan === "individual" ? "Individual" : "Professional Editor"}
                </h4>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {([
                    { key: "monthlyWordLimit" as const, label: "Monthly word limit" },
                    { key: "perDocumentWordLimit" as const, label: "Per-document word limit" },
                    { key: "monthlyScanLimit" as const, label: "Monthly scan limit" },
                    { key: "documentStorageLimit" as const, label: "Document storage limit" },
                  ]).map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500">{label}</label>
                      <input
                        type="number"
                        value={planLimits[plan][key]}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPlanLimits((prev) => ({
                            ...prev,
                            [plan]: { ...prev[plan], [key]: val },
                          }));
                        }}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={() => saveSetting("plan_limits", JSON.stringify(planLimits))}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              {saving === "plan_limits" ? "Saved" : "Save Plan Limits"}
            </button>
          </div>
        </div>

        {/* Recovery Codes */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700">Admin Recovery Codes</h3>
          <p className="text-xs text-gray-500">
            One-time-use codes to regain admin access if you get locked out.
            Save them somewhere safe — they cannot be retrieved after generation.
          </p>

          {recoveryStatus && (
            <p className="mt-2 text-sm text-gray-600">
              {recoveryStatus.remaining} of {recoveryStatus.total} codes remaining
              {recoveryStatus.remaining <= 2 && recoveryStatus.total > 0 && (
                <span className="ml-1 text-amber-600">(running low — generate new codes)</span>
              )}
              {recoveryStatus.total === 0 && (
                <span className="ml-1 text-red-600">(no codes generated yet)</span>
              )}
            </p>
          )}

          <div className="mt-3">
            <button
              onClick={handleGenerateCodes}
              disabled={generatingCodes}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {generatingCodes
                ? "Generating..."
                : recoveryStatus?.total
                  ? "Regenerate Codes (replaces existing)"
                  : "Generate Recovery Codes"}
            </button>
          </div>

          {newCodes && (
            <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                Save these codes now. They will not be shown again.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {newCodes.map((code, i) => (
                  <code
                    key={i}
                    className="rounded bg-white px-3 py-1.5 text-center font-mono text-sm tracking-widest text-gray-900 border border-amber-200"
                  >
                    {code}
                  </code>
                ))}
              </div>
              <p className="mt-3 text-xs text-amber-600">
                Recovery login: /admin-recovery
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
