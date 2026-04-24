"use client";

import { useState, useEffect, useCallback } from "react";

interface VerificationData {
  verdict: "verified" | "wrong_details" | "unverified" | "uncertain";
  confidence: number;
  explanation: string;
  correctCitation: string | null;
  sourceUrl: string | null;
}

interface Citation {
  id: string;
  rawText: string;
  style: string;
  structuralFlags: { type: string; message: string; severity: "error" | "warning" }[] | null;
  verificationFlags: VerificationData | null;
  status: string;
  userAction: string | null;
  correctedText: string | null;
}

const STYLES = [
  {
    value: "apa", label: "APA", fullName: "American Psychological Association",
    usedBy: "Psychology, education, social sciences",
    inlineExample: '(Jewkes, 2015, p. 42)',
    refExample: 'Jewkes, Y. (2015). Media and crime (3rd ed.). Sage Publications.',
  },
  {
    value: "harvard", label: "Harvard", fullName: "Harvard Referencing",
    usedBy: "Business, humanities, social sciences (UK/Australia)",
    inlineExample: '(Jewkes 2015, p. 42)',
    refExample: 'Jewkes, Y 2015, Media and crime, 3rd edn, Sage Publications, London.',
  },
  {
    value: "mla", label: "MLA", fullName: "Modern Language Association",
    usedBy: "Literature, arts, humanities",
    inlineExample: '(Jewkes 42)',
    refExample: 'Jewkes, Yvonne. Media and Crime. 3rd ed., Sage Publications, 2015.',
  },
  {
    value: "chicago", label: "Chicago", fullName: "Chicago Manual of Style",
    usedBy: "History, arts, some social sciences",
    inlineExample: '1. (footnote number)',
    refExample: 'Jewkes, Yvonne. Media and Crime. 3rd ed. London: Sage Publications, 2015.',
  },
  {
    value: "oxford", label: "Oxford", fullName: "Oxford Referencing (Documentary-Note)",
    usedBy: "History, philosophy, law (some UK universities)",
    inlineExample: '1 (footnote number)',
    refExample: 'Yvonne Jewkes, Media and Crime, 3rd edn (London: Sage Publications, 2015), p. 42.',
  },
  {
    value: "bluebook", label: "Bluebook", fullName: "Bluebook Legal Citation",
    usedBy: "US law journals and legal writing",
    inlineExample: 'See Jewkes, supra note 3, at 42.',
    refExample: 'Yvonne Jewkes, Media and Crime 42 (3d ed. 2015).',
  },
  {
    value: "oscola", label: "OSCOLA", fullName: "Oxford Standard for Citation of Legal Authorities",
    usedBy: "UK law schools and legal journals",
    inlineExample: '1 (footnote number)',
    refExample: 'Yvonne Jewkes, Media and Crime (3rd edn, Sage 2015) 42.',
  },
  {
    value: "business", label: "Business", fullName: "Business / Report Style",
    usedBy: "Corporate reports, business documents",
    inlineExample: '(Jewkes, 2015)',
    refExample: 'Jewkes, Y. (2015) Media and Crime, 3rd edition, Sage Publications.',
  },
];

interface SectionData {
  id: string;
  index: number;
  currentText: string;
  isLocked: boolean;
}

interface CitationsPageProps {
  documentId: string;
  sections?: SectionData[];
  onScoreUpdate?: (score: number) => void;
  onScrollToText?: (text: string) => void;
}

export default function CitationsPage({ documentId, sections, onScoreUpdate, onScrollToText }: CitationsPageProps) {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [targetStyle, setTargetStyle] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const loadCitations = useCallback(async () => {
    const res = await fetch(`/api/citations?documentId=${documentId}`);
    const json = await res.json();
    if (json.success) setCitations(json.data);
    setLoading(false);
  }, [documentId]);

  useEffect(() => { loadCitations(); }, [loadCitations]);

  async function runStructuralCheck() {
    setChecking(true);
    const res = await fetch("/api/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "structural_check", documentId }),
    });
    const json = await res.json();
    if (json.success) {
      setCitations(json.data);
      if (json.score != null && onScoreUpdate) onScoreUpdate(json.score);
    }
    setChecking(false);
  }

  async function runVerification() {
    setVerifying(true);
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_all", documentId }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.data?.score != null && onScoreUpdate) onScoreUpdate(json.data.score);
        // Reload citations to pick up verification flags
        await loadCitations();
      }
    } catch (err) {
      console.error("Verification error:", err);
    }
    setVerifying(false);
  }

  async function handleResolve(citationId: string, userAction: string, correctedText?: string) {
    const res = await fetch("/api/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", citationId, userAction, correctedText }),
    });
    const json = await res.json();
    if (json.score != null && onScoreUpdate) onScoreUpdate(json.score);
    setCitations((prev) => prev.map((c) =>
      c.id === citationId
        ? { ...c, status: userAction === "dismissed" ? "dismissed" : "resolved", userAction, correctedText: correctedText ?? c.correctedText }
        : c
    ));
    setEditingId(null);
    setEditText("");
  }

  async function handleConvertAll() {
    if (!targetStyle) return;
    const confirmed = window.confirm(`Convert all citations to ${STYLES.find((s) => s.value === targetStyle)?.label}? This will modify the document text.`);
    if (!confirmed) return;

    setConverting(true);
    const res = await fetch("/api/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convert_all", documentId, targetStyle }),
    });
    const json = await res.json();
    if (json.success) {
      setCitations(json.data.citations);
      if (json.data.score != null && onScoreUpdate) onScoreUpdate(json.data.score);
    }
    setConverting(false);
  }

  function findContext(rawText: string): { before: string; match: string; after: string; sectionIndex: number } | null {
    if (!sections) return null;
    for (const sec of sections) {
      const idx = sec.currentText.indexOf(rawText);
      if (idx < 0) continue;
      // Find the full paragraph containing this citation
      const paragraphs = sec.currentText.split(/\n\n/);
      let offset = 0;
      for (const para of paragraphs) {
        if (idx >= offset && idx < offset + para.length) {
          const matchStart = idx - offset;
          return {
            before: para.slice(0, matchStart),
            match: rawText,
            after: para.slice(matchStart + rawText.length),
            sectionIndex: sec.index,
          };
        }
        offset += para.length + 2;
      }
    }
    return null;
  }

  function handleSelectCitation(c: Citation) {
    const newId = selectedId === c.id ? null : c.id;
    setSelectedId(newId);
    if (onScrollToText) {
      onScrollToText(newId ? c.rawText : "");
    }
  }

  const detectedStyle = citations.length > 0
    ? STYLES.find((s) => s.value === citations[0].style)?.label ?? citations[0].style
    : "Unknown";

  const issueCount = citations.filter((c) => {
    const flags = c.structuralFlags ?? [];
    return flags.length > 0 && c.status === "open";
  }).length;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p className="text-xs text-gray-400">Loading citations...</p></div>;
  }

  return (
    <div className="h-full overflow-auto p-5 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold">Citations</h2>
        {citations.length > 0 ? (
          <p className="mt-1 text-xs text-gray-500">
            <strong>{citations.length}</strong> citation{citations.length !== 1 ? "s" : ""} found
            {" "}&middot; Style: <strong>{detectedStyle}</strong>
            {issueCount > 0 && <> &middot; <span className="text-amber-600"><strong>{issueCount}</strong> structural issue{issueCount !== 1 ? "s" : ""}</span></>}
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">No citations extracted yet.</p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            onClick={runStructuralCheck}
            disabled={checking}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {checking ? "Checking..." : citations.length > 0 ? "Re-check" : "Extract Citations"}
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-gray-400 italic">To verify citations against web sources, choose Citations after selecting the Scan button.</p>
        <div className="mt-2 flex gap-2">
          {citations.length > 0 && (
            <button
              onClick={runVerification}
              disabled={verifying || checking}
              className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
            >
              {verifying ? "Verifying..." : "Verify All Sources"}
            </button>
          )}
        </div>
        {verifying && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-purple-600">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
            Searching the web to verify each citation...
          </div>
        )}
      </div>

      {/* Style Conversion — collapsible */}
      {citations.length > 0 && (
        <details className="rounded-lg border border-gray-200 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer select-none flex items-center justify-between bg-gray-50 hover:bg-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-700">Citation Style</h3>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">{detectedStyle}</span>
            </div>
            <span className="text-[9px] text-gray-400">Click to change style</span>
          </summary>
          <div className="p-4 border-t border-gray-100 space-y-3">
            <p className="text-[10px] text-gray-400">
              Currently using <strong>{detectedStyle}</strong>. Select a different style and click each to see examples of what it looks like.
            </p>

            <div className="space-y-2">
              {STYLES.map((s) => {
                const isCurrent = citations[0]?.style === s.value;
                const isSelected = targetStyle === s.value;
                return (
                  <details key={s.value} className={`rounded-lg border overflow-hidden ${
                    isCurrent ? "border-green-300 bg-green-50" :
                    isSelected ? "border-purple-400 bg-purple-50 ring-1 ring-purple-400" :
                    "border-gray-200 hover:border-gray-300"
                  }`}>
                    <summary className="px-3 py-2 cursor-pointer select-none flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="h-3 w-3 text-gray-400 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        <span className="text-xs font-semibold text-gray-700">{s.label}</span>
                        {isCurrent && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[8px] font-semibold text-green-700">current</span>}
                        {isSelected && !isCurrent && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[8px] font-semibold text-purple-700">selected</span>}
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTargetStyle(s.value); }}
                          disabled={converting}
                          className={`rounded px-2 py-0.5 text-[9px] font-medium ${
                            isSelected ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </button>
                      )}
                    </summary>
                    <div className="px-3 py-2 bg-white border-t border-gray-100 space-y-1.5">
                      <p className="text-[10px] text-gray-500">{s.fullName}</p>
                      <p className="text-[9px] text-gray-400">Used by: {s.usedBy}</p>
                      <div className="rounded bg-gray-50 p-2 space-y-1">
                        <p className="text-[9px] text-gray-500 font-medium">In-text example:</p>
                        <p className="text-[10px] font-mono text-gray-700">{s.inlineExample}</p>
                        <p className="text-[9px] text-gray-500 font-medium mt-1">Reference list example:</p>
                        <p className="text-[10px] font-mono text-gray-700 leading-relaxed">{s.refExample}</p>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            {targetStyle && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleConvertAll}
                  disabled={converting}
                  className="rounded bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
                >
                  {converting ? "Converting..." : `Convert All to ${STYLES.find((s) => s.value === targetStyle)?.label}`}
                </button>
                <button
                  onClick={() => setTargetStyle("")}
                  className="text-[10px] text-gray-500 hover:text-gray-700"
                >
                Cancel
              </button>
            </div>
          )}

            {converting && (
              <div className="flex items-center gap-2 text-[10px] text-purple-600">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                Converting citations via AI — this may take a moment...
              </div>
            )}
          </div>
        </details>
      )}

      {/* Citation List */}
      {citations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">All Citations</h3>
          {citations.map((c, i) => {
            const flags = c.structuralFlags ?? [];
            const isEditing = editingId === c.id;
            const isInline = c.rawText.length <= 40;

            const isSelected = selectedId === c.id;
            const context = isSelected ? findContext(c.rawText) : null;

            return (
              <div key={c.id} className={`rounded-lg border overflow-hidden transition-colors ${
                isSelected ? "border-blue-400 ring-1 ring-blue-400" :
                c.status === "dismissed" ? "border-gray-200 bg-gray-50 opacity-60" :
                c.status === "resolved" ? "border-green-200 bg-green-50" :
                flags.length > 0 ? "border-amber-200 bg-amber-50" :
                "border-gray-200 hover:border-gray-300"
              }`}>
                {/* Clickable header */}
                <button
                  onClick={() => handleSelectCitation(c)}
                  className="w-full text-left px-3 py-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">#{i + 1}</span>
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-gray-100 text-gray-600">{isInline ? "inline" : "reference"}</span>
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-700">{c.style.toUpperCase()}</span>
                      {c.status === "resolved" && <span className="text-[9px] text-green-600">resolved</span>}
                      {c.status === "dismissed" && <span className="text-[9px] text-gray-400">dismissed</span>}
                      {c.verificationFlags && (
                        <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${
                          c.verificationFlags.verdict === "verified" ? "bg-green-100 text-green-700" :
                          c.verificationFlags.verdict === "wrong_details" ? "bg-amber-100 text-amber-700" :
                          c.verificationFlags.verdict === "unverified" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {c.verificationFlags.verdict === "verified" ? "Verified" :
                           c.verificationFlags.verdict === "wrong_details" ? "Wrong Details" :
                           c.verificationFlags.verdict === "unverified" ? "Not Found" :
                           "Uncertain"}
                        </span>
                      )}
                    </div>
                    <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isSelected ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </div>
                  <p className="text-xs text-gray-800 font-mono leading-relaxed">{c.correctedText ?? c.rawText}</p>
                  {flags.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {flags.map((f, fi) => (
                        <p key={fi} className={`text-[10px] ${f.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
                          {f.severity === "error" ? "Error" : "Warning"}: {f.message}
                        </p>
                      ))}
                    </div>
                  )}
                </button>

                {/* Expanded detail — context in document */}
                {isSelected && (
                  <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 space-y-3">
                    {/* Context in document */}
                    {context ? (
                      <div>
                        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">In document (section {context.sectionIndex + 1})</p>
                        <div className="rounded border border-gray-200 bg-white p-2.5">
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {context.before.length > 0 && <span className="text-gray-500">{context.before}</span>}
                            <mark className="rounded bg-blue-200 px-0.5 text-gray-900 font-medium">{context.match}</mark>
                            {context.after.length > 0 && <span className="text-gray-500">{context.after}</span>}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 italic">Could not locate this citation in the current document text.</p>
                    )}

                    {/* Verification results */}
                    {c.verificationFlags && (
                      <div className={`rounded-lg border p-2.5 ${
                        c.verificationFlags.verdict === "verified" ? "border-green-200 bg-green-50" :
                        c.verificationFlags.verdict === "wrong_details" ? "border-amber-200 bg-amber-50" :
                        c.verificationFlags.verdict === "unverified" ? "border-red-200 bg-red-50" :
                        "border-gray-200 bg-gray-50"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold ${
                            c.verificationFlags.verdict === "verified" ? "text-green-700" :
                            c.verificationFlags.verdict === "wrong_details" ? "text-amber-700" :
                            c.verificationFlags.verdict === "unverified" ? "text-red-700" :
                            "text-gray-600"
                          }`}>
                            {c.verificationFlags.verdict === "verified" ? "Source Verified" :
                             c.verificationFlags.verdict === "wrong_details" ? "Details Don't Match" :
                             c.verificationFlags.verdict === "unverified" ? "Source Not Found" :
                             "Uncertain"}
                          </span>
                          <span className="text-[8px] text-gray-400">{Math.round(c.verificationFlags.confidence * 100)}% confidence</span>
                        </div>
                        <p className="text-[10px] text-gray-600">{c.verificationFlags.explanation}</p>
                        {c.verificationFlags.correctCitation && (
                          <div className="mt-1.5 rounded bg-white border border-gray-200 p-2">
                            <p className="text-[9px] text-gray-500 font-medium mb-0.5">Suggested correction:</p>
                            <p className="text-[10px] font-mono text-gray-700">{c.verificationFlags.correctCitation}</p>
                          </div>
                        )}
                        {c.verificationFlags.sourceUrl && (
                          <a href={c.verificationFlags.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[9px] text-blue-600 hover:underline truncate">
                            {c.verificationFlags.sourceUrl}
                          </a>
                        )}
                      </div>
                    )}

                    {/* Edit mode */}
                    {isEditing && (
                      <div>
                        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Edit citation</p>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono"
                        />
                        <div className="mt-1 flex gap-1">
                          <button onClick={() => handleResolve(c.id, "edited", editText)} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white">Save</button>
                          <button onClick={() => { setEditingId(null); setEditText(""); }} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {c.status === "open" && !isEditing && (
                      <div className="flex gap-1">
                        <button onClick={() => handleResolve(c.id, "accepted")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white">Accept</button>
                        <button onClick={() => { setEditingId(c.id); setEditText(c.rawText); }} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white">Edit</button>
                        <button onClick={() => handleResolve(c.id, "verified")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white">Verify</button>
                        <button onClick={() => handleResolve(c.id, "dismissed")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-white">Dismiss</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
