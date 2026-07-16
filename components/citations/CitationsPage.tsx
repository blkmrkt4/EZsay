"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AuditSummary from "./AuditSummary";
import CorrectedList from "./CorrectedList";
import {
  type Citation,
  isNotFoundVerdict,
  bucketOf,
  BUCKET_ORDER,
  proposedFixOf,
  QUOTE_VERDICT_DISPLAY,
} from "./types";

const QUOTE_TONE_CLASSES: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-gray-100 text-gray-500",
};

const FIELD_LABELS: { key: "author" | "year" | "title" | "source"; label: string }[] = [
  { key: "author", label: "Author" },
  { key: "year", label: "Year" },
  { key: "title", label: "Title" },
  { key: "source", label: "Source" },
];

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
  const [verifyProgress, setVerifyProgress] = useState<{ done: number; total: number } | null>(null);
  const [quoteVerifying, setQuoteVerifying] = useState(false);
  const [quoteProgress, setQuoteProgress] = useState<{ done: number; total: number } | null>(null);
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

  // The structural check is instant, LLM-free, and preserves verification
  // verdicts and user resolutions — so it runs automatically once per tab
  // open, keeping formatting/cross-reference findings in step with the
  // document as currently edited.
  const autoCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    loadCitations().then(() => {
      if (autoCheckedFor.current === documentId) return;
      autoCheckedFor.current = documentId;
      runStructuralCheck();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCitations, documentId]);

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
    setVerifyProgress(null);
    try {
      // Batch loop: the server verifies a few entries per request (Vercel
      // function cap), we keep calling until none remain. reset=true on the
      // first call clears previous verdicts for a full re-check.
      let reset = true;
      for (let guard = 0; guard < 60; guard++) {
        const res = await fetch("/api/citations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify_batch", documentId, reset }),
        });
        reset = false;
        const json = await res.json();
        if (!json.success) break;
        const { remaining, total, score } = json.data;
        setVerifyProgress({ done: total - remaining, total });
        await loadCitations(); // stream verdicts into the UI as they land
        if (remaining === 0) {
          if (score != null && onScoreUpdate) onScoreUpdate(score);
          break;
        }
      }
    } catch (err) {
      console.error("Verification error:", err);
    }
    setVerifying(false);
    setVerifyProgress(null);
  }

  async function runQuoteVerification() {
    setQuoteVerifying(true);
    setQuoteProgress(null);
    try {
      let reset = true;
      for (let guard = 0; guard < 60; guard++) {
        const res = await fetch("/api/citations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify_quotes", documentId, reset }),
        });
        reset = false;
        const json = await res.json();
        if (!json.success) break;
        const { remaining, total, score } = json.data;
        setQuoteProgress({ done: total - remaining, total });
        await loadCitations();
        if (remaining === 0) {
          if (score != null && onScoreUpdate) onScoreUpdate(score);
          break;
        }
      }
    } catch (err) {
      console.error("Quote verification error:", err);
    }
    setQuoteVerifying(false);
    setQuoteProgress(null);
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

  // Reference-list entries vs document-wide findings (flagged in-text
  // citations and quotes). Legacy rows without entryType count as entries.
  // All quotes are stored server-side as the quote-check queue, but a healthy
  // quote with no verification result yet is noise — hide it.
  const refEntries = citations.filter((c) => !c.entryType || c.entryType === "reference_entry");
  const docFindings = citations.filter(
    (c) =>
      c.entryType === "inline" ||
      (c.entryType === "quote" && (((c.structuralFlags?.length ?? 0) > 0) || c.verificationFlags != null)),
  );
  const quoteCount = citations.filter((c) => c.entryType === "quote").length;

  // Audit ordering: most severe first (fabricated → needs correction →
  // uncertain → unchecked → verified). The corrected list keeps the
  // document's original reference order.
  const auditOrdered = [...refEntries].sort(
    (a, b) => BUCKET_ORDER.indexOf(bucketOf(a)) - BUCKET_ORDER.indexOf(bucketOf(b)),
  );

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
          <p className="mt-1 text-xs text-gray-400">{checking ? "Checking your document for citations…" : "No citations detected in this document."}</p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
          <button
            onClick={runStructuralCheck}
            disabled={checking || verifying || quoteVerifying}
            title="Re-reads your edited document and refreshes the formatting and cross-reference findings. Verification results are kept."
            className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <span className={checking ? "inline-block animate-spin" : ""}>&#8635;</span>
            {checking ? "Checking formatting…" : "Re-check formatting"}
          </button>
          <span>Formatting and cross-references re-check automatically when you open this tab.</span>
        </p>
        {citations.length > 0 && (
          <p className="mt-2 text-[10px] text-gray-500">
            Two checks need you: first whether your sources exist, then whether your quotes hold up.
          </p>
        )}
        <div className="mt-2 grid max-w-2xl gap-2 sm:grid-cols-2">
          {citations.length > 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <button
                onClick={runVerification}
                disabled={verifying || checking || quoteVerifying}
                className="w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
              >
                {verifying ? "Verifying..." : "Verify sources are real"}
              </button>
              <p className="mt-1.5 text-[10px] leading-snug text-gray-500">
                Searches the web for each reference to confirm it exists and the author, year, and title match. Catches invented references. Takes a few minutes.
              </p>
            </div>
          )}
          {quoteCount > 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <button
                onClick={runQuoteVerification}
                disabled={verifying || checking || quoteVerifying}
                className="w-full rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {quoteVerifying ? "Checking quotes..." : `Check quotes against sources (${quoteCount})`}
              </button>
              <p className="mt-1.5 text-[10px] leading-snug text-gray-500">
                Finds each quotation&apos;s source and checks it appears there — and that your sentence fairly represents it. Run after verifying sources.
              </p>
            </div>
          )}
        </div>
        {verifying && (
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-purple-600">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
              {verifyProgress
                ? `Verifying sources… ${verifyProgress.done} of ${verifyProgress.total}`
                : "Searching the web to verify each citation..."}
            </div>
            {verifyProgress && verifyProgress.total > 0 && (
              <div className="h-1 w-48 overflow-hidden rounded-full bg-purple-100">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${Math.round((verifyProgress.done / verifyProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {quoteVerifying && (
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-indigo-600">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              {quoteProgress
                ? `Checking quotes against sources… ${quoteProgress.done} of ${quoteProgress.total}`
                : "Fetching sources to check each quote..."}
            </div>
            {quoteProgress && quoteProgress.total > 0 && (
              <div className="h-1 w-48 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.round((quoteProgress.done / quoteProgress.total) * 100)}%` }}
                />
              </div>
            )}
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

      {/* Audit summary — verdict counts with entry names */}
      {refEntries.length > 0 && <AuditSummary entries={refEntries} />}

      {/* Document-wide findings — flagged in-text citations and quotes.
          These come from cross-referencing the whole document (citation graph),
          not from checking individual reference entries. */}
      {docFindings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Document-Wide Findings</h3>
          <p className="text-[10px] text-gray-400">
            Issues found by cross-referencing the body text against the reference list.
          </p>
          {docFindings.map((c) => {
            const flags = c.structuralFlags ?? [];
            const resolvedOut = c.status !== "open";
            const quoteCheck = c.entryType === "quote" ? c.verificationFlags : null;
            const quoteDisplay = quoteCheck ? QUOTE_VERDICT_DISPLAY[quoteCheck.verdict] : null;
            const isBadQuote =
              quoteCheck?.verdict === "quote_not_found" || quoteCheck?.verdict === "quote_misrepresented";
            return (
              <div
                key={c.id}
                className={`rounded-lg border overflow-hidden ${
                  resolvedOut ? "border-gray-200 bg-gray-50 opacity-60" :
                  isBadQuote || flags.some((f) => f.severity === "error") ? "border-red-200 bg-red-50" :
                  quoteCheck?.verdict === "quote_verified" && flags.length === 0 ? "border-green-200 bg-green-50" :
                  "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-gray-100 text-gray-600">
                      {c.entryType === "quote" ? "quote" : "in-text citation"}
                    </span>
                    {quoteDisplay && (
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${QUOTE_TONE_CLASSES[quoteDisplay.tone]}`}>
                        {quoteDisplay.label}
                      </span>
                    )}
                    {resolvedOut && (
                      <span className="text-[9px] text-gray-400">
                        {c.status === "dismissed" ? "dismissed" : "resolved"}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onScrollToText?.(c.entryType === "quote" ? c.rawText : c.rawText)}
                    className="text-left w-full"
                    title="Locate in document"
                  >
                    <p className="text-xs text-gray-800 font-mono leading-relaxed">
                      {c.entryType === "quote" ? `“${c.rawText}”` : c.rawText}
                    </p>
                  </button>
                  {c.contextSentence && (
                    <p className="mt-1 text-[10px] text-gray-500 italic leading-relaxed">…{c.contextSentence}…</p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {flags.map((f, fi) => (
                      <p key={fi} className={`text-[10px] ${f.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
                        {f.severity === "error" ? "Error" : "Warning"}: {f.message}
                      </p>
                    ))}
                  </div>
                  {/* Quote-check result: verdict explanation, the source's
                      actual argument, a faithful rewrite, and the source link */}
                  {quoteCheck && (
                    <div className="mt-1.5 space-y-1 rounded border border-gray-200 bg-white/70 px-2 py-1.5">
                      <p className="text-[10px] text-gray-600">{quoteCheck.explanation}</p>
                      {quoteCheck.actualArgument && (
                        <p className="text-[10px] text-gray-700">
                          <span className="font-semibold">Source actually says:</span> {quoteCheck.actualArgument}
                        </p>
                      )}
                      {quoteCheck.suggestedRewrite && (
                        <p className="text-[10px] text-green-700">
                          <span className="font-semibold">Faithful rewrite:</span> {quoteCheck.suggestedRewrite}
                        </p>
                      )}
                      {quoteCheck.sourceUrl && (
                        <a
                          href={quoteCheck.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[9px] text-blue-600 hover:underline"
                        >
                          {quoteCheck.sourceUrl}
                        </a>
                      )}
                    </div>
                  )}
                  {c.status === "open" && (
                    <div className="mt-1.5 flex gap-1">
                      <button
                        onClick={() => handleResolve(c.id, "verified")}
                        className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white"
                        title="I've fixed this in the document"
                      >
                        Mark Fixed
                      </button>
                      <button
                        onClick={() => handleResolve(c.id, "dismissed")}
                        className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-white"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Citation List — audit order, most severe first */}
      {refEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Reference Entries</h3>
          {auditOrdered.map((c, i) => {
            const flags = c.structuralFlags ?? [];
            const isEditing = editingId === c.id;
            const isInline = c.entryType ? false : c.rawText.length <= 40;

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
                          isNotFoundVerdict(c.verificationFlags.verdict) ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {c.verificationFlags.verdict === "verified" ? "Verified" :
                           c.verificationFlags.verdict === "wrong_details" ? "Wrong Details" :
                           isNotFoundVerdict(c.verificationFlags.verdict) ? "Likely Fabricated" :
                           "Uncertain"}
                        </span>
                      )}
                    </div>
                    <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isSelected ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </div>
                  {c.status === "open" && proposedFixOf(c) ? (
                    /* BEFORE / AFTER — a fix is proposed but not yet accepted */
                    <div className="space-y-1">
                      <div className="rounded border border-red-200 bg-red-50/60 px-2 py-1">
                        <span className="mr-1.5 text-[8px] font-semibold uppercase tracking-wider text-red-400">Before</span>
                        <span className="text-xs font-mono leading-relaxed text-gray-700">{c.rawText}</span>
                      </div>
                      <div className="rounded border border-green-200 bg-green-50/60 px-2 py-1">
                        <span className="mr-1.5 text-[8px] font-semibold uppercase tracking-wider text-green-500">After</span>
                        <span className="text-xs font-mono leading-relaxed text-gray-800">{proposedFixOf(c)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-800 font-mono leading-relaxed">
                      {(c.status !== "open" && c.correctedText) || c.rawText}
                    </p>
                  )}
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
                        isNotFoundVerdict(c.verificationFlags.verdict) ? "border-red-200 bg-red-50" :
                        "border-gray-200 bg-gray-50"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold ${
                            c.verificationFlags.verdict === "verified" ? "text-green-700" :
                            c.verificationFlags.verdict === "wrong_details" ? "text-amber-700" :
                            isNotFoundVerdict(c.verificationFlags.verdict) ? "text-red-700" :
                            "text-gray-600"
                          }`}>
                            {c.verificationFlags.verdict === "verified" ? "Source Verified" :
                             c.verificationFlags.verdict === "wrong_details" ? "Details Don't Match" :
                             isNotFoundVerdict(c.verificationFlags.verdict) ? "Likely Fabricated — No Matching Source Found" :
                             "Uncertain"}
                          </span>
                          <span className="text-[8px] text-gray-400">{Math.round(c.verificationFlags.confidence * 100)}% confidence</span>
                        </div>
                        {/* Field-level diff: author / year / title / source checked independently */}
                        {c.verificationFlags.fields && (
                          <div className="mb-1.5 flex flex-wrap gap-1">
                            {FIELD_LABELS.map(({ key, label }) => {
                              const f = c.verificationFlags!.fields![key];
                              if (!f || f.status === "unknown") return null;
                              return (
                                <span
                                  key={key}
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                    f.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                  }`}
                                  title={f.correct ? `Correct value: ${f.correct}` : undefined}
                                >
                                  {f.status === "ok" ? "✓" : "✗"} {label}
                                  {f.status === "wrong" && f.correct && (
                                    <span className="font-normal">→ {f.correct.slice(0, 40)}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {c.verificationFlags.plausibilityNote && (
                          <p className="mb-1 text-[10px] italic text-amber-700">⚠ {c.verificationFlags.plausibilityNote}</p>
                        )}
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
                        {proposedFixOf(c) ? (
                          <button
                            onClick={() => handleResolve(c.id, "accepted", proposedFixOf(c)!)}
                            className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700"
                            title="Apply the suggested correction to your document"
                          >
                            Accept Fix
                          </button>
                        ) : (
                          <button onClick={() => handleResolve(c.id, "accepted")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white">Accept</button>
                        )}
                        <button onClick={() => { setEditingId(c.id); setEditText(proposedFixOf(c) ?? c.rawText); }} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white">Edit</button>
                        <button onClick={() => handleResolve(c.id, "verified")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-white" title="Mark as verified without changing the text">Verify</button>
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

      {/* Corrected reference list — assembled only from accepted fixes */}
      {refEntries.length > 0 && <CorrectedList entries={refEntries} />}
    </div>
  );
}
