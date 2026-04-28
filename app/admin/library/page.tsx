"use client";

import { useEffect, useState, useCallback } from "react";

interface LibraryEntry {
  id: string;
  entryType: "exact_phrase" | "regex_pattern" | "semantic_pattern";
  value: string;
  category: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  documentTypes: string[];
  status: "active" | "under_review" | "retired";
  source: "manual" | "user_derived" | "ai_proposed";
  acceptanceRate: number | null;
  flagCount: number;
  notes: string | null;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-amber-100 text-amber-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  under_review: "bg-orange-100 text-orange-800",
  retired: "bg-gray-100 text-gray-600",
};

const CATEGORIES = [
  "transition",
  "corporate_fluff",
  "hype_word",
  "sentence_structure",
  "density",
  "burstiness",
  "academic_pattern",
  "emerging",
];

const ENTRY_TYPES = ["exact_phrase", "regex_pattern", "semantic_pattern"];
const DOC_TYPES = ["all", "academic", "professional", "casual", "legal"];

const PAGE_SIZE = 50;

export default function AdminLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    status: "",
    entryType: "",
    category: "",
    source: "",
    search: "",
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    entryType: "exact_phrase" as string,
    value: "",
    category: "hype_word" as string,
    severity: "medium" as string,
    explanation: "",
    documentTypes: ["all"] as string[],
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [regexTest, setRegexTest] = useState({ text: "", results: "" });
  const [showRegexTester, setShowRegexTester] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (filters.status) params.set("status", filters.status);
    if (filters.entryType) params.set("entryType", filters.entryType);
    if (filters.category) params.set("category", filters.category);
    if (filters.source) params.set("source", filters.source);
    if (filters.search) params.set("search", filters.search);

    const res = await fetch(`/api/admin/library?${params}`);
    const json = await res.json();
    if (json.success) {
      setEntries(json.data.entries);
      setTotal(json.data.total);
      setReviewCount(json.data.reviewCount);
    }
  }, [filters, offset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addEntry() {
    setSaving(true);
    const res = await fetch("/api/admin/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.success) {
      setShowAdd(false);
      resetForm();
      await loadData();
    }
    setSaving(false);
  }

  async function updateEntry(id: string, updates: Partial<LibraryEntry>) {
    const res = await fetch("/api/admin/library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const json = await res.json();
    if (json.success) {
      setEditingId(null);
      await loadData();
    }
  }

  function resetForm() {
    setForm({
      entryType: "exact_phrase",
      value: "",
      category: "hype_word",
      severity: "medium",
      explanation: "",
      documentTypes: ["all"],
      notes: "",
    });
  }

  function runRegexTest() {
    const regexEntries = entries.filter((e) => e.entryType === "regex_pattern");
    const matches: string[] = [];
    for (const entry of regexEntries) {
      try {
        const regex = new RegExp(entry.value, "gi");
        const found = regexTest.text.match(regex);
        if (found) {
          matches.push(`"${entry.value}" matched: ${found.join(", ")}`);
        }
      } catch {
        // skip invalid regex
      }
    }
    // Also test exact phrases
    const exactEntries = entries.filter((e) => e.entryType === "exact_phrase");
    const lower = regexTest.text.toLowerCase();
    for (const entry of exactEntries) {
      if (lower.includes(entry.value.toLowerCase())) {
        matches.push(`"${entry.value}" (exact match)`);
      }
    }
    setRegexTest({
      ...regexTest,
      results: matches.length > 0 ? matches.join("\n") : "No matches found.",
    });
  }

  function handleDocTypeToggle(docType: string) {
    setForm((prev) => {
      const current = prev.documentTypes;
      if (docType === "all") return { ...prev, documentTypes: ["all"] };
      const withoutAll = current.filter((d) => d !== "all");
      const has = withoutAll.includes(docType);
      const next = has
        ? withoutAll.filter((d) => d !== docType)
        : [...withoutAll, docType];
      return { ...prev, documentTypes: next.length === 0 ? ["all"] : next };
    });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phrase Library</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} entr{total !== 1 ? "ies" : "y"} total
            {reviewCount > 0 && (
              <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                {reviewCount} pending review
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRegexTester(!showRegexTester)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {showRegexTester ? "Hide Tester" : "Regex Tester"}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Entry
          </button>
        </div>
      </div>

      {/* Regex tester */}
      {showRegexTester && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold">Pattern Tester</h3>
          <p className="text-xs text-gray-500">
            Paste text to see which library entries fire against it.
          </p>
          <textarea
            value={regexTest.text}
            onChange={(e) => setRegexTest({ ...regexTest, text: e.target.value })}
            rows={4}
            placeholder="Paste sample text here..."
            className="mt-2 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={runRegexTest}
            className="mt-2 rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Test
          </button>
          {regexTest.results && (
            <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-3 text-xs text-gray-700 border border-gray-200">
              {regexTest.results}
            </pre>
          )}
        </div>
      )}

      {/* Add entry form */}
      {showAdd && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold">New Library Entry</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Type</label>
              <select
                value={form.entryType}
                onChange={(e) => setForm({ ...form, entryType: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600">
                Value {form.entryType === "regex_pattern" ? "(regex)" : "(phrase or pattern id)"}
              </label>
              <input
                type="text"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Document Types</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DOC_TYPES.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDocTypeToggle(d)}
                    className={`rounded px-2 py-0.5 text-xs ${
                      form.documentTypes.includes(d)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600">
                Explanation (shown to users)
              </label>
              <input
                type="text"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600">
                Notes (admin only, optional)
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={addEntry}
              disabled={saving || !form.value || !form.explanation}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Entry"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                resetForm();
              }}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setOffset(0); }}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="under_review">Under review</option>
          <option value="retired">Retired</option>
        </select>
        <select
          value={filters.entryType}
          onChange={(e) => { setFilters({ ...filters, entryType: e.target.value }); setOffset(0); }}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setOffset(0); }}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(e) => { setFilters({ ...filters, source: e.target.value }); setOffset(0); }}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="user_derived">User derived</option>
          <option value="ai_proposed">AI proposed</option>
        </select>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setOffset(0); }}
          placeholder="Search value..."
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        {reviewCount > 0 && !filters.status && (
          <button
            onClick={() => setFilters({ ...filters, status: "under_review" })}
            className="rounded bg-orange-100 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-200"
          >
            Show {reviewCount} pending review
          </button>
        )}
      </div>

      {/* Entry table */}
      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Value</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Severity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Flags</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Accept %</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className={
                  entry.status === "under_review"
                    ? "bg-orange-50/50"
                    : entry.status === "retired"
                      ? "opacity-50"
                      : ""
                }
              >
                <td className="max-w-xs truncate px-3 py-2 font-mono text-xs">
                  {entry.value}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {entry.entryType.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {entry.category.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_COLORS[entry.severity]}`}
                  >
                    {entry.severity}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[entry.status]}`}
                  >
                    {entry.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">
                  {entry.flagCount}
                </td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">
                  {entry.acceptanceRate != null
                    ? `${Math.round(entry.acceptanceRate * 100)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {entry.status === "under_review" && (
                      <>
                        <button
                          onClick={() =>
                            updateEntry(entry.id, { status: "active" })
                          }
                          className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            updateEntry(entry.id, { status: "retired" })
                          }
                          className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {entry.status === "active" && (
                      <button
                        onClick={() =>
                          updateEntry(entry.id, { status: "retired" })
                        }
                        className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                      >
                        Retire
                      </button>
                    )}
                    {entry.status === "retired" && (
                      <button
                        onClick={() =>
                          updateEntry(entry.id, { status: "active" })
                        }
                        className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200"
                      >
                        Reactivate
                      </button>
                    )}
                    <button
                      onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                    >
                      Edit
                    </button>
                  </div>
                  {editingId === entry.id && (
                    <EditEntryInline
                      entry={entry}
                      onSave={(updates) => updateEntry(entry.id, updates)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">
            No entries match the current filters.
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>{total} result{total !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30"
            >
              Prev
            </button>
            <span>
              Page {Math.floor(offset / PAGE_SIZE) + 1} of{" "}
              {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditEntryInline({
  entry,
  onSave,
  onCancel,
}: {
  entry: LibraryEntry;
  onSave: (updates: Partial<LibraryEntry>) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(entry.value);
  const [explanation, setExplanation] = useState(entry.explanation);
  const [severity, setSeverity] = useState(entry.severity);
  const [notes, setNotes] = useState(entry.notes || "");

  return (
    <div className="mt-2 space-y-2 rounded border border-gray-200 bg-white p-3 text-left">
      <div>
        <label className="text-xs font-medium text-gray-500">Value</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">Explanation</label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="flex gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "high" | "medium" | "low")}
            className="mt-0.5 block rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-xs"
          />
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onSave({ value, explanation, severity, notes })}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
