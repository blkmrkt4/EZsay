"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import AnalysisPanel from "@/components/results/AnalysisPanel";
import { detectArtifacts, type ArtifactFinding } from "@/lib/analysis/artifact-detector";
import { calculateWritingQuality, findComplexSentences } from "@/lib/analysis/quality-scorer";
import { getRemovalDescription } from "@/lib/analysis/artifact-removals";
import CitationsPage from "@/components/citations/CitationsPage";
import CommandCapsule from "@/components/editor/CommandCapsule";
import LogoutButton from "@/components/auth/LogoutButton";
import HeatmapScrollbar, { type HeatmapTick } from "@/components/editor/HeatmapScrollbar";
import DiffDocPanel from "@/components/editor/DiffDocPanel";
import DiffEditPanel from "@/components/editor/DiffEditPanel";
import DiffChoicesPanel from "@/components/editor/DiffChoicesPanel";
import { trackEvent } from "@/lib/events/track-client";
import { wordDiff, alignOptions, type AlignBlock } from "@/lib/analysis/word-diff";
import StyleSettingsPanel from "@/components/style-settings/StyleSettingsPanel";
import WorkspaceModeStrip from "@/components/editor/WorkspaceModeStrip";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  title: string;
  documentType: string;
  status: string;
  aiRiskScore: number | null;
  writingQualityScore: number | null;
  aiArtifactScore: number | null;
  citationsScore: number | null;
  toneConsistencyScore: number | null;
  plagiarismScore: number | null;
  spellingResults: unknown;
  grammarResults: unknown;
  extractionMeta: {
    sourceType: "pdf" | "docx" | "txt" | "pasted";
    confidence: "high" | "medium" | "low";
    likelyGraphicsHeavy: boolean;
    pageCount?: number;
    pagesWithText?: number;
    extractedWordCount?: number;
    averageWordsPerPage?: number;
    coverageRatio?: number;
  } | null;
  spellingScore: number | null;
  grammarScore: number | null;
  lastScanLevel: string | null;
  lastScanSensitivity: string | null;
  lastScanAt: string | null;
  createdAt: string;
  versionCount: number;
  firstVersionDate: string | null;
  lastVersionDate: string | null;
}

interface Section {
  id: string;
  index: number;
  rawText: string;
  currentText: string;
  isLocked: boolean;
  flagCount: number;
  flagsResolved: number;
  aiSignalLevel: "high" | "medium" | "low" | "none";
}

interface Flag {
  id: string;
  sectionId: string;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
  explanation: string;
  patternType: string;
  status: string;
  metadata: unknown;
  acceptedOptionId: string | null;
  manualReplacement: string | null;
}

interface FlagOption {
  id: string;
  flagId: string;
  text: string;
  isBlend: boolean;
}

type ScanLevel = "surface" | "deep" | "plagiarism" | "citations" | "style-cleanup" | "comprehensive";
type NavItem = "library" | "workspace" | "style-rules" | "intake";
type WorkspaceMode = "dashboard" | "edit" | "review" | "citations";

interface PlagiarismResult {
  id: string;
  passageText: string;
  passageStart: number;
  passageEnd: number;
  searchQuery: string;
  verdict: string;
  explanation: string | null;
  confidence: number | null;
  topMatchUrl: string | null;
  topMatchTitle: string | null;
  topMatchSnippet: string | null;
  status: string;
  sectionId: string | null;
}

interface WritingQualityAdvisory {
  label: string;
  score: number;
  description: string;
  suggestion: string;
  examples?: string[];
}

type EditQueueItem =
  | { type: "ai_detection"; flag: Flag }
  | { type: "artifact_batch"; findings: ArtifactFinding[] }
  | { type: "artifact_individual"; flag: Flag }
  | { type: "writing_quality"; advisory: WritingQualityAdvisory }
  | { type: "plagiarism"; result: PlagiarismResult }
  | { type: "spelling_batch"; findings: import("@/lib/analysis/grammar-spelling-types").SpellingFinding[] }
  | { type: "grammar_batch"; findings: import("@/lib/analysis/grammar-spelling-types").GrammarFinding[] };

interface CitationStructuralFlag {
  type: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix?: string | null;
}

interface CitationSummary {
  id: string;
  rawText: string;
  correctedText: string | null;
  status: string;
  userAction: string | null;
  structuralFlags: CitationStructuralFlag[] | null;
  verificationFlags: { verdict?: string } | null;
}

const SCAN_LEVELS: { value: ScanLevel; label: string; desc: string; isUltimate?: boolean }[] = [
  { value: "surface", label: "Surface Scan", desc: "Common AI phrases and banned words" },
  { value: "deep", label: "Deep Scan", desc: "Adds structural patterns and sentence analysis" },
  { value: "plagiarism", label: "Plagiarism Scan", desc: "Check for plagiarism via web search" },
  { value: "citations", label: "Citation Scan", desc: "Verify and format-check citations" },
  { value: "style-cleanup", label: "Style Cleanup", desc: "Fix formatting artifacts from Style Rules" },
  { value: "comprehensive", label: "Comprehensive", desc: "Everything combined — the ultimate scan", isUltimate: true },
];

const DOC_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "legal", label: "Legal" },
];

const INTAKE_QUESTIONS = [
  {
    key: "audience" as const,
    title: "Who is this for?",
    subtitle: "Knowing your audience helps us suggest replacements that sound right for the reader.",
    options: [
      { value: "professor", label: "Professor / Marker" },
      { value: "client", label: "Client" },
      { value: "board", label: "Board / Executives" },
      { value: "team", label: "Internal team" },
      { value: "public", label: "Public audience" },
      { value: "peers", label: "Peers / Colleagues" },
    ],
  },
  {
    key: "purpose" as const,
    title: "What kind of document is this?",
    subtitle: "Different formats have different expectations for tone and structure.",
    options: [
      { value: "assignment", label: "Assignment / Essay" },
      { value: "thesis", label: "Thesis / Dissertation" },
      { value: "report", label: "Report / Analysis" },
      { value: "memo", label: "Memo / Brief" },
      { value: "proposal", label: "Proposal" },
      { value: "article", label: "Article / Blog post" },
      { value: "email", label: "Email / Letter" },
      { value: "presentation", label: "Presentation / Deck" },
    ],
  },
  {
    key: "aiUsage" as const,
    title: "How did you use AI?",
    subtitle: "This helps us calibrate — a fully AI-drafted document needs different edits than one you wrote yourself.",
    options: [
      { value: "drafted", label: "AI drafted most of it" },
      { value: "outlined", label: "AI outlined, I wrote" },
      { value: "edited", label: "I wrote, AI helped edit" },
      { value: "research", label: "AI helped with research only" },
      { value: "none", label: "No AI used" },
    ],
  },
  {
    key: "discipline" as const,
    title: "What discipline is this in?",
    subtitle: "Academic writing in law looks very different from psychology or engineering.",
    academicOnly: true,
    options: [
      { value: "business", label: "Business / Management" },
      { value: "law", label: "Law" },
      { value: "medicine", label: "Medicine / Health" },
      { value: "psychology", label: "Psychology" },
      { value: "education", label: "Education" },
      { value: "humanities", label: "Humanities / Arts" },
      { value: "engineering", label: "Engineering / CS" },
      { value: "social_science", label: "Social Science" },
      { value: "natural_science", label: "Natural Science" },
    ],
  },
];

const SIGNAL_COLORS: Record<string, string> = {
  high: "border-l-amber-500 bg-amber-50/80",
  medium: "border-l-yellow-400 bg-yellow-50/80",
  low: "border-l-blue-300 bg-blue-50/80",
  none: "border-l-gray-200",
};

const SIGNAL_BADGE: Record<string, string> = {
  high: "bg-amber-100 text-amber-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
  none: "bg-gray-100 text-gray-500",
};

// ── Score colour helper ──────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}${d.getDate()}-${String(d.getFullYear()).slice(-2)}`;
}

// Import shared pattern labels — single source of truth
import { PATTERN_TYPE_LABELS } from "@/lib/constants";

function scoreColor(score: number | null) {
  if (score == null) return "text-gray-300";
  if (score >= 70) return "text-red-500";
  if (score >= 40) return "text-amber-500";
  return "text-green-600";
}

// ── Main workspace ─────────────────────────────────────────────────────────

const VALID_NAV_ITEMS = new Set<NavItem>(["library", "workspace", "style-rules", "intake"]);
const VALID_WORKSPACE_MODES = new Set<WorkspaceMode>(["dashboard", "edit", "review", "citations"]);

// Order + labels for the scan-phase checklist in the Choices-panel status area.
const SCAN_PHASE_ORDER: { key: string; label: string }[] = [
  { key: "aiDetection", label: "AI patterns" },
  { key: "aiArtifacts", label: "AI artifacts" },
  { key: "spelling", label: "Spelling" },
  { key: "grammar", label: "Grammar" },
  { key: "plagiarism", label: "Plagiarism" },
  { key: "tone", label: "Tone consistency" },
  { key: "citations", label: "Citations" },
];

// Small "random letters flying through 2 slots" activity indicator for the
// generation status line. Falls back to dots when reduced motion is requested.
function ScrambleTicker() {
  const [chars, setChars] = useState("··");
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const id = setInterval(() => {
      setChars(pool[Math.floor(Math.random() * pool.length)] + pool[Math.floor(Math.random() * pool.length)]);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-[1.4em] text-center font-mono font-bold tabular-nums text-amber-600">{chars}</span>;
}

export default function WorkspacePage() {
  const searchParams = useSearchParams();

  // Document list
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  // Which document's ⋯ actions menu is open in the library list
  const [docMenuId, setDocMenuId] = useState<string | null>(null);

  // Active document data
  const [sections, setSections] = useState<Section[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagOptions, setFlagOptions] = useState<FlagOption[]>([]);
  const [docVersions, setDocVersions] = useState<{ id: string; versionLabel: string; versionNumber: number; aiRiskScore: number | null; writingQualityScore: number | null }[]>([]);
  const [plagiarismResults, setPlagiarismResults] = useState<PlagiarismResult[]>([]);
  const [plagiarismLoading, setPlagiarismLoading] = useState(false);

  // Usage warnings
  const [usageWarnings, setUsageWarnings] = useState<{ key: string; current: number; limit: number; percent: number }[]>([]);

  // Unified edit queue state
  const [artifactBatchChoices, setArtifactBatchChoices] = useState<Record<string, "remove" | "keep" | "ask">>({});
  const [processedArtifacts, setProcessedArtifacts] = useState<Record<string, { action: "remove" | "keep" | "ask"; count: number }>>({});
  const [skipAllWritingQuality, setSkipAllWritingQuality] = useState(false);

  // Spelling & grammar state
  const [spellingChecked, setSpellingChecked] = useState<Set<string>>(new Set());
  const [spellingApplying, setSpellingApplying] = useState(false);
  const [grammarChecked, setGrammarChecked] = useState<Set<string>>(new Set());
  const [grammarApplying, setGrammarApplying] = useState(false);

  // Navigation and UI — initialize from URL ?nav= param if valid
  const [nav, setNav] = useState<NavItem>(() => {
    const urlNav = searchParams.get("nav");
    if (urlNav && VALID_NAV_ITEMS.has(urlNav as NavItem)) return urlNav as NavItem;
    return "library";
  });
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    const urlMode = searchParams.get("mode");
    if (urlMode && VALID_WORKSPACE_MODES.has(urlMode as WorkspaceMode)) return urlMode as WorkspaceMode;
    return "edit";
  });
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanViewed, setScanViewed] = useState(false);
  const [versionSavedSinceScan, setVersionSavedSinceScan] = useState(true); // true initially so first scan is allowed
  const [scanConfig, setScanConfig] = useState({
    categories: { aiDetection: true, writingQuality: true, aiArtifacts: true, plagiarism: true, citations: true, toneConsistency: true, spelling: true, grammar: true },
    aiDetectionDepth: "comprehensive" as "surface" | "deep" | "comprehensive",
  });
  const [selectedFlagIdx, setSelectedFlagIdx] = useState(0);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [manualEditText, setManualEditText] = useState("");

  // Panel visibility — four panels: Library, Doc, Edit, Choices
  // Library shows when no doc loaded; Doc replaces it once a doc is selected
  const [showLibraryPanel, setShowLibraryPanel] = useState(true);
  const [showDocPanel, setShowDocPanel] = useState(true);
  const [highlightedCitationText, setHighlightedCitationText] = useState<string | null>(null);
  const [docCitations, setDocCitations] = useState<CitationSummary[]>([]);
  const docScrollRef = useRef<HTMLDivElement>(null);
  const diffDocRef = useRef<HTMLDivElement>(null);
  const diffEditRef = useRef<HTMLDivElement>(null);
  const diffSyncingRef = useRef(false);
  // Mirrors of state the async generation loop reads (closures would go stale).
  const flagsRef = useRef<Flag[]>([]);
  const flagOptionsRef = useRef<FlagOption[]>([]);
  const sectionsRef = useRef<Section[]>([]);
  const activeDocIdRef = useRef<string | null>(null);
  const [showEditPanel, setShowEditPanel] = useState(true);
  const [showChoicesPanel, setShowChoicesPanel] = useState(true);
  const [navExpanded, setNavExpanded] = useState(false);
  const [navPinned, setNavPinned] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [suggestProgress, setSuggestProgress] = useState<{
    generating: boolean;
    current: number;
    total: number;
  }>({ generating: false, current: 0, total: 0 });
  // Flags whose options are being generated right now (drives the truthful
  // per-flag "generating…" indicator, separate from the lying "no options" check).
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  // Scan-phase checklist shown in the Choices-panel status area.
  const [scanPhases, setScanPhases] = useState<Record<string, "pending" | "running" | "done" | "stopped">>({});
  const [scanError, setScanError] = useState<string | null>(null);
  // Live scan activity feed — ticker-tape log of what the scan is doing right
  // now, with elapsed time and a stop control (the status panel renders it).
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const scanStartAtRef = useRef<number>(0);
  const scanStopRef = useRef<boolean>(false);

  const logScan = useCallback((msg: string) => {
    const sec = Math.max(0, Math.round((Date.now() - scanStartAtRef.current) / 1000));
    const stamp = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    setScanLog((prev) => [...prev.slice(-99), `[${stamp}] ${msg}`]);
  }, []);

  // Tick the elapsed counter once a second while any scan phase is active.
  const scanActive = scanning || Object.values(scanPhases).some((s) => s === "running" || s === "pending");
  useEffect(() => {
    if (!scanActive) return;
    const t = setInterval(() => {
      setScanElapsedSec(Math.round((Date.now() - scanStartAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [scanActive]);
  // Guards the background generation loop so only one runs per tab.
  const genLoopRef = useRef(false);

  // Library accordion state — tracks expanded docs and lazy-loaded versions
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());
  const [libraryVersions, setLibraryVersions] = useState<Record<string, { id: string; versionLabel: string; versionNumber: number; aiRiskScore: number | null; createdAt: string }[]>>({});

  const toggleDocExpanded = useCallback(async (docId: string) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) { next.delete(docId); } else { next.add(docId); }
      return next;
    });
    // Lazy-load versions if not already fetched
    if (!libraryVersions[docId]) {
      try {
        const res = await fetch(`/api/documents/${docId}/versions`);
        const json = await res.json();
        if (json.success) {
          setLibraryVersions((prev) => ({ ...prev, [docId]: json.data }));
        }
      } catch {}
    }
  }, [libraryVersions]);

  // Upload state (inline in documents panel)
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDocType, setUploadDocType] = useState("professional");
  const [intakeStep, setIntakeStep] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState({
    audience: "",
    purpose: "",
    aiUsage: "",
    discipline: "",
  });
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json.success) setDocs(json.data);
    } catch {
      // Network or parse error — ignore silently, docs list stays empty
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Load citation summaries for the active doc so the edit-queue footer and
  // end-of-queue handoff can surface pending citations. Refetch when the user
  // navigates back into edit/analysis so counts stay fresh after they work
  // in the Citations tab.
  useEffect(() => {
    if (!activeDocId) { setDocCitations([]); return; }
    if (nav !== "workspace" || (workspaceMode !== "edit" && workspaceMode !== "dashboard")) return;
    let cancelled = false;
    fetch(`/api/citations?documentId=${activeDocId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setDocCitations(j.data); })
      .catch(() => { /* silent — count just stays stale until next trigger */ });
    return () => { cancelled = true; };
  }, [activeDocId, nav, hasScanned]);

  const fetchUsageWarnings = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/usage");
      const json = await res.json();
      if (json.success && json.data.warnings.length > 0) {
        const warns: { key: string; current: number; limit: number; percent: number }[] = [];
        const { limits, usage } = json.data;
        const map: Record<string, number> = {
          monthlyWordLimit: usage.wordsScanned,
          monthlyScanLimit: usage.scanCount,
          documentStorageLimit: usage.documentCount,
        };
        for (const key of json.data.warnings) {
          const limit = limits[key];
          const current = map[key] ?? 0;
          warns.push({ key, current, limit, percent: Math.round((current / limit) * 100) });
        }
        setUsageWarnings(warns);
      } else {
        setUsageWarnings([]);
      }
    } catch {
      // Silent — usage warnings are non-critical
    }
  }, []);

  // Fetch usage warnings on mount
  useEffect(() => { fetchUsageWarnings(); }, [fetchUsageWarnings]);

  const loadDocument = useCallback(async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json.success) {
        setActiveDoc(json.data.document);
        setSections(json.data.sections);
        setFlags(json.data.flags);
        setFlagOptions(json.data.flagOptions || []);
      }
      // Fetch versions and plagiarism results in parallel
      const [vRes, pRes] = await Promise.all([
        fetch(`/api/documents/${docId}/versions`),
        fetch(`/api/plagiarism?documentId=${docId}`),
      ]);
      if (vRes.ok) {
        const vText = await vRes.text();
        if (vText) {
          const vJson = JSON.parse(vText);
          if (vJson.success) setDocVersions(vJson.data);
        }
      }
      if (pRes.ok) {
        const pText = await pRes.text();
        if (pText) {
          const pJson = JSON.parse(pText);
          if (pJson.success) setPlagiarismResults(pJson.data);
        }
      }
    } catch {
      // Fetch failed — network error or empty response, ignore silently
    }
  }, []);

  async function handleDeleteDocument(docId: string, title: string) {
    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThis permanently removes the document along with its scans, edits, versions, and citations. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        console.error("Delete failed:", json.error);
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      setDocMenuId(null);
      if (activeDocId === docId) {
        // The open document was deleted — return to the library.
        setActiveDocId(null);
        setActiveDoc(null);
        setShowLibraryPanel(true);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  function selectDocument(docId: string) {
    setActiveDocId(docId);
    setShowUpload(false);
    setSelectedFlagIdx(0);
    setSelectedOptionIdx(null);
    setHasScanned(false);
    setScanViewed(false);
    setVersionSavedSinceScan(true);
    setProcessedArtifacts({});
    setArtifactBatchChoices({});
    setGeneratingIds(new Set());
    setScanPhases({});
    setSuggestProgress({ generating: false, current: 0, total: 0 });
    // Switch from Library panel to Doc panel, and back to edit view
    setShowLibraryPanel(false);
    setShowDocPanel(true);
    if (nav === "style-rules" || nav === "library") { setNav("workspace"); setWorkspaceMode("edit"); }
    loadDocument(docId);
  }

  // No auto-scan on upload — user clicks Scan when ready

  // ── Scan ───────────────────────────────────────────────────────────────

  /**
   * Client-driven spelling/grammar loop: one batch (one LLM call) per request
   * against /api/scan/detectors, with live ticker logging and a stop check
   * between batches.
   */
  async function runDetectorLoop(detector: "spelling" | "grammar", docId: string) {
    const label = detector === "spelling" ? "Spelling" : "Grammar";
    const phaseKey = detector;
    try {
      const planRes = await fetch("/api/scan/detectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, detector }),
      });
      const plan = await planRes.json();
      if (!plan.success) {
        logScan(`${label}: could not start (${plan.error ?? "unknown error"})`);
        setScanPhases((p) => ({ ...p, [phaseKey]: "done" }));
        return;
      }
      const { batchCount, sectionCount } = plan.data;
      if (batchCount === 0) {
        logScan(`${label}: nothing to check`);
        setScanPhases((p) => ({ ...p, [phaseKey]: "done" }));
        return;
      }
      logScan(`${label}: document split into ${batchCount} batch${batchCount !== 1 ? "es" : ""} (${sectionCount} sections)`);

      let total = 0;
      for (let i = 0; i < batchCount; i++) {
        if (scanStopRef.current) {
          logScan(`${label}: stopped by user after ${i} of ${batchCount} batches`);
          setScanPhases((p) => ({ ...p, [phaseKey]: "stopped" }));
          return;
        }
        logScan(`${label}: checking batch ${i + 1} of ${batchCount}…`);
        const res = await fetch("/api/scan/detectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: docId, detector, batch: i, reset: i === 0 }),
        });
        const json = await res.json();
        if (!json.success) {
          logScan(`${label}: batch ${i + 1} failed (${json.error ?? "error"}) — continuing`);
          continue;
        }
        total = json.data.totalFindings;
        logScan(`${label}: batch ${i + 1} done — ${json.data.batchFindings} issue${json.data.batchFindings !== 1 ? "s" : ""} found (${total} total)`);
      }
      logScan(`${label}: finished — ${total} issue${total !== 1 ? "s" : ""}`);
      setScanPhases((p) => ({ ...p, [phaseKey]: "done" }));
    } catch (err) {
      logScan(`${label}: failed (${err instanceof Error ? err.message : "network error"})`);
      setScanPhases((p) => ({ ...p, [phaseKey]: "done" }));
    }
  }

  function handleStopScan() {
    scanStopRef.current = true;
    logScan("Stop requested — finishing the current step…");
  }

  async function handleScan() {
    if (!activeDocId) return;
    setScanning(true);
    setScanError(null);
    scanStopRef.current = false;
    scanStartAtRef.current = Date.now();
    setScanElapsedSec(0);
    setScanLog([]);
    setNav("workspace"); setWorkspaceMode("dashboard");

    // Seed the scan-phase checklist. AI detection / artifacts resolve with the
    // /api/scan call; spelling / grammar run as client-driven batch loops;
    // plagiarism / tone / citations run after.
    const cats = scanConfig.categories;
    const seededPhases: Record<string, "pending" | "running" | "done" | "stopped"> = {};
    if (cats.aiDetection) seededPhases.aiDetection = "running";
    if (cats.aiArtifacts) seededPhases.aiArtifacts = "running";
    if (cats.spelling) seededPhases.spelling = "pending";
    if (cats.grammar) seededPhases.grammar = "pending";
    if (cats.plagiarism) seededPhases.plagiarism = "pending";
    if (cats.toneConsistency) seededPhases.tone = "pending";
    if (cats.citations) seededPhases.citations = "pending";
    setScanPhases(seededPhases);
    logScan(`Scan started (${Object.keys(seededPhases).length} phases)`);
    if (cats.aiDetection) logScan(`AI detection: analysing document (${scanConfig.aiDetectionDepth} depth)…`);

    // A killed function (timeout/504) or non-JSON error response must never
    // leave the checklist spinning forever — catch, mark the in-flight phases
    // failed, and surface the error.
    let json: { success?: boolean; error?: string } = {};
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDocId,
          // Spelling/grammar run as client-driven batch loops below — the
          // main scan call handles AI detection + artifacts only.
          categories: { ...scanConfig.categories, spelling: false, grammar: false },
          aiDetectionDepth: scanConfig.aiDetectionDepth,
        }),
      });
      json = await res.json().catch(() => ({ success: false, error: `Scan failed (HTTP ${res.status})` }));
    } catch {
      json = { success: false, error: "The scan request failed or timed out." };
    }
    if (!json.success) {
      setScanError(json.error || "Scan failed — please try again.");
      logScan(`Scan failed: ${json.error ?? "unknown error"}`);
      setScanPhases({});
    }
    if (json.success) {
      await loadDocument(activeDocId);
      await loadDocs();
      logScan("AI detection and artifact analysis complete");

      // AI detection / artifacts complete with the scan call. The background
      // generation loop starts automatically (see the auto-resume effect) now
      // that flags are loaded. Spelling/grammar loops run next; plagiarism /
      // tone / citations start in parallel.
      setScanPhases((prev) => {
        const next = { ...prev };
        for (const k of ["aiDetection", "aiArtifacts"]) if (next[k]) next[k] = "done";
        for (const k of ["plagiarism", "tone", "citations"]) if (next[k]) next[k] = "running";
        return next;
      });

      // Run plagiarism check in parallel if enabled
      if (scanConfig.categories.plagiarism) {
        logScan("Plagiarism: searching the web for matching passages…");
        runPlagiarismCheck(activeDocId).finally(() => {
          logScan("Plagiarism: done");
          setScanPhases((p) => (p.plagiarism ? { ...p, plagiarism: "done" } : p));
        });
        trackEvent("feature_used", { feature: "plagiarism" });
      }

      // Run tone consistency check in parallel if enabled
      if (scanConfig.categories.toneConsistency) {
        logScan("Tone: checking voice consistency across sections…");
        runToneConsistencyCheck(activeDocId).finally(() => {
          logScan("Tone: done");
          setScanPhases((p) => (p.tone ? { ...p, tone: "done" } : p));
        });
        trackEvent("feature_used", { feature: "tone_consistency" });
      }

      // Run citation extraction and structural check if enabled
      if (scanConfig.categories.citations) {
        logScan("Citations: extracting and cross-referencing…");
        runCitationCheck(activeDocId).finally(() => {
          logScan("Citations: done");
          setScanPhases((p) => (p.citations ? { ...p, citations: "done" } : p));
        });
        trackEvent("feature_used", { feature: "citations" });
      }

      // Spelling and grammar: client-driven batch loops with live progress.
      // Serial so the ticker reads clearly; each batch is one fast LLM call.
      for (const detector of ["spelling", "grammar"] as const) {
        if (!scanConfig.categories[detector]) continue;
        if (scanStopRef.current) {
          setScanPhases((p) => (p[detector] ? { ...p, [detector]: "stopped" } : p));
          continue;
        }
        setScanPhases((p) => (p[detector] ? { ...p, [detector]: "running" } : p));
        await runDetectorLoop(detector, activeDocId);
      }
      if (scanConfig.categories.spelling || scanConfig.categories.grammar) {
        // Refresh so the panels pick up the stored spelling/grammar results.
        await loadDocument(activeDocId);
      }
    }
    setScanning(false);
    setHasScanned(true);
    setScanViewed(false);
    setVersionSavedSinceScan(false);
    setProcessedArtifacts({});
    setArtifactBatchChoices({});
    fetchUsageWarnings();
  }

  async function runPlagiarismCheck(docId: string) {
    setPlagiarismLoading(true);
    setPlagiarismResults([]);
    try {
      const res = await fetch("/api/plagiarism", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (json.success) {
        setPlagiarismResults(json.data.results);
      } else {
        console.error("Plagiarism check failed:", json.error);
      }
    } catch (err) {
      console.error("Plagiarism check error:", err);
    }
    setPlagiarismLoading(false);
  }

  // ── Tone consistency check ─────────────────────────────────────────────

  async function runToneConsistencyCheck(docId: string) {
    try {
      const res = await fetch("/api/tone-consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveDoc((prev) => prev ? { ...prev, toneConsistencyScore: json.data.score } : prev);
        // Reload flags to pick up new tone_inconsistency flags
        await loadDocument(docId);
      } else {
        console.error("Tone consistency check failed:", json.error);
      }
    } catch (err) {
      console.error("Tone consistency check error:", err);
    }
  }

  // ── Citation check ────────────────────────────────────────────────────

  async function runCitationCheck(docId: string) {
    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "structural_check", documentId: docId }),
      });
      const json = await res.json();
      if (json.success && json.score != null) {
        setActiveDoc((prev) => prev ? { ...prev, citationsScore: json.score } : prev);
      }
      // Step 2: Verify citations (are they real?) — batch loop: the server
      // verifies a few entries per request to fit the function time cap.
      let reset = true;
      for (let guard = 0; guard < 60; guard++) {
        if (scanStopRef.current) {
          logScan("Citations: verification stopped by user");
          break;
        }
        const verifyRes = await fetch("/api/citations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify_batch", documentId: docId, reset }),
        });
        reset = false;
        const verifyJson = await verifyRes.json();
        if (!verifyJson.success) break;
        const { remaining, total } = verifyJson.data;
        if (total > 0) logScan(`Citations: verified ${total - remaining} of ${total} sources against the web…`);
        if (remaining === 0) {
          if (verifyJson.data.score != null) {
            setActiveDoc((prev) => prev ? { ...prev, citationsScore: verifyJson.data.score } : prev);
          }
          break;
        }
      }
    } catch (err) {
      console.error("Citation check error:", err);
    }
  }

  // ── Artifact batch processing ──────────────────────────────────────────

  async function handleArtifactBatchProcess() {
    if (!activeDocId) return;

    const removeItems = Object.entries(artifactBatchChoices)
      .filter(([, choice]) => choice === "remove")
      .map(([item]) => item);

    const keepItems = Object.entries(artifactBatchChoices)
      .filter(([, choice]) => choice === "keep")
      .map(([item]) => item);

    const askItems = Object.entries(artifactBatchChoices)
      .filter(([, choice]) => choice === "ask")
      .map(([item]) => item);

    // Bulk remove
    if (removeItems.length > 0) {
      await fetch("/api/artifacts/bulk-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: activeDocId, items: removeItems }),
      });
    }

    // Create individual flags for "Ask" items
    if (askItems.length > 0) {
      await fetch("/api/artifacts/create-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: activeDocId, items: askItems }),
      });
    }

    // Record what was processed so user can see history
    const newProcessed = { ...processedArtifacts };
    for (const item of removeItems) {
      newProcessed[item] = { action: "remove", count: artifactFindings.find((f) => f.item === item)?.count ?? 0 };
    }
    for (const item of keepItems) {
      newProcessed[item] = { action: "keep", count: artifactFindings.find((f) => f.item === item)?.count ?? 0 };
    }
    for (const item of askItems) {
      newProcessed[item] = { action: "ask", count: artifactFindings.find((f) => f.item === item)?.count ?? 0 };
    }
    setProcessedArtifacts(newProcessed);
    setArtifactBatchChoices({});
    await loadDocument(activeDocId);
    await loadDocs();
    // Advance past the batch flag — if findings remain, it'll still be in the queue for later
    setSelectedFlagIdx((prev) => prev + 1);
    setSelectedOptionIdx(null);
  }

  // ── Plagiarism resolution ─────────────────────────────────────────────

  async function handlePlagiarismResolved(resultId: string, action: "rewrite" | "cite" | "dismiss", replacementText?: string) {
    await fetch("/api/plagiarism/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plagiarismResultId: resultId, action, replacementText }),
    });

    setPlagiarismResults((prev) =>
      prev.map((r) => r.id === resultId ? { ...r, status: "acknowledged" } : r)
    );
    if (activeDocId) await loadDocument(activeDocId);
    setSelectedFlagIdx((prev) => prev + 1);
    setSelectedOptionIdx(null);
    setManualEditText("");
  }

  // ── Citation fix resolution ──────────────────────────────────────────

  // ── Upload ─────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!uploadFile && !pasteText.trim()) return;
    setUploading(true);
    const formData = new FormData();
    if (uploadFile) formData.append("file", uploadFile);
    else formData.append("text", pasteText);
    formData.append("title", uploadTitle || uploadFile?.name?.replace(/\.[^.]+$/, "") || "Pasted Document");
    formData.append("documentType", uploadDocType);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const json = await res.json();
    if (!json.success) {
      console.error("[upload] Server rejected:", json.error);
      alert(json.error || "Upload failed");
    }
    if (json.success) {
      await loadDocs();
      selectDocument(json.data.documentId);
      setUploadFile(null);
      setPasteText("");
      setUploadTitle("");
      setShowUpload(false);
      // Navigate to intake questionnaire flow
      setIntakeStep(0);
      setIntakeAnswers({ audience: "", purpose: "", aiUsage: "", discipline: "" });
      setNav("intake");
    }
    setUploading(false);
  }

  // ── Intake questionnaire ────────────────────────────────────────────────

  const activeIntakeQuestions = INTAKE_QUESTIONS.filter(
    (q) => !q.academicOnly || activeDoc?.documentType === "academic"
  );
  const currentIntakeQ = activeIntakeQuestions[intakeStep] ?? null;

  async function saveIntake() {
    if (!activeDocId) return;
    const filled = Object.fromEntries(
      Object.entries(intakeAnswers).filter(([, v]) => v !== "")
    );
    if (Object.keys(filled).length > 0) {
      await fetch(`/api/documents/${activeDocId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: filled }),
      });
      trackEvent("intake_completed", { answersCount: Object.keys(filled).length });
    } else {
      trackEvent("intake_skipped");
    }
    setNav("workspace"); setWorkspaceMode("dashboard");
  }

  function advanceIntake() {
    if (intakeStep < activeIntakeQuestions.length - 1) {
      setIntakeStep(intakeStep + 1);
    } else {
      saveIntake();
    }
  }

  // ── Flag resolution ────────────────────────────────────────────────────

  async function handleFlagResolved(action: "accepted" | "rejected" | "skipped", optionId?: string, manualText?: string) {
    const item = editQueue[selectedFlagIdx];
    const flag = item && (item.type === "ai_detection" || item.type === "artifact_individual") ? item.flag : null;
    if (!flag) return;
    await fetch("/api/flags/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagId: flag.id, action, optionId, manualText }),
    });
    setFlags((prev) => prev.map((f) => (f.id === flag.id ? { ...f, status: action } : f)));
    setSelectedOptionIdx(null);
    setManualEditText("");
    // Reload document to reflect text changes from accepted replacements
    if (activeDocId && action === "accepted") await loadDocument(activeDocId);
    if (selectedFlagIdx < editQueue.length - 1) setSelectedFlagIdx(selectedFlagIdx + 1);
  }

  // ── Rename document ─────────────────────────────────────────────────────

  async function handleRenameDoc(newTitle: string) {
    if (!activeDocId) return;
    const res = await fetch(`/api/documents/${activeDocId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      setActiveDoc((prev) => prev ? { ...prev, title: newTitle } : prev);
      setDocs((prev) => prev.map((d) => d.id === activeDocId ? { ...d, title: newTitle } : d));
    }
  }

  // ── Generate all suggestions after scan ──────────────────────────────────

  // Keep refs in sync so the async generation loop reads current state.
  useEffect(() => { flagsRef.current = flags; }, [flags]);
  useEffect(() => { flagOptionsRef.current = flagOptions; }, [flagOptions]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { activeDocIdRef.current = activeDocId; }, [activeDocId]);

  // Flags that need generated options, in document order. Mirrors the openFlags
  // filter (artifacts/writing-quality/plagiarism are handled by other flows).
  function orderedGeneratableFlags(): Flag[] {
    const secIdx = new Map(sectionsRef.current.map((s) => [s.id, s.index]));
    return flagsRef.current
      .filter((f) =>
        (f.status === "open" || f.status === "generation_failed") &&
        f.patternType !== "ai_artifact" &&
        f.patternType !== "writing_quality" &&
        f.patternType !== "plagiarism_match")
      .sort((a, b) => {
        const ai = secIdx.get(a.sectionId) ?? 0;
        const bi = secIdx.get(b.sectionId) ?? 0;
        return ai !== bi ? ai - bi : a.phraseStart - b.phraseStart;
      });
  }

  function mergeOptions(opts: FlagOption[]) {
    if (opts.length === 0) return;
    setFlagOptions((prev) => {
      const seen = new Set(prev.map((o) => o.id));
      return [...prev, ...opts.filter((o) => !seen.has(o.id))];
    });
  }

  function markFlagsFailed(ids: string[]) {
    if (ids.length === 0) return;
    setFlags((prev) => prev.map((f) => (ids.includes(f.id) ? { ...f, status: "generation_failed" } : f)));
  }

  /**
   * Background generation loop. Runs in the browser tab while the UI stays
   * interactive: generates options for every open flag in document order — flag 1
   * first and alone so the user can start immediately, then the rest in slices of
   * 2 via /api/suggest-all (each request short enough to survive Vercel limits).
   * Idempotent and resumable: only generates flags that still lack options, and a
   * re-entry guard keeps a single loop running. Failed flags are left for Retry.
   */
  const runGenerationLoop = useCallback(async (docId: string) => {
    if (genLoopRef.current) return;
    genLoopRef.current = true;
    try {
      const work = orderedGeneratableFlags();
      const total = work.length;
      const have = new Set(flagOptionsRef.current.map((o) => o.flagId));
      const pending = work.filter((f) => !have.has(f.id));
      setSuggestProgress({ generating: pending.length > 0, current: have.size, total });
      if (pending.length === 0) return;

      let idx = 0;
      while (idx < pending.length) {
        // Stop if the user switched away to another document mid-run, so we don't
        // merge this doc's options into a different doc's state.
        if (activeDocIdRef.current !== docId) return;
        // One flag per request: each is a single LLM call, guaranteed to fit
        // inside the Vercel Hobby 60s function cap (calls abort at 45s).
        const slice = pending.slice(idx, idx + 1);
        idx += slice.length;
        const sliceIds = slice.map((f) => f.id);
        setGeneratingIds((prev) => new Set([...prev, ...sliceIds]));
        try {
          const res = await fetch("/api/suggest-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: docId, flagIds: sliceIds }),
          });
          const json = await res.json();
          if (json.success && Array.isArray(json.data?.results)) {
            const results = json.data.results as { flagId: string; status: string; options?: FlagOption[] }[];
            const newOptions: FlagOption[] = [];
            const failedIds: string[] = [];
            for (const r of results) {
              if (r.status === "success" && r.options?.length) {
                newOptions.push(...r.options);
                have.add(r.flagId);
              } else {
                failedIds.push(r.flagId);
              }
            }
            mergeOptions(newOptions);
            markFlagsFailed(failedIds);
          } else {
            // Request-level failure — mark this slice failed (Retry available).
            markFlagsFailed(sliceIds);
          }
        } catch {
          markFlagsFailed(sliceIds);
        } finally {
          setGeneratingIds((prev) => {
            const next = new Set(prev);
            sliceIds.forEach((id) => next.delete(id));
            return next;
          });
        }
        setSuggestProgress({ generating: idx < pending.length, current: have.size, total });
      }
    } finally {
      genLoopRef.current = false;
      setSuggestProgress((prev) => ({ ...prev, generating: false }));
    }
  }, []);

  // On-demand single-flag generation: the never-stuck fallback (user lands on a
  // flag the loop hasn't reached) and the Retry action on a failed flag.
  const generateOneFlag = useCallback(async (flagId: string) => {
    setGeneratingIds((prev) => new Set([...prev, flagId]));
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.options) && json.data.options.length > 0) {
        mergeOptions(json.data.options);
        setFlags((prev) => prev.map((f) => (f.id === flagId && f.status === "generation_failed" ? { ...f, status: "open" } : f)));
      } else {
        markFlagsFailed([flagId]);
      }
    } catch {
      markFlagsFailed([flagId]);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(flagId);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryFlag = useCallback(async (flagId: string) => {
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: "open" } : f)));
    await generateOneFlag(flagId);
  }, [generateOneFlag]);

  // Per-flag generation state — the truthful replacement for "no options ⇒ spinner".
  const flagGenState = useCallback((flag: Flag | null | undefined): "ready" | "generating" | "failed" | "pending" => {
    if (!flag) return "pending";
    if (flagOptions.some((o) => o.flagId === flag.id)) return "ready";
    if (flag.status === "generation_failed") return "failed";
    if (generatingIds.has(flag.id)) return "generating";
    return "pending";
  }, [flagOptions, generatingIds]);


  // ── Save version ────────────────────────────────────────────────────────

  async function handleSaveVersion() {
    if (!activeDocId) return;

    // No confirm dialog — the EditSessionSummary already shows remaining items inline
    await fetch(`/api/documents/${activeDocId}/versions`, { method: "POST" });
    setVersionSavedSinceScan(true);
    // Reload versions for the analysis chart
    try {
      const vRes = await fetch(`/api/documents/${activeDocId}/versions`);
      if (vRes.ok) {
        const vJson = await vRes.json();
        if (vJson.success) setDocVersions(vJson.data);
      }
    } catch {}
  }

  // ── Generate options ───────────────────────────────────────────────────

  // Options are now generated during the scan phase via /api/suggest-all
  // No per-flag generation needed in the edit view

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      // Panel toggles — work from any nav view
      if (key === "d" && activeDoc) { setShowDocPanel((prev) => !prev); return; }
      if (key === "e") { setShowEditPanel((prev) => !prev); return; }
      if (key === "c") { setShowChoicesPanel((prev) => !prev); return; }
      if (key === "l") { setShowLibraryPanel((prev) => !prev); return; }
      // Cmd+1..6 — workspace mode switching
      if ((e.metaKey || e.ctrlKey) && key >= "1" && key <= "4") {
        e.preventDefault();
        const modes: WorkspaceMode[] = ["dashboard", "edit", "review", "citations"];
        const idx = parseInt(key) - 1;
        if (idx < modes.length) { setNav("workspace"); setWorkspaceMode(modes[idx]); }
        return;
      }
      if (nav !== "workspace" || workspaceMode !== "edit") return;
      if (key >= "1" && key <= "9") { setSelectedOptionIdx(parseInt(key) - 1); return; }
      if (key === "enter") { e.preventDefault(); if (selectedOptionIdx !== null) handleFlagResolved("accepted", currentOptions[selectedOptionIdx]?.id); return; }
      if (key === "s") { handleFlagResolved("skipped"); return; }
      if (key === "r") { handleFlagResolved("rejected"); return; }
      if (key === "arrowleft" && selectedFlagIdx > 0) { setSelectedFlagIdx(selectedFlagIdx - 1); setSelectedOptionIdx(null); return; }
      if (key === "arrowright" && selectedFlagIdx < editQueue.length - 1) { setSelectedFlagIdx(selectedFlagIdx + 1); setSelectedOptionIdx(null); return; }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, workspaceMode, selectedOptionIdx, selectedFlagIdx]);

  // ── Computed values ────────────────────────────────────────────────────

  // Section lookup map — O(1) lookups instead of O(n) .find() calls
  const sectionMap = useMemo(() => {
    const map = new Map<string, typeof sections[number]>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  const unlockedSections = useMemo(
    () => sections.filter((s) => !s.isLocked),
    [sections]
  );

  const fullDocText = useMemo(
    () => unlockedSections.map((s) => s.currentText).join("\n\n"),
    [unlockedSections]
  );

  // AI detection flags — memoized with O(1) section lookups
  const openFlags = useMemo(() =>
    flags
      .filter((f) => (f.status === "open" || f.status === "generation_failed") && f.patternType !== "ai_artifact" && f.patternType !== "writing_quality" && f.patternType !== "plagiarism_match")
      .sort((a, b) => {
        const sA = sectionMap.get(a.sectionId);
        const sB = sectionMap.get(b.sectionId);
        if (!sA || !sB) return 0;
        return sA.index !== sB.index ? sA.index - sB.index : a.phraseStart - b.phraseStart;
      }),
    [flags, sectionMap]
  );

  // Artifact individual flags (from "Ask" batch processing)
  // Filter out stale flags whose flagged phrase no longer exists in the section text
  const artifactFlags = useMemo(() =>
    flags
      .filter((f) => {
        if (f.patternType !== "ai_artifact") return false;
        if (f.status !== "open" && f.status !== "generation_failed") return false;
        const sec = sectionMap.get(f.sectionId);
        if (sec && !sec.currentText.includes(f.flaggedPhrase)) return false;
        return true;
      })
      .sort((a, b) => a.phraseStart - b.phraseStart),
    [flags, sectionMap]
  );

  // Compute artifact findings — only after a scan has been run.
  // NOTE: recomputed live from the CURRENT text, so artifacts introduced by
  // accepted AI rewrites re-appear here automatically.
  const artifactFindings = useMemo(() => {
    if (!fullDocText || !hasScanned) return [];
    return detectArtifacts(fullDocText).findings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullDocText, hasScanned]);

  // Final-sweep count for the end-of-queue summary: artifact instances still
  // in the document that the user hasn't chosen to keep — including ones
  // re-introduced by accepted rewrites AFTER the artifact batch was processed.
  const leftoverArtifactCount = useMemo(() => {
    return artifactFindings.reduce((sum, f) => {
      const processed = processedArtifacts[f.item];
      if (processed?.action === "keep" || processed?.action === "ask") return sum;
      return sum + f.count;
    }, 0);
  }, [artifactFindings, processedArtifacts]);

  // Writing quality advisories (sub-scores below 40)
  const writingQualityAdvisories = useMemo((): WritingQualityAdvisory[] => {
    if (!fullDocText || !hasScanned || skipAllWritingQuality) return [];
    const q = calculateWritingQuality(fullDocText);
    const advisories: WritingQualityAdvisory[] = [];
    if (q.fleschScore < 40) advisories.push({ label: "Readability", score: q.fleschScore, description: "Your sentences are very complex.", suggestion: "Try mixing in shorter, simpler sentences.", examples: findComplexSentences(fullDocText, 3) });
    if (q.paragraphVariation < 40) advisories.push({ label: "Paragraph Variation", score: q.paragraphVariation, description: "Your paragraphs are very uniform in length.", suggestion: "Vary paragraph lengths — mix short punchy ones with longer detailed ones." });
    if (q.sentenceVariation < 40) advisories.push({ label: "Sentence Variation", score: q.sentenceVariation, description: "Your sentences are similar lengths.", suggestion: "Mix short sentences with longer compound-complex ones." });
    if (q.sectionCoherence < 40) advisories.push({ label: "Section Coherence", score: q.sectionCoherence, description: "Adjacent sentences don't connect well.", suggestion: "Ensure each sentence flows naturally from the previous one." });
    if (q.lexicalDiversity < 40) advisories.push({ label: "Lexical Diversity", score: q.lexicalDiversity, description: "Vocabulary is limited.", suggestion: "Try varying word choice — avoid repeating the same words." });
    return advisories;
  }, [fullDocText, skipAllWritingQuality]);

  // Open plagiarism results
  // Plagiarism and close_match enter the edit queue as actionable flags
  // Common knowledge and quotation are informational — shown in detail panel only
  const openPlagiarismResults = useMemo(
    () => plagiarismResults.filter((r) => (r.verdict === "plagiarism" || r.verdict === "close_match") && r.status === "open"),
    [plagiarismResults]
  );

  // Citations needing review — surfaced as the final, separate step on the
  // Citations tab (never in the edit queue). Counts any open citation, whether
  // it has a structural issue or a failed verification.
  const citationsNeedingReview = useMemo(() => {
    return docCitations.filter((c) => {
      if (c.status !== "open") return false;
      const hasStructuralIssue = (c.structuralFlags ?? []).length > 0;
      const verdict = c.verificationFlags?.verdict;
      const hasVerifyIssue = verdict === "unverified" || verdict === "wrong_details";
      return hasStructuralIssue || hasVerifyIssue;
    }).length;
  }, [docCitations]);

  // Flat tick list consumed by the heatmap scrollbar — every reviewable issue
  // in the document rendered as one tick at its section's position. Different
  // issue types get different colours so the heatmap doubles as a legend.
  const heatmapTicks = useMemo<HeatmapTick[]>(() => {
    const out: HeatmapTick[] = [];
    for (const flag of flags) {
      if (flag.status !== "open" && flag.status !== "generation_failed") continue;
      out.push({
        id: `flag-${flag.id}`,
        sectionId: flag.sectionId,
        kind: flag.patternType?.startsWith("artifact") ? "artifact" : "ai",
        label: flag.flaggedPhrase,
      });
    }
    // Both actionable plagiarism verdicts get ticks — mirrors the edit-queue
    // filter (openPlagiarismResults), so every queue item has a mark.
    for (const result of plagiarismResults) {
      if ((result.verdict !== "plagiarism" && result.verdict !== "close_match") || result.status !== "open" || !result.sectionId) continue;
      out.push({
        id: `plag-${result.id}`,
        sectionId: result.sectionId,
        kind: "plagiarism",
      });
    }
    return out;
  }, [flags, plagiarismResults]);

  // ── Review diff: scroll sync ───────────────────────────────────────────

  const handleDiffScroll = useCallback((source: "doc" | "edit") => {
    if (diffSyncingRef.current) return;
    diffSyncingRef.current = true;

    const sourceRef = source === "doc" ? diffDocRef.current : diffEditRef.current;
    const targetRef = source === "doc" ? diffEditRef.current : diffDocRef.current;
    if (!sourceRef || !targetRef) { diffSyncingRef.current = false; return; }

    // Proportional scroll sync
    const ratio = sourceRef.scrollTop / (sourceRef.scrollHeight - sourceRef.clientHeight || 1);
    targetRef.scrollTop = ratio * (targetRef.scrollHeight - targetRef.clientHeight);

    requestAnimationFrame(() => { diffSyncingRef.current = false; });
  }, []);

  useEffect(() => {
    const docEl = diffDocRef.current;
    const editEl = diffEditRef.current;
    if (!docEl || !editEl || workspaceMode !== "review") return;

    const onDocScroll = () => handleDiffScroll("doc");
    const onEditScroll = () => handleDiffScroll("edit");
    docEl.addEventListener("scroll", onDocScroll, { passive: true });
    editEl.addEventListener("scroll", onEditScroll, { passive: true });
    return () => {
      docEl.removeEventListener("scroll", onDocScroll);
      editEl.removeEventListener("scroll", onEditScroll);
    };
  }, [workspaceMode, handleDiffScroll]);

  // ── Review diff: resolved changes ──────────────────────────────────────

  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);

  const resolvedChanges = useMemo(() => {
    let num = 0;
    return flags
      .filter((f) => f.status === "accepted")
      .map((f) => {
        const section = sectionMap.get(f.sectionId);
        const replacementText =
          f.manualReplacement ??
          flagOptions.find((o) => o.id === f.acceptedOptionId)?.text ??
          null;
        return {
          id: f.id,
          sectionId: f.sectionId,
          sectionIndex: section?.index ?? 0,
          originalPhrase: f.flaggedPhrase,
          replacementText: replacementText ?? "",
          explanation: f.explanation,
          patternType: f.patternType,
          phraseStart: f.phraseStart,
          phraseEnd: f.phraseEnd,
          changeNumber: 0,
        };
      })
      .filter((c) => c.replacementText !== "")
      .sort((a, b) => a.sectionIndex !== b.sectionIndex ? a.sectionIndex - b.sectionIndex : a.phraseStart - b.phraseStart)
      .map((c) => ({ ...c, changeNumber: ++num }));
  }, [flags, flagOptions, sectionMap]);

  const reviewStats = useMemo(() => ({
    acceptedCount: flags.filter((f) => f.status === "accepted").length,
    rejectedCount: flags.filter((f) => f.status === "rejected").length,
    skippedCount: flags.filter((f) => f.status === "skipped").length,
    totalFlags: flags.length,
  }), [flags]);

  // ── Unified Edit Queue ────────────────────────────────────────────────
  const editQueue = useMemo((): EditQueueItem[] => {
    const queue: EditQueueItem[] = [];

    // 1. AI Detection flags
    for (const flag of openFlags) {
      queue.push({ type: "ai_detection", flag });
    }

    // 2. Artifact batch flag — stays as long as there are findings or processed history
    if (artifactFindings.length > 0 || Object.keys(processedArtifacts).length > 0) {
      queue.push({ type: "artifact_batch", findings: artifactFindings });
    }

    // 3. Individual artifact flags (from "Ask" processing)
    for (const flag of artifactFlags) {
      queue.push({ type: "artifact_individual", flag });
    }

    // 4. Writing quality advisories
    for (const advisory of writingQualityAdvisories) {
      queue.push({ type: "writing_quality", advisory });
    }

    // 5. Plagiarism matches
    for (const result of openPlagiarismResults) {
      queue.push({ type: "plagiarism", result });
    }

    // Citations are intentionally NOT part of the edit queue. They are reviewed
    // only on the Citations tab, as the final step once all edits are complete —
    // fixing citations mid-edit is wasted effort because rewrites can move,
    // merge, or remove the surrounding text. See section 10 of the PRD.

    // 6. Spelling batch
    const spellingFindings = (activeDoc?.spellingResults as import("@/lib/analysis/grammar-spelling-types").SpellingFinding[] | null) || [];
    if (spellingFindings.length > 0) {
      queue.push({ type: "spelling_batch", findings: spellingFindings });
    }

    // 7. Grammar batch
    const grammarFindings = (activeDoc?.grammarResults as import("@/lib/analysis/grammar-spelling-types").GrammarFinding[] | null) || [];
    if (grammarFindings.length > 0) {
      queue.push({ type: "grammar_batch", findings: grammarFindings });
    }

    return queue;
  }, [openFlags, artifactFindings, artifactFlags, writingQualityAdvisories, openPlagiarismResults, processedArtifacts, activeDoc?.spellingResults, activeDoc?.grammarResults]);

  // Current queue item
  const currentQueueItem = editQueue[selectedFlagIdx] ?? null;
  const currentFlag = currentQueueItem?.type === "ai_detection" || currentQueueItem?.type === "artifact_individual"
    ? currentQueueItem.flag
    : null;
  // The passage the current NON-flag queue item is editing — drives the doc
  // panel's violet highlight + auto-scroll for plagiarism items, exactly like
  // currentFlag does for AI-detection flags.
  const currentPassage =
    currentQueueItem?.type === "plagiarism" && currentQueueItem.result.sectionId
      ? { sectionId: currentQueueItem.result.sectionId, text: currentQueueItem.result.passageText }
      : null;
  const currentSection = currentFlag ? sectionMap.get(currentFlag.sectionId) ?? null : null;
  const currentOptions = currentFlag ? flagOptions.filter((o) => o.flagId === currentFlag.id) : [];

  // Alignment across the current options: what they all share vs. where they
  // diverge. Powers the only-show-the-difference option cards and morph stage.
  // Artifact flags are tiny punctuation swaps — alignment adds nothing there.
  const optionAlignKey =
    currentFlag?.patternType === "ai_artifact"
      ? "artifact"
      : currentOptions.map((o) => o.id).join("|") + "#" + currentOptions.reduce((n, o) => n + o.text.length, 0);
  const optionAlignment = useMemo(
    () =>
      currentFlag?.patternType === "ai_artifact" || currentOptions.length < 2
        ? null
        : alignOptions(currentOptions.map((o) => o.text)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionAlignKey]
  );
  // Just the divergent blocks, in order — the "changes" the play walkthrough steps through.
  const divergentBlocks = useMemo(
    () => (optionAlignment ?? []).filter((b): b is Extract<AlignBlock, { kind: "divergent" }> => b.kind === "divergent"),
    [optionAlignment]
  );

  // Flag count excludes advisory items
  const actionableFlagCount = editQueue.filter((item) => item.type !== "writing_quality").length;

  // ── Auditor Score (composite) ───────────────────────────────────────
  const objectiveAuditorScore = useMemo(() => {
    if (!activeDoc) return null;

    const extractionMeta = activeDoc.extractionMeta;
    if (extractionMeta?.sourceType === "pdf" && extractionMeta.confidence === "low") {
      return null;
    }

    // Normalize all scores to "higher = better" (0-100)
    const scores: { key: string; value: number | null; weight: number }[] = [
      { key: "aiDetectability", value: activeDoc.aiRiskScore != null ? 100 - activeDoc.aiRiskScore : null, weight: 25 },
      { key: "aiArtifacts", value: activeDoc.aiArtifactScore ?? null, weight: 12 }, // stored as 100=clean, already correct direction
      { key: "writingQuality", value: activeDoc.writingQualityScore ?? null, weight: 10 },
      { key: "plagiarism", value: activeDoc.plagiarismScore != null
        ? 100 - activeDoc.plagiarismScore
        : plagiarismResults.length > 0
          ? (() => {
              // Fallback: calculate from results for docs scanned before plagiarismScore was persisted
              const plagOnly = plagiarismResults.filter((r) => r.verdict === "plagiarism");
              const closeOnly = plagiarismResults.filter((r) => r.verdict === "close_match");
              const checked = plagiarismResults.filter((r) => r.verdict !== "error").length;
              if (checked === 0) return null;
              const plagW = plagOnly.reduce((s, r) => s + (r.confidence ?? 0.5), 0);
              const closeW = closeOnly.reduce((s, r) => s + (r.confidence ?? 0.5) * 0.15, 0);
              const rawPlag = Math.round(((plagW + closeW) / checked) * 100);
              return 100 - rawPlag;
            })()
          : null, weight: 30 },
      { key: "citations", value: activeDoc.citationsScore ?? null, weight: 15 },
      { key: "toneConsistency", value: activeDoc.toneConsistencyScore ?? null, weight: 8 },
    ];

    // Filter to only computed scores
    const active = scores.filter((s) => s.value !== null) as { key: string; value: number; weight: number }[];
    if (active.length === 0) return null;

    // Redistribute weights
    const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = active.reduce((sum, s) => sum + s.value * (s.weight / totalWeight), 0);

    let composite = weightedSum;

    // Floor penalties for deal-breakers
    const normPlag = scores.find((s) => s.key === "plagiarism")?.value;
    const normAI = scores.find((s) => s.key === "aiDetectability")?.value;
    if (normPlag !== null && normPlag !== undefined && normPlag < 50) composite = Math.min(composite, 30);
    if (normAI !== null && normAI !== undefined && normAI < 30) composite = Math.min(composite, 40);

    return Math.round(composite);
  }, [activeDoc, plagiarismResults]);

  // ── Auto-scroll Doc Panel to active section ─────────────────────────────

  useEffect(() => {
    const targetSectionId = currentFlag?.sectionId ?? currentPassage?.sectionId;
    if (!targetSectionId) return;
    const el = document.querySelector(`[data-section-id="${targetSectionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFlag, currentPassage?.sectionId]);

  // ── Background suggestion generation: auto-start / auto-resume ───────────
  // Whenever a scanned doc has open flags still missing options and no loop is
  // running, (re)start the loop. Covers both "right after scan" and "reopened a
  // half-generated doc". The genLoopRef guard makes re-runs cheap no-ops.
  useEffect(() => {
    if (!activeDocId || scanning || genLoopRef.current) return;
    const missing = flags.some((f) =>
      f.status === "open" &&
      f.patternType !== "ai_artifact" &&
      f.patternType !== "writing_quality" &&
      f.patternType !== "plagiarism_match" &&
      !flagOptions.some((o) => o.flagId === f.id));
    if (missing) void runGenerationLoop(activeDocId);
    // generatingIds is a dep so that when a previous loop releases (e.g. after a
    // document switch) this re-evaluates and restarts for any remaining work.
  }, [activeDocId, scanning, flags, flagOptions, generatingIds, runGenerationLoop]);

  // ── Never-stuck fallback ────────────────────────────────────────────────
  // If the user lands on a flag with no options and the loop isn't running (so it
  // won't reach it on its own), generate that one flag on demand.
  useEffect(() => {
    if (!currentFlag || genLoopRef.current) return;
    if (currentFlag.patternType === "ai_artifact") return;
    if (flagGenState(currentFlag) !== "pending") return;
    void generateOneFlag(currentFlag.id);
  }, [currentFlag, flagGenState, generateOneFlag]);

  // ── JSX ────────────────────────────────────────────────────────────────

  // Scan button JSX — extracted so it can live inside the floating Command Capsule.
  // Uses the same state machine as before; styling updated to a pill that fits the capsule.
  const scanButton = (
    <div className="relative group">
      <button
        onClick={() => {
          if (hasScanned && !scanViewed) {
            setNav("workspace"); setWorkspaceMode("dashboard");
            setScanViewed(true);
          } else if (!hasScanned || versionSavedSinceScan) {
            setShowScanDialog(true);
          }
        }}
        disabled={!activeDocId || scanning || (hasScanned && scanViewed && !versionSavedSinceScan)}
        className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40 ${
          hasScanned && !scanViewed && !suggestProgress.generating ? "bg-green-600 hover:bg-green-700" :
          suggestProgress.generating ? "bg-amber-500" :
          "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {scanning ? "Scanning…" : suggestProgress.generating ? "Preparing…" : hasScanned && !scanViewed ? "Scanned" : "Scan"}
      </button>
      {hasScanned && scanViewed && !versionSavedSinceScan && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded border border-gray-200 bg-white p-2 text-[10px] text-gray-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
          Already scanned. Save this version first to run a new scan. Your edits will be preserved.
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-gray-100 text-sm">

      {/* ═══ Static top bar — wordmark + doc switcher ═══════════════════════ */}
      <header className="relative flex shrink-0 items-center border-b border-gray-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        {/* Subtle brand-area radial glow — sits behind the logo only. 5% blue tint. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-72"
          style={{
            background:
              "radial-gradient(ellipse 200px 60px at 72px center, rgba(37, 99, 235, 0.06), transparent 70%)",
          }}
        />

        <div className="relative flex min-w-0 flex-1 items-center gap-3">
          {/* Wordmark — swaps to white variant in dark mode */}
          <img
            src="/brand/ezsay-wordmark-black.svg"
            alt="EzSay"
            className="block h-6 w-auto select-none dark:hidden"
          />
          <img
            src="/brand/ezsay-wordmark-white.svg"
            alt=""
            aria-hidden
            className="hidden h-6 w-auto select-none dark:block"
          />

          {/* Sidebar pin/collapse toggle (Lucide PanelLeft icons) */}
          <button
            onClick={() => setNavPinned((v) => !v)}
            title={navPinned ? "Collapse sidebar" : "Keep sidebar expanded"}
            aria-pressed={navPinned}
            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-slate-800 dark:hover:text-gray-300"
          >
            {navPinned ? (
              // PanelLeftClose
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m16 15-3-3 3-3" />
              </svg>
            ) : (
              // PanelLeftOpen
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m14 9 3 3-3 3" />
              </svg>
            )}
          </button>

          <span className="h-4 w-px bg-gray-200 dark:bg-slate-700" />

          {/* ── Document selector — breadcrumb / search style ─────────────── */}
          <DocSwitcher
            docs={docs}
            activeDoc={activeDoc}
            activeDocId={activeDocId}
            onSelect={selectDocument}
            onNewDoc={() => { setShowUpload(true); setNav("library"); setShowLibraryPanel(true); }}
            onRename={handleRenameDoc}
          />
        </div>

        {/* Scan pill + Auditor score — right-aligned in header */}
        <CommandCapsule scanSlot={scanButton} score={objectiveAuditorScore} />
      </header>

      {/* Usage warning banner */}
      {usageWarnings.length > 0 && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-xs text-amber-700">
            {usageWarnings.map((w) => {
              const labels: Record<string, string> = {
                monthlyWordLimit: `monthly word limit (${w.current.toLocaleString()} / ${w.limit.toLocaleString()})`,
                monthlyScanLimit: `monthly scan limit (${w.current} / ${w.limit})`,
                documentStorageLimit: `document storage (${w.current} / ${w.limit})`,
              };
              return `You've used ${w.percent}% of your ${labels[w.key] ?? w.key}`;
            }).join(". ")}
            . Upgrade for more.
          </p>
          <button
            onClick={() => setUsageWarnings([])}
            className="ml-4 shrink-0 text-xs text-amber-500 hover:text-amber-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ═══ Body: nav rail + panels ═════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── Icon rail nav (Supabase-style) ──────────────────────────────── */}
        <nav
          onMouseEnter={() => setNavExpanded(true)}
          onMouseLeave={() => setNavExpanded(false)}
          className={`shrink-0 flex flex-col border-r border-gray-300 bg-white transition-all duration-200 dark:border-slate-700 dark:bg-slate-900 ${navExpanded || navPinned ? "w-44" : "w-12"}`}
        >
          <div className="flex-1 py-2">
            {/* Home — EzSay mark linking to the landing page */}
            <Link
              href="/"
              title="Home"
              className="flex w-full items-center gap-3 px-1 py-2.5 text-left text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            >
              <img
                src="/brand/ezsay-mark-black.svg"
                alt=""
                className="h-10 w-10 shrink-0 select-none"
              />
              {(navExpanded || navPinned) && <span className="truncate text-sm">Home</span>}
            </Link>

            <div className="my-1.5 mx-3 border-t border-gray-100" />

            {/* Library */}
            <NavButton label="Library" active={nav === "library" || showLibraryPanel} expanded={navExpanded || navPinned} onClick={() => { setShowLibraryPanel(!showLibraryPanel); if (!showLibraryPanel) setNav("library"); }}
              icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>}
            />
            {/* Add New Doc — indented under Library */}
            <button
              onClick={() => { setShowLibraryPanel(true); setShowUpload(true); }}
              title="Add New Doc"
              className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              style={navExpanded || navPinned ? { paddingLeft: "2.25rem" } : undefined}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              {(navExpanded || navPinned) && <span className="text-xs truncate">Add New Doc</span>}
            </button>

            <div className="my-1.5 mx-3 border-t border-gray-100" />

            {/* Workspace — prominent home destination */}
            <NavButton
              label="Workspace"
              prominent
              active={nav === "workspace"}
              expanded={navExpanded || navPinned}
              onClick={() => {
                setNav("workspace");
                if (!activeDoc) setShowLibraryPanel(true);
              }}
              icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>}
            />

            <div className="my-1.5 mx-3 border-t border-gray-100" />

            {/* Style Rules */}
            <NavButton label="Style Rules" active={nav === "style-rules"} expanded={navExpanded || navPinned} onClick={() => setNav("style-rules")}
              icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
            />

          </div>

          {/* Utility links: Watch Demo (how-it-works refresher) + Admin */}
          <div className="border-t border-gray-200 py-2">
            {/* Opens in a new tab so an in-progress edit session isn't lost */}
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              title="Watch Demo"
              className="flex w-full items-center gap-3 px-3.5 py-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113A.375.375 0 0 1 9.75 15.113V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" /></svg>
              {(navExpanded || navPinned) && <span className="text-xs truncate">Watch Demo</span>}
            </a>
            <a
              href="/admin"
              title="Admin Panel"
              className="flex w-full items-center gap-3 px-3.5 py-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              {(navExpanded || navPinned) && <span className="text-xs truncate">Admin Panel</span>}
            </a>
            <LogoutButton
              title="Log Out"
              className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
              {(navExpanded || navPinned) && <span className="text-xs truncate">Log Out</span>}
            </LogoutButton>
          </div>
        </nav>

        <div className="flex flex-1 min-w-0">

          {/* ── Library Panel (hidden once a doc is loaded) ───────────────── */}
          {showLibraryPanel && (
          <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <div onClick={() => setShowLibraryPanel(false)} className="border-b border-gray-100 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50" title="Collapse library (L)">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Library</h2>
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {/* Upload form — only shown when triggered from nav "Add New Doc" */}
              {showUpload && (
                <div className="mb-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">New Document</span>
                    <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Step 1: Upload file or paste text */}
                  {!uploadFile && !pasteText.trim() && (
                    <p className="text-[10px] text-gray-500">Upload a file or paste your text below.</p>
                  )}

                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setUploadFile(f); setUploadTitle(f.name.replace(/\.[^.]+$/, "")); }}}
                    onClick={() => !uploadFile && fileInputRef.current?.click()}
                    className={`flex min-h-[70px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-xs transition-colors ${
                      dragOver ? "border-blue-400 bg-blue-100" :
                      uploadFile ? "border-green-300 bg-green-50 cursor-default" :
                      "border-gray-300 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    {uploadFile ? (
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        <span className="text-green-700 font-medium">{uploadFile.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); setUploadFile(null); setUploadTitle(""); }} className="ml-1 text-gray-400 hover:text-red-500">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <svg className="h-5 w-5 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                        <span className="text-gray-500">Drop file or click to browse</span>
                        <span className="text-[9px] text-gray-400 mt-0.5">.pdf, .docx, or .txt</span>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setUploadTitle(f.name.replace(/\.[^.]+$/, "")); }}} className="hidden" />
                  </div>

                  {!uploadFile && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-px bg-gray-300" />
                        <span className="text-[9px] text-gray-400">or</span>
                        <div className="flex-1 h-px bg-gray-300" />
                      </div>
                      <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3} placeholder="Paste your text here..." className="block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none" />
                    </div>
                  )}

                  {/* Step 2: Title (auto-filled from filename, always editable) */}
                  {(uploadFile || pasteText.trim()) && (
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Document Name</label>
                      <input
                        type="text"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder={pasteText.trim() ? "Give your document a name..." : ""}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Step 3: Document type (shown after content is provided) */}
                  {(uploadFile || pasteText.trim()) && (
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Document Type</label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {DOC_TYPES.map((dt) => (
                          <button key={dt.value} onClick={() => setUploadDocType(dt.value)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${uploadDocType === dt.value ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>{dt.label}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload button */}
                  <button
                    onClick={handleUpload}
                    disabled={uploading || (!uploadFile && !pasteText.trim())}
                    className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              )}

              {/* Document list — accordion with version history */}
              {docs.map((doc) => {
                const isExpanded = expandedDocIds.has(doc.id);
                const versions = libraryVersions[doc.id] || [];
                return (
                  <div key={doc.id} className="mb-0.5">
                    <div className={`group relative flex w-full items-center rounded px-2 py-1.5 text-left ${activeDocId === doc.id ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}>
                      {/* Expand/collapse chevron */}
                      {doc.versionCount > 0 ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDocExpanded(doc.id); }}
                          className="mr-1 shrink-0 text-gray-400 hover:text-gray-600"
                        >
                          <svg className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                      ) : (
                        <span className="mr-1 w-3 shrink-0" />
                      )}
                      {/* Doc title and metadata — clickable to select */}
                      <button onClick={() => selectDocument(doc.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-xs font-medium">{doc.title}</p>
                          {doc.extractionMeta?.sourceType === "pdf" && doc.extractionMeta.confidence === "low" && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700" title="Partial text extraction">
                              Partial
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {doc.versionCount > 0 ? (
                            <>
                              {formatShortDate(doc.firstVersionDate!)}
                              {doc.firstVersionDate !== doc.lastVersionDate && <> to {formatShortDate(doc.lastVersionDate!)}</>}
                              {" "}<span className="text-gray-500">{doc.versionCount}v</span>
                            </>
                          ) : (
                            formatShortDate(doc.createdAt)
                          )}
                        </p>
                      </button>
                      {doc.aiRiskScore != null && <span className={`ml-1 text-xs font-bold ${scoreColor(doc.aiRiskScore)}`}>{doc.aiRiskScore}</span>}
                      {/* Per-document actions — kebab menu, shown on hover */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setDocMenuId(docMenuId === doc.id ? null : doc.id); }}
                        title="Document actions"
                        className={`ml-1 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 ${docMenuId === doc.id ? "" : "opacity-0 group-hover:opacity-100"}`}
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" /></svg>
                      </button>
                      {docMenuId === doc.id && (
                        <>
                          {/* Click-away backdrop */}
                          <div className="fixed inset-0 z-10" onClick={() => setDocMenuId(null)} />
                          <div className="absolute right-1 top-8 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              onClick={() => { setDocMenuId(null); selectDocument(doc.id); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                              Open
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(doc.id, doc.title)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Version accordion */}
                    {isExpanded && (
                      <div className="ml-5 border-l border-gray-200 pl-2 py-1 space-y-0.5">
                        {versions.length === 0 && (
                          <p className="text-[9px] text-gray-400 py-1">Loading versions...</p>
                        )}
                        {versions.map((v) => (
                          <div key={v.id} className="flex items-center justify-between rounded px-1.5 py-1 text-[10px] hover:bg-gray-50">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-gray-600">{v.versionLabel || `v${v.versionNumber}`}</span>
                              <span className="ml-1.5 text-gray-400">{formatShortDate(v.createdAt)}</span>
                            </div>
                            {v.aiRiskScore != null && (
                              <span className={`ml-1 text-[10px] font-bold ${scoreColor(v.aiRiskScore)}`}>{v.aiRiskScore}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {docs.length === 0 && (
                <p className="py-6 text-center text-xs text-gray-400">No documents in library. Use &quot;Add New Doc&quot; in the menu to get started.</p>
              )}
            </div>
          </div>
          )}

          {/* ── Doc Panel (collapsible strip when closed) ─────────────────── */}
          {activeDoc ? (
            showDocPanel ? (
              /* Expanded Doc Panel — equal size in review mode, flex-3 otherwise */
              <div className={`${workspaceMode === "review" ? "flex-1 min-w-[250px]" : showEditPanel ? "flex-[3] min-w-[250px]" : "flex-1 min-w-[250px]"} border-r border-gray-200 bg-white flex flex-col`}>
                <div onClick={() => setShowDocPanel(false)} className="border-b border-gray-100 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50" title="Collapse document panel (D)">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{workspaceMode === "review" ? "Original" : "Document"}</h2>
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </div>
                <div className="flex flex-1 min-h-0">
                  {workspaceMode === "review" ? (
                    <DiffDocPanel
                      sections={sections}
                      changes={resolvedChanges}
                      activeChangeId={activeChangeId}
                      onChangeClick={setActiveChangeId}
                      scrollRef={diffDocRef}
                    />
                  ) : (
                  <div ref={docScrollRef} className="flex-1 overflow-auto p-3">
                    <div className="space-y-1">
                    {sections.map((section) => {
                      const isActive =
                        (currentFlag && section.id === currentFlag.sectionId) ||
                        (currentPassage && section.id === currentPassage.sectionId);
                      const sectionFlags = flags.filter((f) => f.sectionId === section.id);
                      const hasFlags = sectionFlags.length > 0;
                      const allResolved = hasFlags && sectionFlags.every((f) => f.status !== "open" && f.status !== "generation_failed");
                      const hasOpenFlags = sectionFlags.some((f) => f.status === "open" || f.status === "generation_failed");

                      let sectionColor = "text-gray-700 hover:bg-gray-50";
                      if (section.isLocked) {
                        sectionColor = "text-gray-400 bg-gray-50 cursor-default";
                      } else if (isActive) {
                        sectionColor = "text-gray-900 border-l-2 border-violet-400";
                      } else if (allResolved) {
                        sectionColor = "bg-green-50 text-gray-600";
                      } else if (hasOpenFlags) {
                        sectionColor = "bg-pink-50 text-gray-700";
                      }

                      // Three-layer highlighting for the active flag:
                      // 1. Normal text (no background)
                      // 2. The sentence containing the flag (yellow)
                      // 3. The specific flagged phrase (amber)
                      const renderSectionText = () => {
                        if (section.isLocked) return <><span className="text-[10px] text-gray-400">[Citations] </span>{section.currentText}</>;
                        // Citation highlight takes priority
                        if (highlightedCitationText && section.currentText.includes(highlightedCitationText)) {
                          const cidx = section.currentText.indexOf(highlightedCitationText);
                          return (
                            <>
                              {section.currentText.slice(0, cidx)}
                              <mark data-citation-highlight className="rounded bg-blue-200 px-0.5 text-gray-900 font-medium ring-2 ring-blue-400">{highlightedCitationText}</mark>
                              {section.currentText.slice(cidx + highlightedCitationText.length)}
                            </>
                          );
                        }
                        // Plagiarism queue item: highlight the whole passage
                        // being reviewed in violet — same "being edited" colour
                        // as flag highlighting, so the doc panel always shows
                        // what the centre panel is working on.
                        if (currentPassage && section.id === currentPassage.sectionId) {
                          const pidx = section.currentText.indexOf(currentPassage.text);
                          if (pidx !== -1) {
                            return (
                              <>
                                {section.currentText.slice(0, pidx)}
                                <mark className="rounded bg-violet-100 px-0.5 text-gray-900 ring-1 ring-violet-400">{currentPassage.text}</mark>
                                {section.currentText.slice(pidx + currentPassage.text.length)}
                              </>
                            );
                          }
                          // Passage text no longer matches (edited since scan) —
                          // the violet section border still marks the location.
                        }
                        // Sentence + phrase highlighting for active flag
                        if (isActive && currentFlag && currentFlag.phraseStart >= 0 && currentFlag.phraseEnd > currentFlag.phraseStart) {
                          const text = section.currentText;
                          const pStart = Math.min(currentFlag.phraseStart, text.length);
                          const pEnd = Math.min(currentFlag.phraseEnd, text.length);

                          // Find sentence boundaries around the flagged phrase
                          let sentStart = pStart;
                          while (sentStart > 0) {
                            const ch = text[sentStart - 1];
                            if ((ch === "." || ch === "!" || ch === "?") && sentStart < pStart && (text[sentStart] === " " || text[sentStart] === "\n")) break;
                            sentStart--;
                          }
                          // Skip leading whitespace
                          while (sentStart < pStart && (text[sentStart] === " " || text[sentStart] === "\n")) sentStart++;

                          let sentEnd = pEnd;
                          while (sentEnd < text.length) {
                            const ch = text[sentEnd];
                            if (ch === "." || ch === "!" || ch === "?") { sentEnd++; break; }
                            sentEnd++;
                          }

                          // Check if phrase IS the whole sentence
                          const phraseIsSentence = sentStart === pStart && sentEnd === pEnd;

                          if (phraseIsSentence) {
                            // Entire sentence is the flag — the "being edited" passage, in violet
                            return (
                              <>
                                {text.slice(0, sentStart)}
                                <mark className="rounded bg-violet-200 px-0.5 text-gray-900 font-medium ring-1 ring-violet-400">{text.slice(pStart, pEnd)}</mark>
                                {text.slice(sentEnd)}
                              </>
                            );
                          }

                          // Three layers: normal → violet sentence → violet phrase → violet sentence → normal.
                          // Violet marks "the passage being edited", distinct from the centre's amber options.
                          return (
                            <>
                              {text.slice(0, sentStart)}
                              <span className="bg-violet-100 rounded-sm">{text.slice(sentStart, pStart)}</span>
                              <mark className="rounded bg-violet-200 px-0.5 text-gray-900 font-medium ring-1 ring-violet-400">{text.slice(pStart, pEnd)}</mark>
                              <span className="bg-violet-100 rounded-sm">{text.slice(pEnd, sentEnd)}</span>
                              {text.slice(sentEnd)}
                            </>
                          );
                        }
                        return <>{section.currentText}</>;
                      };

                      return (
                        <div
                          key={section.id}
                          data-section-id={section.id}
                          onClick={() => {
                            const idx = openFlags.findIndex((f) => f.sectionId === section.id);
                            if (idx !== -1) { setSelectedFlagIdx(idx); setSelectedOptionIdx(null); }
                          }}
                          className={`cursor-pointer rounded px-2 py-1.5 text-xs leading-relaxed transition-colors ${sectionColor}`}
                        >
                          {renderSectionText()}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  )}
                  {workspaceMode !== "review" && (
                    <HeatmapScrollbar
                      scrollRef={docScrollRef}
                      ticks={heatmapTicks}
                      onNavigate={(sectionId) => {
                        const idx = openFlags.findIndex((f) => f.sectionId === sectionId);
                        if (idx !== -1) { setSelectedFlagIdx(idx); setSelectedOptionIdx(null); }
                      }}
                      activeSectionId={currentFlag?.sectionId ?? null}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Collapsed strip */
              <div
                onClick={() => setShowDocPanel(true)}
                title="Expand document panel (D)"
                className="w-7 shrink-0 border-r border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors"
              >
                {/* Chevron right at top */}
                <div className="py-2">
                  <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </div>
                {/* Vertical "Doc" label */}
                <div className="pt-1">
                  <span className="text-xs font-semibold text-gray-400 tracking-wider" style={{ writingMode: "vertical-rl" }}>Doc</span>
                </div>
                <div className="flex-1" />
                {/* Keyboard shortcut badge at bottom */}
                <div className="py-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 text-[9px] text-gray-400 font-mono">D</span>
                </div>
              </div>
            )
          ) : (
            /* No doc loaded — show empty strip */
            showDocPanel ? (
              <div className={`${showEditPanel ? "flex-[3] min-w-[250px]" : "flex-1 min-w-[250px]"} border-r border-gray-200 bg-white flex flex-col`}>
                <div onClick={() => setShowDocPanel(false)} className="border-b border-gray-100 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50" title="Collapse document panel (D)">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Document</h2>
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </div>
                <EmptyPanel
                  title="Document"
                  description="Load a document from the Library to see its text here. The active section will be highlighted green as you work through flags."
                />
              </div>
            ) : (
              <div
                onClick={() => setShowDocPanel(true)}
                title="Expand document panel (D)"
                className="w-7 shrink-0 border-r border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors"
              >
                <div className="py-2">
                  <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </div>
                <div className="pt-1">
                  <span className="text-xs font-semibold text-gray-300 tracking-wider" style={{ writingMode: "vertical-rl" }}>Doc</span>
                </div>
                <div className="flex-1" />
                <div className="py-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 text-[9px] text-gray-400 font-mono">D</span>
                </div>
              </div>
            )
          )}

          {/* ── Edit Panel (collapsible) ──────────────────────────────────── */}
          {showEditPanel ? (
          <div className="flex flex-[5] flex-col min-w-[300px] bg-white border-r border-gray-200">
            {/* Workspace mode strip replaces the title bar when in workspace with a doc */}
            {nav === "workspace" && activeDoc ? (
              <WorkspaceModeStrip mode={workspaceMode} onModeChange={(m) => { setWorkspaceMode(m); if (m === "review") { setShowDocPanel(true); trackEvent("review_tab_opened"); } }} onCollapse={() => setShowEditPanel(false)} />
            ) : (
              <div onClick={() => setShowEditPanel(false)} className="border-b border-gray-100 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50" title="Collapse edit panel (E)">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {nav === "intake" ? "Context" : nav === "style-rules" ? "Style Rules" : "Edit"}
                </h2>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {/* ── Dashboard — scan results + analysis ──── */}
              {nav === "workspace" && workspaceMode === "dashboard" && (
                <AnalysisPanel
                  document={activeDoc}
                  versions={docVersions}
                  flags={flags}
                  plagiarismResults={plagiarismResults}
                  plagiarismLoading={plagiarismLoading}
                  scanning={scanning}
                  documentText={fullDocText}
                  suggestionsGenerating={suggestProgress.generating}
                  suggestionsProgress={suggestProgress}
                  toneCheckDone={activeDoc?.toneConsistencyScore != null}
                  plagiarismEnabled={scanConfig.categories.plagiarism}
                  toneEnabled={scanConfig.categories.toneConsistency}
                  onStartEditing={() => { setNav("workspace"); setWorkspaceMode("edit"); }}
                  onGoToCitations={() => { setNav("workspace"); setWorkspaceMode("citations"); }}
                />
              )}

              {/* ── Edit ────────────────────────────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && !currentFlag && !activeDoc && (
                <EmptyPanel
                  title="Editing Panel"
                  description="This is where you review and fix flagged AI patterns one by one. Your original text is shown prominently at the top. Below it, numbered replacement options show how the text could be rewritten. The choices panel on the right lets you confirm, skip, or reject."
                />
              )}

              {nav === "workspace" && workspaceMode === "edit" && activeDoc && !currentQueueItem && hasScanned && (
                <EditSessionSummary
                  flags={flags}
                  spellingRemaining={((activeDoc.spellingResults as import("@/lib/analysis/grammar-spelling-types").SpellingFinding[]) || []).length}
                  grammarRemaining={((activeDoc.grammarResults as import("@/lib/analysis/grammar-spelling-types").GrammarFinding[]) || []).length}
                  artifactsRemaining={leftoverArtifactCount}
                  onReviewArtifacts={() => {
                    const idx = editQueue.findIndex((item) => item.type === "artifact_batch");
                    if (idx !== -1) { setSelectedFlagIdx(idx); setSelectedOptionIdx(null); }
                  }}
                  onSaveVersion={handleSaveVersion}
                  citationsPending={citationsNeedingReview}
                  onGoToCitations={() => { setNav("workspace"); setWorkspaceMode("citations"); }}
                />
              )}

              {nav === "workspace" && workspaceMode === "edit" && activeDoc && !currentQueueItem && !hasScanned && (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center max-w-sm">
                    <p className="text-3xl font-bold text-gray-300">Ready to scan</p>
                    <p className="mt-4 text-sm text-gray-500">Your document is loaded. The next step is to scan it for issues.</p>
                    <p className="mt-6 text-base font-semibold text-blue-600 animate-[intake-pulse_0.6s_ease-in-out_3]">Click the Scan button in the top-right corner</p>
                    <p className="mt-2 text-xs text-gray-400">You can choose which checks to run and how thorough to be.</p>
                  </div>
                </div>
              )}

              {/* ── Shared navigation bar for all queue item types ──── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem && (
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { if (selectedFlagIdx > 0) { setSelectedFlagIdx(selectedFlagIdx - 1); setSelectedOptionIdx(null); setManualEditText(""); } }}
                        disabled={selectedFlagIdx === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 disabled:opacity-30 disabled:shadow-none transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                      </button>
                      <p className="text-sm font-semibold text-gray-700">{selectedFlagIdx + 1} <span className="text-gray-400 font-normal">of</span> {editQueue.length}</p>
                      <button
                        onClick={() => { if (selectedFlagIdx < editQueue.length - 1) { setSelectedFlagIdx(selectedFlagIdx + 1); setSelectedOptionIdx(null); setManualEditText(""); } }}
                        disabled={selectedFlagIdx >= editQueue.length - 1}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 disabled:opacity-30 disabled:shadow-none transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                      </button>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      currentQueueItem.type === "ai_detection" ? (PATTERN_TYPE_LABELS[currentQueueItem.flag.patternType]?.color?.split(" ").filter(c => c.startsWith("bg-") || c.startsWith("text-")).join(" ") || "bg-amber-100 text-amber-700") :
                      currentQueueItem.type === "artifact_batch" || currentQueueItem.type === "artifact_individual" ? "bg-purple-100 text-purple-700" :
                      currentQueueItem.type === "writing_quality" ? "bg-blue-100 text-blue-700" :
                      currentQueueItem.type === "spelling_batch" ? "bg-red-100 text-red-700" :
                      currentQueueItem.type === "grammar_batch" ? "bg-yellow-100 text-yellow-800" :
                      currentQueueItem.type === "plagiarism" ? (
                        currentQueueItem.result.verdict === "plagiarism" ? "bg-red-100 text-red-700" :
                        currentQueueItem.result.verdict === "close_match" ? "bg-orange-100 text-orange-700" :
                        currentQueueItem.result.verdict === "common_knowledge" ? "bg-yellow-100 text-yellow-700" :
                        currentQueueItem.result.verdict === "quotation" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      ) :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {currentQueueItem.type === "ai_detection" ? (PATTERN_TYPE_LABELS[currentQueueItem.flag.patternType]?.label || "AI Detection") :
                       currentQueueItem.type === "artifact_batch" ? "AI Artifacts" :
                       currentQueueItem.type === "artifact_individual" ? "AI Artifact" :
                       currentQueueItem.type === "writing_quality" ? "Writing Quality (Advisory)" :
                       currentQueueItem.type === "spelling_batch" ? "Spelling Errors" :
                       currentQueueItem.type === "grammar_batch" ? "Grammar Issues" :
                       currentQueueItem.type === "plagiarism" ? (
                         currentQueueItem.result.verdict === "plagiarism" ? "Plagiarism" :
                         currentQueueItem.result.verdict === "close_match" ? "Close Match" :
                         currentQueueItem.result.verdict === "common_knowledge" ? "Common Knowledge" :
                         currentQueueItem.result.verdict === "quotation" ? "Quotation" :
                         "Plagiarism Check"
                       ) : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Artifact Batch Flag ──────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "artifact_batch" && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">AI Artifacts</span>
                    <span className="text-xs text-gray-500">{currentQueueItem.findings.reduce((s, f) => s + f.count, 0)} instances across {currentQueueItem.findings.length} categories</span>
                  </div>
                  <p className="text-xs text-gray-500">Choose how to handle each artifact type. "Remove" auto-processes all instances. "Ask" lets you review each one individually.</p>
                  <div className="space-y-1.5">
                    {currentQueueItem.findings.map((f) => (
                      <details key={f.item} className="rounded-lg border border-gray-200 overflow-hidden">
                        <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 select-none">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-700">{f.item}</span>
                            <span className="ml-2 text-[10px] text-gray-400">({f.count})</span>
                          </div>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {(["remove", "keep", "ask"] as const).map((choice) => (
                              <button
                                key={choice}
                                onClick={() => setArtifactBatchChoices((prev) => ({ ...prev, [f.item]: choice }))}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                                  (artifactBatchChoices[f.item] ?? "ask") === choice
                                    ? choice === "remove" ? "bg-red-100 text-red-700" : choice === "keep" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                              >
                                {choice === "remove" ? "Remove" : choice === "keep" ? "Keep" : "Ask"}
                              </button>
                            ))}
                          </div>
                        </summary>
                        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                          <p className="text-[10px] text-purple-600 font-medium">{getRemovalDescription(f.item)}</p>
                          {f.instances.length > 0 && f.instances[0].matchedText !== "(document-wide)" && (
                            <p className="mt-1 text-[9px] text-gray-400">Example: <span className="font-mono bg-white px-1 rounded border border-gray-200">{f.instances[0].matchedText}</span></p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>

                  {/* Already processed items */}
                  {Object.keys(processedArtifacts).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Processed</p>
                      {Object.entries(processedArtifacts).map(([item, info]) => (
                        <div key={item} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 opacity-60">
                          <div className="flex items-center gap-2">
                            <span className="text-green-500 text-xs">&#10003;</span>
                            <span className="text-[10px] text-gray-500">{item}</span>
                            <span className="text-[9px] text-gray-400">({info.count})</span>
                          </div>
                          <span className={`text-[9px] font-medium ${
                            info.action === "remove" ? "text-red-400" :
                            info.action === "keep" ? "text-green-400" :
                            "text-blue-400"
                          }`}>
                            {info.action === "remove" ? "Removed" : info.action === "keep" ? "Kept" : "Individual flags"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Writing Quality Advisory ─────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "writing_quality" && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Writing Quality</span>
                    <span className="text-[10px] text-gray-400 italic">(Advisory)</span>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">{currentQueueItem.advisory.label}</span>
                      <span className={`text-lg font-bold ${currentQueueItem.advisory.score >= 40 ? "text-amber-600" : "text-red-500"}`}>{currentQueueItem.advisory.score}/100</span>
                    </div>
                    <p className="text-xs text-gray-600">{currentQueueItem.advisory.description}</p>
                    <p className="mt-2 text-xs text-blue-700 font-medium">{currentQueueItem.advisory.suggestion}</p>
                    {currentQueueItem.advisory.examples && currentQueueItem.advisory.examples.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">For example:</p>
                        {currentQueueItem.advisory.examples.map((ex, i) => (
                          <p key={i} className="text-xs text-gray-600 italic border-l-2 border-gray-300 pl-2">&ldquo;{ex}&rdquo;</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Plagiarism Flag ──────────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "plagiarism" && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      currentQueueItem.result.verdict === "plagiarism" ? "bg-red-100 text-red-700" :
                      currentQueueItem.result.verdict === "close_match" ? "bg-orange-100 text-orange-700" :
                      currentQueueItem.result.verdict === "common_knowledge" ? "bg-yellow-100 text-yellow-700" :
                      currentQueueItem.result.verdict === "quotation" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {currentQueueItem.result.verdict === "plagiarism" ? "Plagiarism Match" :
                       currentQueueItem.result.verdict === "close_match" ? "Close Match — Consider Rephrasing" :
                       currentQueueItem.result.verdict === "common_knowledge" ? "Common Knowledge" :
                       currentQueueItem.result.verdict === "quotation" ? "Quotation" :
                       currentQueueItem.result.verdict}
                    </span>
                    {currentQueueItem.result.confidence != null && (
                      <span className="text-[10px] text-gray-400">{Math.round(currentQueueItem.result.confidence * 100)}% confidence</span>
                    )}
                  </div>
                  <div className={`rounded-lg border p-4 ${
                    currentQueueItem.result.verdict === "plagiarism" ? "border-red-200 bg-red-50" :
                    currentQueueItem.result.verdict === "close_match" ? "border-orange-200 bg-orange-50" :
                    currentQueueItem.result.verdict === "common_knowledge" ? "border-yellow-200 bg-yellow-50" :
                    "border-blue-200 bg-blue-50"
                  }`}>
                    <p className="text-sm text-gray-800 leading-relaxed italic">"{currentQueueItem.result.passageText}"</p>
                  </div>
                  {currentQueueItem.result.explanation && (
                    <p className="text-xs text-gray-500">{currentQueueItem.result.explanation}</p>
                  )}
                  {currentQueueItem.result.topMatchUrl && (
                    <div className="rounded border border-gray-200 bg-white p-3">
                      <p className="text-[10px] text-gray-500 mb-1">Matching source:</p>
                      <a href={currentQueueItem.result.topMatchUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        {currentQueueItem.result.topMatchTitle || currentQueueItem.result.topMatchUrl}
                      </a>
                      {currentQueueItem.result.topMatchSnippet && (
                        <p className="mt-1 text-[10px] text-gray-400">{currentQueueItem.result.topMatchSnippet}</p>
                      )}
                    </div>
                  )}
                  {/* Manual rewrite textarea */}
                  <div className="rounded-lg border border-gray-300 bg-white p-3">
                    <label className="text-[10px] font-medium text-gray-600 mb-1 block">Rewrite this passage:</label>
                    <textarea
                      value={manualEditText || currentQueueItem.result.passageText}
                      onChange={(e) => setManualEditText(e.target.value)}
                      rows={4}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* ── Spelling Batch ──────────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "spelling_batch" && (
                <SpellingView
                  findings={currentQueueItem.findings}
                  checked={spellingChecked}
                  onToggle={(id) => { setSpellingChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }}
                  onCheckAll={() => { setSpellingChecked(new Set(currentQueueItem.findings.map((f) => f.id))); }}
                  onUncheckAll={() => setSpellingChecked(new Set())}
                  applying={spellingApplying}
                  onApply={async () => {
                    if (!activeDocId || spellingChecked.size === 0) return;
                    setSpellingApplying(true);
                    try {
                      const res = await fetch("/api/spelling/bulk-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: activeDocId, fixIds: [...spellingChecked] }) });
                      const json = await res.json();
                      if (json.success) { await loadDocument(activeDocId); setSpellingChecked(new Set()); setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }
                    } catch (err) { console.error("Spelling fix failed:", err); }
                    setSpellingApplying(false);
                  }}
                />
              )}

              {/* ── Grammar Batch ──────────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "grammar_batch" && (
                <GrammarView
                  findings={currentQueueItem.findings}
                  checked={grammarChecked}
                  onToggle={(id) => { setGrammarChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }}
                  onCheckAll={() => { setGrammarChecked(new Set(currentQueueItem.findings.map((f) => f.id))); }}
                  onUncheckAll={() => setGrammarChecked(new Set())}
                  applying={grammarApplying}
                  onApply={async () => {
                    if (!activeDocId || grammarChecked.size === 0) return;
                    setGrammarApplying(true);
                    try {
                      const res = await fetch("/api/grammar/bulk-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: activeDocId, fixIds: [...grammarChecked] }) });
                      const json = await res.json();
                      if (json.success) { await loadDocument(activeDocId); setGrammarChecked(new Set()); setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }
                    } catch (err) { console.error("Grammar fix failed:", err); }
                    setGrammarApplying(false);
                  }}
                />
              )}

              {nav === "workspace" && workspaceMode === "edit" && currentFlag && currentSection && (
                <div className="p-4 space-y-4">
                  {/* Category badge + description */}
                  {(() => {
                    const cat = PATTERN_TYPE_LABELS[currentFlag.patternType];
                    return cat ? (
                      <div className="space-y-1">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cat.color}`}>
                          {cat.label}
                        </span>
                        <p className="text-xs text-gray-500 leading-relaxed">{cat.description}</p>
                      </div>
                    ) : null;
                  })()}

                  {/* Original text. Redundant with the Document panel's own
                      highlight, so only shown when that panel is collapsed —
                      otherwise it just repeats the left side and wastes space. */}
                  {!showDocPanel && (
                  <div className="rounded-lg border-2 border-gray-300 bg-white p-4">
                    {(() => {
                      const text = currentSection.currentText;
                      // For artifact flags, dynamically locate the phrase in current text
                      // (stored offsets may be stale from earlier edits)
                      let start = currentFlag.phraseStart;
                      let end = currentFlag.phraseEnd;
                      if (currentFlag.patternType === "ai_artifact") {
                        const idx = text.indexOf(currentFlag.flaggedPhrase, Math.max(0, start - 20));
                        if (idx >= 0) {
                          start = idx;
                          end = idx + currentFlag.flaggedPhrase.length;
                        } else {
                          // Fallback: search from beginning
                          const fallbackIdx = text.indexOf(currentFlag.flaggedPhrase);
                          if (fallbackIdx >= 0) {
                            start = fallbackIdx;
                            end = fallbackIdx + currentFlag.flaggedPhrase.length;
                          }
                        }
                      }
                      // For long sections, truncate context to focus on the flagged area
                      const contextRadius = 120;
                      const needsTruncation = text.length > 350;
                      const sliceStart = needsTruncation ? Math.max(0, start - contextRadius) : 0;
                      const sliceEnd = needsTruncation ? Math.min(text.length, end + contextRadius) : text.length;
                      const before = (sliceStart > 0 ? "..." : "") + text.slice(sliceStart, start);
                      const flagged = text.slice(start, end);
                      const after = text.slice(end, sliceEnd) + (sliceEnd < text.length ? "..." : "");
                      return (
                        <p className="text-base leading-relaxed">
                          <span className="text-gray-500">{before}</span>
                          <mark className="rounded bg-amber-300 px-0.5 text-gray-900 font-medium ring-2 ring-amber-400 underline decoration-amber-500 decoration-2 underline-offset-2">
                            {flagged}
                          </mark>
                          <span className="text-gray-500">{after}</span>
                        </p>
                      );
                    })()}
                  </div>
                  )}

                  {/* Comparison stage — the passage shown once with all option
                      variants stacked inline at each spot they differ. Read-only:
                      you compare here, then choose one on the right to apply. */}
                  {optionAlignment && currentOptions.length > 0 && divergentBlocks.length > 0 && (
                    <div className="rounded-lg border border-gray-200 border-l-2 border-l-violet-400 bg-gray-50/60 p-4">
                      <p className="mb-2 text-[11px] text-gray-500">
                        <span className="font-semibold text-gray-700">Compare the options in context.</span>
                        {" This rewrites the "}
                        <span className="rounded bg-violet-100 px-1 text-violet-900">passage highlighted in your document</span>
                        {". Where the options differ, all "}{currentOptions.length}{" are shown stacked and numbered — pick one on the right to apply it and move on."}
                      </p>
                      <MorphStage blocks={optionAlignment} optionCount={currentOptions.length} />
                    </div>
                  )}

                  {/* Per-flag explanation — educational and detailed */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-600 italic">{currentFlag.explanation}</p>
                    <details className="rounded bg-gray-50 border border-gray-200">
                      <summary className="px-3 py-1.5 cursor-pointer text-[10px] font-semibold text-gray-500 uppercase tracking-wider select-none hover:bg-gray-100">Why this matters</summary>
                      <p className="px-3 pb-2 text-xs text-gray-600 leading-relaxed">
                        {currentFlag.patternType === "banned_word" && (
                          <>AI detection tools like GPTZero and Turnitin flag this phrase because language models use it far more frequently than human writers do. Replacing it with a simpler, more natural alternative makes your writing less detectable. Think about how you&apos;d say this in conversation — that&apos;s usually the right replacement.</>
                        )}
                        {currentFlag.patternType === "banned_structure" && (
                          <>This sentence follows a structural pattern that AI models default to. Detectors recognise these shapes even when the words change. Restructure the sentence entirely — don&apos;t just swap words, change how the thought is built. Break it into two sentences, start from a different angle, or remove the formula altogether.</>
                        )}
                        {currentFlag.patternType === "synonym_rotation" && (
                          <>You&apos;ve used different synonyms for the same concept across the document. Humans tend to repeat their preferred word — &quot;use&quot; not alternating between &quot;use,&quot; &quot;utilise,&quot; and &quot;employ.&quot; Pick one word and stick with it. The repetition is what makes writing sound natural.</>
                        )}
                        {currentFlag.patternType === "uniform_length" && (
                          <>Your sentences or paragraphs are too similar in length. Human writing has dramatic variation — some sentences are 5 words, others 40+. Mix short punchy statements with longer, more complex ones. This variation is called &quot;burstiness&quot; and it&apos;s one of the patterns that detection tools commonly look for.</>
                        )}
                        {currentFlag.patternType === "uniform_density" && (
                          <>Every sentence carries roughly the same amount of information. In natural writing, some sentences are just breathing room — restating something casually, making an observation, or just being voice. Add a few low-information sentences that sound like you thinking out loud.</>
                        )}
                        {currentFlag.patternType === "transition_pattern" && (
                          <>The same transition words are repeating in a predictable pattern. Detectors flag this because AI models cycle through &quot;Furthermore,&quot; &quot;Moreover,&quot; &quot;Additionally&quot; in a way humans don&apos;t. Drop some transitions entirely — just start the next thought. Or use the same transition twice rather than rotating through synonyms.</>
                        )}
                        {currentFlag.patternType === "ai_artifact" && (
                          <>AI overuses em-dashes and curly quotes because its training data came from professionally typeset text where editors added those marks — so the model treats them as default punctuation, and both detectors and readers clock them as machine-polished. Real people typing in work or in email never reach for them.</>
                        )}
                        {currentFlag.patternType === "tone_inconsistency" && (
                          <>Tone shifts are one of the strongest tells that a document was assembled from multiple sources or generated in separate sessions. Human writers maintain a consistent voice throughout — the same level of formality, the same perspective, the same emotional register. When the tone shifts abruptly, readers (and professors) notice, even if they can&apos;t articulate why.</>
                        )}
                      </p>
                    </details>
                  </div>

                  {/* Per-flag generation state — honest about whether work is
                      actually happening (no more perpetual spinner). */}
                  {currentOptions.length === 0 && currentFlag && (() => {
                    const state = flagGenState(currentFlag);
                    if (state === "generating") {
                      return (
                        <div className="flex items-center gap-2 rounded border border-blue-100 bg-blue-50 px-3 py-2">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 shrink-0" />
                          <p className="text-xs text-blue-600">Generating this suggestion…</p>
                        </div>
                      );
                    }
                    if (state === "pending") {
                      return (
                        <div className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-400 shrink-0" />
                          <p className="text-xs text-gray-500">Queued — generating shortly{suggestProgress.total > 0 ? ` (${suggestProgress.current} of ${suggestProgress.total} done)` : ""}</p>
                        </div>
                      );
                    }
                    if (state === "failed") {
                      return (
                        <div className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2">
                          <p className="text-xs text-red-700">Couldn&apos;t generate suggestions for this edit.</p>
                          <button
                            onClick={() => retryFlag(currentFlag.id)}
                            className="shrink-0 rounded bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                          >
                            Retry
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Option cards — fallback only. When the comparison stage is
                      shown (2+ options that differ) it covers this, so these would
                      be redundant; here they handle artifacts, a lone option, or
                      options with no differences. The choice is always made in the
                      Choices panel on the right. */}
                  {currentOptions.length > 0 && !(optionAlignment && divergentBlocks.length > 0) && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Suggested replacements</p>
                      {currentOptions.map((opt, i) => {
                        // For artifact flags, describe the replacement clearly
                        const isArtifact = currentFlag.patternType === "ai_artifact";
                        const artifactItem = isArtifact && currentFlag.metadata ? (currentFlag.metadata as { artifactItem?: string }).artifactItem : null;
                        const replacementDesc = isArtifact
                          ? opt.text === "" || opt.text === "(remove)"
                            ? `${artifactItem || "Artifact"} will be removed`
                            : `Replace ${artifactItem || "artifact"} with "${opt.text}"`
                          : null;

                        return (
                        <div
                          key={opt.id}
                          onClick={() => setSelectedOptionIdx(i)}
                          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                            selectedOptionIdx === i ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              selectedOptionIdx === i ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                            }`}>{i + 1}</span>
                            <span className="text-[10px] text-gray-400">Option {i + 1}</span>
                          </div>
                          {replacementDesc ? (
                            <p className="text-sm text-purple-600 italic">{replacementDesc}</p>
                          ) : optionAlignment ? (
                            // Show only where this option differs from the others;
                            // the text they all share is dimmed and condensed.
                            <AlignedOptionText blocks={optionAlignment} optionIndex={i} />
                          ) : (() => {
                            // Single option (or artifact): fall back to a plain vs-original diff.
                            const originalText = currentSection?.currentText?.slice(currentFlag.phraseStart, currentFlag.phraseEnd) || currentFlag.flaggedPhrase;
                            const segments = wordDiff(originalText, opt.text);
                            const hasChanges = segments.some(s => s.type === "changed");
                            return (
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {hasChanges ? segments.map((seg, si) => (
                                  seg.type === "changed"
                                    ? <span key={si} className="bg-amber-100 text-gray-900 font-medium">{seg.text}</span>
                                    : <span key={si} className="text-gray-400">{seg.text}</span>
                                )) : opt.text}
                              </p>
                            );
                          })()}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Edit myself textarea */}
                  {selectedOptionIdx === currentOptions.length && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wider">Edit the text below</p>
                      <textarea
                        value={manualEditText}
                        onChange={(e) => setManualEditText(e.target.value)}
                        rows={6}
                        className="block w-full rounded-lg border-2 border-blue-300 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          if (manualEditText.trim()) {
                            handleFlagResolved("accepted", undefined, manualEditText.trim());
                          }
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Save edit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Citations ───────────────────────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "citations" && !activeDoc && (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center max-w-sm">
                    <p className="text-3xl font-bold text-gray-300">Citations</p>
                    <p className="mt-4 text-sm text-gray-500">This panel checks your citations for formatting errors across APA, MLA, Chicago, Harvard, and other styles.</p>
                    <p className="mt-6 text-base font-semibold text-blue-600">Load a document from the Library to get started</p>
                  </div>
                </div>
              )}

              {nav === "workspace" && workspaceMode === "citations" && activeDoc && (
                <>
                {actionableFlagCount > 0 && (
                  <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                    <div className="text-[11px] leading-relaxed">
                      <p className="font-semibold text-amber-800">Citations are best left for last.</p>
                      <p className="text-amber-700">You still have {actionableFlagCount} edit{actionableFlagCount !== 1 ? "s" : ""} to review. Finish your edits first — rewrites can move or remove text around a citation, so fixing them now may be wasted work.{" "}
                        <button onClick={() => setWorkspaceMode("edit")} className="font-medium underline hover:text-amber-900">Back to editing</button>
                      </p>
                    </div>
                  </div>
                )}
                <CitationsPage
                  documentId={activeDoc.id}
                  sections={sections}
                  onScoreUpdate={(score) => setActiveDoc((prev) => prev ? { ...prev, citationsScore: score } : prev)}
                  onScrollToText={(text) => {
                    setHighlightedCitationText(text || null);
                    if (text) {
                      setShowDocPanel(true);
                      setTimeout(() => {
                        const mark = document.querySelector("[data-citation-highlight]");
                        if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 150);
                    }
                  }}
                />
                </>
              )}

              {/* Review changes diff view */}
              {nav === "workspace" && workspaceMode === "review" && (
                resolvedChanges.length > 0 ? (
                  <DiffEditPanel
                    sections={sections}
                    changes={resolvedChanges}
                    activeChangeId={activeChangeId}
                    onChangeClick={setActiveChangeId}
                    scrollRef={diffEditRef}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-8">
                    <div className="text-center max-w-sm">
                      <p className="text-3xl font-bold text-gray-300">No changes yet</p>
                      <p className="mt-4 text-sm text-gray-500">This panel shows a side-by-side diff of every edit you accept.</p>
                      <p className="mt-6 text-base font-semibold text-blue-600">Go to the Edit tab and work through your flags first</p>
                      <button onClick={() => setWorkspaceMode("edit")} className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
                        Go to Edit
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Intake questionnaire — shown after upload */}
              {nav === "intake" && currentIntakeQ && (
                <div className="flex h-full flex-col items-center justify-center p-8">
                  <div className="max-w-md w-full space-y-6">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Question {intakeStep + 1} of {activeIntakeQuestions.length} — optional</p>
                      <h2 className="font-bold text-blue-600 animate-[intake-pulse_0.6s_ease-in-out_3]" style={{ fontSize: "50px" }}>{currentIntakeQ.title}</h2>
                      <p className="mt-2 text-sm text-gray-500">{currentIntakeQ.subtitle}</p>
                      <style>{`@keyframes intake-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                    </div>
                    <div className="text-center">
                      <button onClick={saveIntake} className="text-xs text-gray-400 hover:text-gray-600 underline">
                        Skip and start scanning
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {nav === "intake" && !currentIntakeQ && (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center max-w-sm">
                    <p className="text-3xl font-bold text-gray-300">All done</p>
                    <p className="mt-4 text-sm text-gray-500">Your document is loaded and ready.</p>
                    <p className="mt-6 text-base font-semibold text-blue-600 animate-[intake-pulse_0.6s_ease-in-out_3]">Now click Scan in the top-right to analyse it</p>
                  </div>
                </div>
              )}

              {nav === "style-rules" && (
                <StyleSettingsPanel documentType={activeDoc?.documentType} />
              )}

              {/* Default empty state — no document loaded */}
              {!activeDoc && nav === "workspace" && (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <p className="text-3xl font-bold text-gray-300">Welcome to your workspace</p>
                    <p className="mt-6 text-base font-semibold text-blue-600">Open a document from the Library to begin</p>
                    <p className="mt-2 text-sm text-gray-500">or use <strong>Add New Doc</strong> in the left menu to upload one.</p>
                    <button onClick={() => { setShowLibraryPanel(true); setNav("library"); }} className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Open Library
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          ) : (
            /* Collapsed Edit strip */
            <div
              onClick={() => setShowEditPanel(true)}
              title="Expand edit panel (E)"
              className="w-7 shrink-0 border-r border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors"
            >
              <div className="py-2">
                <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </div>
              <div className="pt-1">
                <span className="text-xs font-semibold text-gray-400 tracking-wider" style={{ writingMode: "vertical-rl" }}>Edit</span>
              </div>
              <div className="flex-1" />
              <div className="py-2">
                <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 text-[9px] text-gray-400 font-mono">E</span>
              </div>
            </div>
          )}

          {/* ── Choices Panel (collapsible) ────────────────────────────────── */}
          {showChoicesPanel ? (
          <div className="flex-[2.5] min-w-[220px] border-l border-gray-200 bg-gray-50 flex flex-col">
            <div onClick={() => setShowChoicesPanel(false)} className="border-b border-gray-100 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50" title="Collapse choices panel (C)">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Choices</h2>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            </div>

            {/* Scan + generation status now lives in the persistent status panel
                pinned to the bottom of this column (see ChoicesStatusPanel-style
                block below). */}

            <div className="flex-1 overflow-auto">
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem ? (
                <div className="flex h-full flex-col">
                  {/* Top controls */}
                  <div className="border-b border-gray-200 px-2 py-1.5">
                    <p className="text-[10px] text-gray-400">{selectedFlagIdx + 1} of {editQueue.length} items{currentQueueItem.type === "writing_quality" ? " (advisory)" : ""}</p>
                  </div>

                  <div className="flex-1 p-2 space-y-1">
                    {/* ── AI Detection / Artifact Individual choices ─── */}
                    {(currentQueueItem.type === "ai_detection" || currentQueueItem.type === "artifact_individual") && (
                      <>
                        <div className="flex gap-1.5 mb-2">
                          <button onClick={() => handleFlagResolved("skipped")} className="flex-1 rounded border border-gray-300 py-1 text-[10px] text-gray-600 hover:bg-gray-100">Skip</button>
                          <button onClick={() => handleFlagResolved("rejected")} className="flex-1 rounded border border-gray-300 py-1 text-[10px] text-gray-600 hover:bg-gray-100">Reject</button>
                        </div>
                        <p className="px-1 py-1 text-[10px] text-gray-500">
                          {currentOptions.length > 0 ? "Choose an option:" : "No suggestions available."}
                        </p>
                        {currentOptions.map((opt, i) => {
                          const isArtifact = currentQueueItem.type === "artifact_individual" && currentQueueItem.flag.metadata;
                          const artifactItem = isArtifact ? (currentQueueItem.flag.metadata as { artifactItem?: string }).artifactItem : null;
                          const label = isArtifact
                            ? opt.text === "" || opt.text === "(remove)"
                              ? `Remove ${artifactItem || "artifact"}`
                              : `Replace with "${opt.text}"`
                            : `Option ${i + 1}`;
                          const isSelected = selectedOptionIdx === i;
                          return (
                          <button
                            key={opt.id}
                            onClick={() => { setSelectedOptionIdx(i); handleFlagResolved("accepted", opt.id); }}
                            className={`group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs backdrop-blur-[10px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none ${
                              isSelected
                                ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm"
                                : "border border-white/40 bg-white/60 text-gray-700 hover:bg-white/80 hover:border-blue-200"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isSelected ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700"}`}>{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {isSelected && (
                              <svg className="h-3.5 w-3.5 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                          );
                        })}
                        {(() => {
                          const editIdx = currentOptions.length;
                          const isSelected = selectedOptionIdx === editIdx;
                          return (
                            <button
                              onClick={() => { setSelectedOptionIdx(editIdx); setManualEditText(currentSection?.currentText || ""); }}
                              className={`group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs backdrop-blur-[10px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
                                isSelected
                                  ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm"
                                  : "border border-white/40 bg-white/60 text-gray-700 hover:bg-white/80 hover:border-blue-200"
                              }`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isSelected ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700"}`}>{editIdx + 1}</span>
                              <span className="min-w-0 flex-1 truncate">Edit myself</span>
                              {isSelected && (
                                <svg className="h-3.5 w-3.5 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          );
                        })()}
                        <button
                          onClick={() => handleFlagResolved("skipped")}
                          className="group relative flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white/40 px-2.5 py-2 text-left text-xs text-gray-500 backdrop-blur-[10px] transition-all duration-150 hover:-translate-y-0.5 hover:border-green-400 hover:bg-green-50/60 hover:text-green-700 hover:shadow-md"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600 group-hover:bg-green-100 group-hover:text-green-700">{currentOptions.length + 2}</span>
                          <span>Stay with original</span>
                        </button>
                      </>
                    )}

                    {/* ── Artifact Batch choices ─────────────────────── */}
                    {currentQueueItem.type === "artifact_batch" && (
                      <>
                        <button
                          onClick={handleArtifactBatchProcess}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-white bg-purple-600 hover:bg-purple-700"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-purple-600">1</span>
                          <span>Process Choices</span>
                        </button>
                        <button
                          onClick={() => { setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">2</span>
                          <span>Skip for Now</span>
                        </button>
                      </>
                    )}

                    {/* ── Writing Quality choices ────────────────────── */}
                    {currentQueueItem.type === "writing_quality" && (
                      <>
                        <button
                          onClick={() => { setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">1</span>
                          <span>Skip</span>
                        </button>
                        <button
                          onClick={() => { setSkipAllWritingQuality(true); setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">2</span>
                          <span>Skip All Writing Quality</span>
                        </button>
                        <button
                          onClick={() => { setManualEditText(""); setSelectedOptionIdx(0); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">3</span>
                          <span>Edit</span>
                        </button>
                      </>
                    )}

                    {/* ── Plagiarism choices ──────────────────────────── */}
                    {currentQueueItem.type === "plagiarism" && (
                      <>
                        <button
                          onClick={() => handlePlagiarismResolved(currentQueueItem.result.id, "rewrite", manualEditText)}
                          disabled={!manualEditText || manualEditText === currentQueueItem.result.passageText}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-blue-600">1</span>
                          <span>Save Rewrite</span>
                        </button>
                        <button
                          onClick={() => handlePlagiarismResolved(currentQueueItem.result.id, "cite")}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">2</span>
                          <span>Add Citation</span>
                        </button>
                        <button
                          onClick={() => handlePlagiarismResolved(currentQueueItem.result.id, "dismiss")}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">3</span>
                          <span>Dismiss</span>
                        </button>
                      </>
                    )}

                    {/* ── Spelling batch choices ───────────────────────── */}
                    {currentQueueItem.type === "spelling_batch" && (
                      <>
                        <p className="px-1 py-1 text-[10px] text-gray-500">
                          {spellingChecked.size > 0 ? `${spellingChecked.size} of ${currentQueueItem.findings.length} selected` : "Check items in the panel to fix them"}
                        </p>
                        <button
                          onClick={() => { setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">1</span>
                          <span>Skip for Now</span>
                        </button>
                      </>
                    )}

                    {/* ── Grammar batch choices ────────────────────────── */}
                    {currentQueueItem.type === "grammar_batch" && (
                      <>
                        <p className="px-1 py-1 text-[10px] text-gray-500">
                          {grammarChecked.size > 0 ? `${grammarChecked.size} of ${currentQueueItem.findings.length} selected` : "Check items in the panel to fix them"}
                        </p>
                        <button
                          onClick={() => { setSelectedFlagIdx((p) => p + 1); setSelectedOptionIdx(null); }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">1</span>
                          <span>Skip for Now</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : workspaceMode === "review" ? (
                <DiffChoicesPanel
                  changes={resolvedChanges}
                  totalFlags={reviewStats.totalFlags}
                  acceptedCount={reviewStats.acceptedCount}
                  rejectedCount={reviewStats.rejectedCount}
                  skippedCount={reviewStats.skippedCount}
                  currentScore={activeDoc?.aiRiskScore ?? null}
                  initialScore={docVersions.length > 0 ? (docVersions[0] as any)?.aiRiskScore ?? null : null}
                  activeChangeId={activeChangeId}
                  onChangeClick={setActiveChangeId}
                />
              ) : nav === "intake" && currentIntakeQ ? (
                <div className="flex h-full flex-col">
                  <div className="border-b border-gray-200 px-2 py-1.5">
                    <p className="text-[10px] text-gray-400">{intakeStep + 1} of {activeIntakeQuestions.length} questions</p>
                  </div>

                  <div className="flex-1 p-2 space-y-1.5">
                    {currentIntakeQ.options.map((opt) => {
                      const isSelected = intakeAnswers[currentIntakeQ.key] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setIntakeAnswers({ ...intakeAnswers, [currentIntakeQ.key]: opt.value });
                            // Auto-advance after a short delay for feel
                            setTimeout(() => advanceIntake(), 200);
                          }}
                          className={`group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs backdrop-blur-[10px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none ${
                            isSelected
                              ? "border-2 border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm"
                              : "border border-white/40 bg-white/60 text-gray-700 hover:bg-white/80 hover:border-blue-200"
                          }`}
                        >
                          <span className="min-w-0 flex-1">{opt.label}</span>
                          {isSelected && (
                            <svg className="h-3.5 w-3.5 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-gray-200 px-2 py-2 space-y-1.5">
                    <button
                      onClick={advanceIntake}
                      className="w-full rounded border border-gray-300 py-1.5 text-[10px] text-gray-600 hover:bg-gray-100"
                    >
                      Skip
                    </button>
                    <button
                      onClick={saveIntake}
                      className="w-full rounded bg-blue-600 py-1.5 text-[10px] font-medium text-white hover:bg-blue-700"
                    >
                      Done — start scanning
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="flex-1 overflow-auto p-3">
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center max-w-[180px]">
                      <p className="text-xs font-semibold text-gray-400">Choices</p>
                      <p className="mt-1 text-[10px] text-gray-400">
                        {nav === "workspace" && workspaceMode === "edit" ? "No flags to review." : "Run a scan and AI suggestions will be generated automatically."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Status panel (pinned bottom) ─────────────────────────────
                Persistent scan + generation status. Checklist of what was
                scanned, then the live "Creating options for N edits (X of N)"
                line, then a ready-to-start confirmation once flag 1 is done. */}
            {activeDoc && (Object.keys(scanPhases).length > 0 || suggestProgress.total > 0 || scanError) && (
              <div className="mt-auto max-h-[30%] overflow-y-auto border-t border-gray-200 bg-white px-3 py-2.5 text-[10px]">
                {/* Scan checklist */}
                {scanError && (
                  <div className="mb-1.5 flex items-center justify-between rounded border border-red-200 bg-red-50 px-2 py-1.5">
                    <span className="text-red-700">{scanError}</span>
                    <button onClick={handleScan} className="ml-2 shrink-0 font-semibold text-red-700 underline hover:text-red-900">
                      Retry
                    </button>
                  </div>
                )}
                {/* Elapsed time + stop control while the scan is active */}
                {scanActive && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-medium text-gray-500">
                      Scanning… {Math.floor(scanElapsedSec / 60)}:{String(scanElapsedSec % 60).padStart(2, "0")}
                    </span>
                    <button
                      onClick={handleStopScan}
                      disabled={scanStopRef.current}
                      title="Stop the scan after the current step"
                      className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                      {scanStopRef.current ? "Stopping…" : "Stop"}
                    </button>
                  </div>
                )}
                <div className="space-y-1">
                  {SCAN_PHASE_ORDER.filter((p) => scanPhases[p.key]).map((p) => {
                    const st = scanPhases[p.key];
                    return (
                      <div key={p.key} className="flex items-center gap-1.5">
                        {st === "done" ? (
                          <svg className="h-3 w-3 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        ) : st === "stopped" ? (
                          <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        ) : st === "running" ? (
                          <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-gray-300 border-t-gray-500" />
                        ) : (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200" />
                        )}
                        <span className={st === "done" ? "text-gray-500" : st === "running" ? "text-gray-600" : "text-gray-400"}>
                          {st === "done" ? "Scanned for " : st === "running" ? "Scanning for " : st === "stopped" ? "Stopped — " : "Waiting to scan "}{p.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Live activity ticker — the latest line always visible;
                    expand for the full log of what the scan actually did */}
                {scanLog.length > 0 && (
                  <details className="mt-1.5 border-t border-gray-100 pt-1.5">
                    <summary className="flex cursor-pointer select-none items-center gap-1 text-gray-500 hover:text-gray-700">
                      <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                      <span className="min-w-0 flex-1 truncate font-mono text-[9px]">{scanLog[scanLog.length - 1]}</span>
                    </summary>
                    <div className="mt-1 max-h-32 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-1.5 font-mono text-[9px] leading-relaxed text-gray-600">
                      {scanLog.map((line, i) => (
                        <p key={i} className={i === scanLog.length - 1 ? "text-gray-800" : ""}>{line}</p>
                      ))}
                    </div>
                  </details>
                )}

                {/* Generation line */}
                {suggestProgress.total > 0 && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    {suggestProgress.generating ? (
                      <div className="flex items-center gap-1.5">
                        <ScrambleTicker />
                        <span className="font-medium text-amber-700">
                          Creating options for {suggestProgress.total} edit{suggestProgress.total !== 1 ? "s" : ""} ({suggestProgress.current} of {suggestProgress.total})
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <svg className="h-3 w-3 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        <span className="text-gray-500">All {suggestProgress.total} edit{suggestProgress.total !== 1 ? "s" : ""} prepared</span>
                      </div>
                    )}
                    {suggestProgress.current >= 1 && (
                      <p className="mt-1 font-medium text-green-700">
                        ✓ Ready — you can start editing{suggestProgress.generating ? " (the rest load as you go)" : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
          ) : (
            /* Collapsed Choices strip */
            <div
              onClick={() => setShowChoicesPanel(true)}
              title="Expand choices panel (C)"
              className="w-7 shrink-0 border-l border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors"
            >
              <div className="py-2">
                <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </div>
              <div className="pt-1">
                <span className="text-xs font-semibold text-gray-400 tracking-wider" style={{ writingMode: "vertical-rl" }}>Choices</span>
              </div>
              <div className="flex-1" />
              <div className="py-2">
                <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 text-[9px] text-gray-400 font-mono">C</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Scan config dialog ═════════════════════════════════════════════ */}
      {showScanDialog && (
        <ScanConfigDialog
          config={scanConfig}
          setConfig={setScanConfig}
          lastScan={activeDoc ? { level: activeDoc.lastScanLevel, at: activeDoc.lastScanAt } : null}
          onCancel={() => setShowScanDialog(false)}
          onConfirm={() => { setShowScanDialog(false); handleScan(); }}
        />
      )}

      {/* ═══ Status bar ════════════════════════════════════════════════════ */}
      <footer
        className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-2"
        style={{ boxShadow: "0 -4px 12px -6px rgba(0, 0, 0, 0.06)" }}
      >
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          {activeDoc ? (
            <>
              <span>{(() => {
                const text = sections.filter((s) => !s.isLocked).map((s) => s.currentText).join(" ");
                const words = text.split(/\s+/).filter(Boolean).length;
                const chars = text.length;
                return `${words.toLocaleString()} words \u00B7 ${chars.toLocaleString()} chars`;
              })()}</span>
              <span className="text-gray-300">|</span>
              <span>
                {unlockedSections.length} sections \u00B7 {actionableFlagCount} flag{actionableFlagCount !== 1 ? "s" : ""}
                {citationsNeedingReview > 0 && ` + ${citationsNeedingReview} citation${citationsNeedingReview !== 1 ? "s" : ""}`}
                {" \u00B7 "}{editQueue.length} items to review
              </span>
              {activeDoc?.lastScanLevel && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>Last scan: {activeDoc.lastScanLevel}</span>
                </>
              )}
            </>
          ) : (
            <span>No document loaded</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeDocId && (
            <>
              <button
                onClick={async () => {
                  const confirmed = window.confirm("Reset this document to its original uploaded text? All edits and scan results will be lost.");
                  if (!confirmed) return;
                  const res = await fetch("/api/documents/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documentId: activeDocId }),
                  });
                  if (res.ok) {
                    setHasScanned(false);
                    setScanViewed(false);
                    setVersionSavedSinceScan(true);
                    setProcessedArtifacts({});
                    setArtifactBatchChoices({});
                    setSelectedFlagIdx(0);
                    await loadDocument(activeDocId);
                    await loadDocs();
                  }
                }}
                className="rounded border border-red-300 px-3 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50"
              >
                Reset to Original
              </button>
              {/* Primary download — user's end goal. Solid brand-blue "success" styling. */}
              <div className="relative group">
                <button
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  {/* Lucide Download icon */}
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Edited File
                  <svg className="h-3 w-3 opacity-75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-50">
                  <div className="rounded-md border border-gray-200 bg-white shadow-lg py-1 min-w-[140px]">
                    <button
                      onClick={() => {
                        const text = sections.filter((s) => !s.isLocked).map((s) => s.currentText).join("\n\n");
                        const refSection = sections.find((s) => s.isLocked);
                        const fullText = refSection ? text + "\n\n" + refSection.currentText : text;
                        const blob = new Blob([fullText], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${activeDoc?.title ?? "document"}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-100"
                    >
                      Save as .txt
                    </button>
                    <button
                      onClick={() => {
                        window.open(`/api/documents/export?documentId=${activeDocId}&format=docx`, "_blank");
                      }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-100"
                    >
                      Save as .docx
                    </button>
                  </div>
                </div>
              </div>
              {/* Secondary: snapshot to our database */}
              <button
                onClick={handleSaveVersion}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Save Version
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Nav button ───────────────────────────────────────────────────────────

// ── Scan config dialog ───────────────────────────────────────────────────

function ScanConfigDialog({ config, setConfig, lastScan, onCancel, onConfirm }: {
  config: { categories: { aiDetection: boolean; writingQuality: boolean; aiArtifacts: boolean; plagiarism: boolean; citations: boolean; toneConsistency: boolean; spelling: boolean; grammar: boolean }; aiDetectionDepth: "surface" | "deep" | "comprehensive" };
  setConfig: (c: typeof config) => void;
  lastScan: { level: string | null; at: string | null } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { categories, aiDetectionDepth } = config;

  // Style Training stats
  const [styleStats, setStyleStats] = useState<{ remove: number; ask: number; keep: number } | null>(null);
  useEffect(() => {
    fetch("/api/admin/style-training").then((r) => r.json()).then((json) => {
      if (json.success) {
        const items = json.data as { preference: string }[];
        setStyleStats({
          remove: items.filter((i) => i.preference === "always_remove").length,
          ask: items.filter((i) => i.preference === "ask_each_time").length,
          keep: items.filter((i) => i.preference === "always_keep").length,
        });
      }
    }).catch(() => {});
  }, []);

  function updateCat(key: keyof typeof categories, value: boolean) {
    setConfig({ ...config, categories: { ...categories, [key]: value } });
  }

  const depthLevels = [
    { value: "surface" as const, label: "Surface", desc: "Full analysis against the most obvious AI tells — high-severity phrases, structures, and patterns", sensitivity: "~55 entries" },
    { value: "deep" as const, label: "Deep", desc: "Adds moderate-severity patterns — transitions, corporate fluff, hedging phrases", sensitivity: "~218 entries" },
    { value: "comprehensive" as const, label: "Comprehensive", desc: "Everything — includes subtle individual words and low-severity patterns", sensitivity: "~250 entries" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-4 shrink-0">
          <h2 className="text-lg font-bold">Configure Scan</h2>
          <p className="mt-1 text-xs text-gray-500">Choose what to check and how thorough to be.</p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">

          {/* ── Section 1: Categories ────────────────────────────────────── */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">What to check</label>
            <div className="mt-2 space-y-1">
              {/* AI Detection */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.aiDetection ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.aiDetection} onChange={(e) => updateCat("aiDetection", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">AI Detection</p>
                    <p className="text-[10px] text-gray-400">Find AI-generated patterns, phrases, and structural tells</p>
                  </div>
                </div>
              </label>
              {/* Writing Quality */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.writingQuality ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.writingQuality} onChange={(e) => updateCat("writingQuality", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Writing Quality</p>
                    <p className="text-[10px] text-gray-400">Readability, sentence variation, lexical diversity, coherence</p>
                  </div>
                </div>
              </label>
              {/* AI Artifacts */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.aiArtifacts ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.aiArtifacts} onChange={(e) => updateCat("aiArtifacts", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">AI Artifacts</p>
                    <p className="text-[10px] text-gray-400">
                      Em dashes, emojis, markdown formatting, list overuse, sign-off patterns
                      {styleStats && <span className="ml-1 text-gray-500">({styleStats.remove} remove, {styleStats.ask} ask, {styleStats.keep} keep)</span>}
                    </p>
                  </div>
                </div>
              </label>
              {/* Plagiarism */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.plagiarism ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.plagiarism} onChange={(e) => updateCat("plagiarism", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Plagiarism</p>
                    <p className="text-[10px] text-gray-400">Search the web for matching content</p>
                  </div>
                </div>
              </label>
              {/* Citations */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.citations ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.citations} onChange={(e) => updateCat("citations", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Citations</p>
                    <p className="text-[10px] text-gray-400">Check citation format and source accuracy</p>
                  </div>
                </div>
              </label>
              {/* Tone Consistency */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.toneConsistency ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.toneConsistency} onChange={(e) => updateCat("toneConsistency", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Tone Consistency</p>
                    <p className="text-[10px] text-gray-400">Tone shifts, voice changes, contradictions, and repetition</p>
                  </div>
                </div>
              </label>

              {/* Spelling */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.spelling ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.spelling} onChange={(e) => updateCat("spelling", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Spelling Check</p>
                    <p className="text-[10px] text-gray-400">LLM-powered spelling error detection</p>
                  </div>
                </div>
              </label>

              {/* Grammar */}
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer ${categories.grammar ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={categories.grammar} onChange={(e) => updateCat("grammar", e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">Grammar Check</p>
                    <p className="text-[10px] text-gray-400">LLM-powered grammar error detection</p>
                  </div>
                </div>
              </label>
            </div>

            {/* Style Training notice */}
            {categories.aiArtifacts && styleStats && styleStats.remove === 0 && styleStats.ask === styleStats.remove + styleStats.ask + styleStats.keep && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-600">
                All AI artifact items are set to &quot;Ask Each Time&quot;. <button onClick={onCancel} className="underline font-medium">Set preferences</button> to reduce questions.
              </div>
            )}
          </div>

          {/* ── Section 2: AI Detection Depth ───────────────────────────── */}
          {categories.aiDetection && (
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Detection Depth</label>
              <p className="text-[10px] text-gray-400 mt-0.5">All levels run full analysis (phrases, structures, and semantic patterns). Higher levels check against more library entries.</p>
              <div className="mt-2 space-y-1">
                {depthLevels.map((level) => (
                  <label
                    key={level.value}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      aiDetectionDepth === level.value ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input type="radio" name="depth" checked={aiDetectionDepth === level.value} onChange={() => setConfig({ ...config, aiDetectionDepth: level.value })} className="text-blue-600" />
                      <div>
                        <p className="text-xs font-medium text-gray-700">{level.label}</p>
                        <p className="text-[10px] text-gray-400">{level.desc}</p>
                      </div>
                    </div>
                    <span className="text-[9px] text-gray-400 shrink-0 ml-2">{level.sensitivity}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 3: Scan History ──────────────────────────────────── */}
          {lastScan?.level && lastScan?.at && (() => {
            const depthOrder: Record<string, number> = { surface: 0, deep: 1, comprehensive: 2 };
            const prevDepth = depthOrder[lastScan.level] ?? 0;
            const newDepth = depthOrder[aiDetectionDepth] ?? 0;
            const isUpgrade = newDepth > prevDepth;
            const isDowngrade = newDepth < prevDepth;
            const isSame = newDepth === prevDepth;

            return (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-xs text-gray-600">
                  Previous: <strong>{lastScan.level}</strong> scan, {new Date(lastScan.at).toLocaleString()}
                </p>
                {isUpgrade && (
                  <p className="text-[10px] text-green-600 mt-1 font-medium">
                    Upgrading from {lastScan.level} to {aiDetectionDepth} — this will check against more patterns.
                  </p>
                )}
                {isSame && aiDetectionDepth === "comprehensive" && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Already at maximum depth. This re-scan will check your latest edits.
                  </p>
                )}
                {isSame && aiDetectionDepth !== "comprehensive" && (
                  <p className="text-[10px] text-blue-600 mt-1 font-medium">
                    Same depth as before. Consider upgrading to {aiDetectionDepth === "surface" ? "Deep" : "Comprehensive"} to check against more patterns.
                  </p>
                )}
                {isDowngrade && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">
                    Downgrading from {lastScan.level} to {aiDetectionDepth} — this will check fewer patterns.
                  </p>
                )}
              </div>
            );
          })()}

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2 shrink-0">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
            Run Scan
          </button>
        </div>
      </div>
    </div>
  );
}

function NavButton({ label, active, expanded, onClick, icon, prominent = false }: {
  label: string; active: boolean; expanded: boolean; onClick: () => void; icon: React.ReactNode; prominent?: boolean;
}) {
  const base = prominent ? "px-3.5 py-3" : "px-3.5 py-2.5";
  const idleColor = prominent
    ? "text-blue-700 hover:bg-blue-50"
    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700";
  const activeColor = prominent ? "bg-blue-100 text-blue-800" : "bg-blue-50 text-blue-700";
  const labelStyle = prominent ? "text-sm font-semibold" : "text-sm";
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-full items-center gap-3 text-left transition-colors ${base} ${
        active ? activeColor : idleColor
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {expanded && <span className={`${labelStyle} truncate`}>{label}</span>}
    </button>
  );
}

// ── Document switcher (Supabase-style dropdown) ──────────────────────────

function DocSwitcher({ docs, activeDoc, activeDocId, onSelect, onNewDoc, onRename }: {
  docs: { id: string; title: string; aiRiskScore: number | null; status: string }[];
  activeDoc: { id: string; title: string } | null;
  activeDocId: string | null;
  onSelect: (id: string) => void;
  onNewDoc: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<{ id: string; versionLabel: string; createdAt: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Load versions when dropdown opens and a doc is active
  useEffect(() => {
    if (open && activeDocId) {
      fetch(`/api/documents/${activeDocId}/versions`)
        .then((r) => r.json())
        .then((json) => { if (json.success) setVersions(json.data); })
        .catch(() => {});
    } else {
      setVersions([]);
    }
  }, [open, activeDocId]);

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative min-w-0 flex-1 max-w-[36rem]" ref={ref}>
      {/* Trigger — breadcrumb / search style: no border, subtle backdrop blur, single thin chevron */}
      <div className="flex w-full items-center gap-2 rounded-md bg-gray-50/70 px-3 py-1.5 text-sm transition-colors cursor-pointer hover:bg-gray-100/80 backdrop-blur-sm dark:bg-slate-800/60 dark:hover:bg-slate-800/80">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => {
              if (editTitle.trim() && editTitle.trim() !== activeDoc?.title) onRename(editTitle.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.currentTarget.blur(); }
              if (e.key === "Escape") { setEditing(false); }
            }}
            className="min-w-0 flex-1 border-b border-blue-400 bg-transparent text-sm font-medium text-gray-700 outline-none dark:text-gray-100"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-100"
            onClick={() => setOpen(!open)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (activeDoc) {
                setEditTitle(activeDoc.title);
                setEditing(true);
                setTimeout(() => inputRef.current?.select(), 0);
              }
            }}
          >
            {activeDoc?.title ?? "Select document"}
          </span>
        )}
        <button onClick={() => setOpen(!open)} className="shrink-0" aria-label="Open document list">
          {/* Lucide ChevronDown — thinner single caret */}
          <svg className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[18rem] rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find document..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>
          </div>

          {/* Document list */}
          <div className="max-h-60 overflow-auto py-1">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => { onSelect(doc.id); setOpen(false); setSearch(""); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-gray-700">{doc.title}</span>
                  {doc.status !== "uploaded" && doc.status !== "scanned" && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{doc.status}</span>
                  )}
                </div>
                {activeDocId === doc.id && (
                  <svg className="h-4 w-4 shrink-0 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                )}
              </button>
            ))}

            {filtered.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-gray-400">No documents found</p>
            )}
          </div>

          {/* Versions (if a doc is loaded) */}
          {activeDoc && versions.length > 0 && (
            <>
              <div className="border-t border-gray-100 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Versions</p>
              </div>
              <div className="max-h-32 overflow-auto pb-1">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500">
                    <span className="font-mono">{v.versionLabel}</span>
                    <span className="text-[10px] text-gray-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* + New document */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => { onNewDoc(); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty panel component ────────────────────────────────────────────────

function EmptyPanel({ title, description, extra }: { title: string; description: string; extra?: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <h3 className="text-sm font-semibold text-gray-400">{title}</h3>
        <p className="mt-2 text-xs text-gray-400 leading-relaxed">{description}</p>
        {extra}
      </div>
    </div>
  );
}

// ── Style Training inline component ──────────────────────────────────────

// ── Edit session summary (shown when all flags are resolved) ─────────────

function EditSessionSummary({ flags, spellingRemaining, grammarRemaining, artifactsRemaining, onReviewArtifacts, onSaveVersion, citationsPending, onGoToCitations }: {
  flags: { id: string; patternType: string; status: string }[];
  spellingRemaining: number;
  grammarRemaining: number;
  artifactsRemaining: number;
  onReviewArtifacts: () => void;
  onSaveVersion: () => void;
  citationsPending: number;
  onGoToCitations: () => void;
}) {
  const accepted = flags.filter((f) => f.status === "accepted");
  const skipped = flags.filter((f) => f.status === "skipped");
  const rejected = flags.filter((f) => f.status === "rejected");
  const unresolvedFlags = flags.filter((f) => f.status === "open" || f.status === "generation_failed").length;
  const total = accepted.length + skipped.length + rejected.length;
  const hasPendingCitations = citationsPending > 0;
  // Citations are a deliberate FINAL step (own tab), reached only once the edit
  // pass is done — so they are NOT counted as "remaining work" that blocks
  // completion. Edits first, citations last.
  const hasRemainingEdits = unresolvedFlags > 0 || spellingRemaining > 0 || grammarRemaining > 0 || artifactsRemaining > 0;

  // Group accepted by category
  const categoryLabels: Record<string, string> = {
    banned_word: "Common AI Phrases",
    banned_structure: "Sentence Structures",
    synonym_rotation: "Synonym Rotation",
    uniform_length: "Uniform Length",
    uniform_density: "Information Density",
    transition_pattern: "Transition Patterns",
  };

  const acceptedByCategory: Record<string, number> = {};
  for (const f of accepted) {
    const label = categoryLabels[f.patternType] || f.patternType;
    acceptedByCategory[label] = (acceptedByCategory[label] || 0) + 1;
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-5">
        <div>
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full mb-3 ${
            hasRemainingEdits ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"
          }`}>
            {hasRemainingEdits ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            )}
          </div>
          <h3 className="text-lg font-bold text-gray-800">
            {hasRemainingEdits ? "Edits Still Need Attention" : "Editing Complete"}
          </h3>
          {hasRemainingEdits ? (
            <div className="mt-2 space-y-1 text-sm">
              {unresolvedFlags > 0 && (
                <p className="text-amber-700 font-medium">{unresolvedFlags} unresolved flag{unresolvedFlags !== 1 ? "s" : ""}</p>
              )}
              {spellingRemaining > 0 && (
                <p className="text-red-600 font-medium">{spellingRemaining} spelling error{spellingRemaining !== 1 ? "s" : ""}</p>
              )}
              {grammarRemaining > 0 && (
                <p className="text-yellow-700 font-medium">{grammarRemaining} grammar issue{grammarRemaining !== 1 ? "s" : ""}</p>
              )}
              {artifactsRemaining > 0 && (
                <p className="text-amber-700 font-medium">{artifactsRemaining} AI artifact{artifactsRemaining !== 1 ? "s" : ""}</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              You reviewed all {total} flag{total !== 1 ? "s" : ""} in this document.
            </p>
          )}
        </div>

        {/* Final artifact sweep — accepted AI rewrites can re-introduce
            typographic artifacts (em dashes, curly quotes). This count comes
            from a live re-detection over the CURRENT text, so it catches
            everything the edit session added, even after the artifact batch
            was processed earlier in the queue. */}
        {artifactsRemaining > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
            <p className="text-xs font-semibold text-amber-800">
              Final sweep: {artifactsRemaining} AI artifact{artifactsRemaining !== 1 ? "s" : ""} in the document
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Em dashes, curly quotes, and similar characters — some may have been introduced
              by the rewrites you accepted. Review them so your final text is clean.
            </p>
            <button
              onClick={onReviewArtifacts}
              className="mt-2 w-full rounded-lg bg-amber-600 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Review Artifacts ({artifactsRemaining})
            </button>
          </div>
        )}

        {/* Citations — the final step, once edits are done. Kept separate from
            the edit pass on purpose: fixing citations earlier is wasted effort
            because rewrites can move or remove the surrounding text. */}
        {hasPendingCitations && (
          <div className={`rounded-lg border p-3 text-left ${hasRemainingEdits ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-xs font-semibold ${hasRemainingEdits ? "text-gray-600" : "text-amber-800"}`}>
              Final step: review your citations
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              {hasRemainingEdits
                ? `Finish the edits above first. Then check the ${citationsPending} citation${citationsPending !== 1 ? "s" : ""} flagged on the Citations tab — leave them until your wording is final.`
                : `${citationsPending} citation${citationsPending !== 1 ? "s" : ""} flagged on the Citations tab. Now that your edits are done, this is the right time to review them.`}
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="flex justify-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{accepted.length}</p>
            <p className="text-[10px] text-gray-500">Accepted</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-400">{skipped.length}</p>
            <p className="text-[10px] text-gray-500">Kept Original</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{rejected.length}</p>
            <p className="text-[10px] text-gray-500">Rejected</p>
          </div>
        </div>

        {/* Changes by category */}
        {accepted.length > 0 && (
          <div className="text-left">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Changes made by category</p>
            <div className="space-y-1">
              {Object.entries(acceptedByCategory).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between rounded bg-green-50 px-3 py-1.5 text-xs">
                  <span className="text-gray-700">{category}</span>
                  <span className="font-medium text-green-700">{count} fixed</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {hasPendingCitations && (
            <button
              onClick={onGoToCitations}
              disabled={hasRemainingEdits}
              className={`w-full rounded-lg py-2 text-sm font-medium ${
                hasRemainingEdits
                  ? "border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
            >
              {hasRemainingEdits ? `Citations (${citationsPending}) — finish edits first` : `Go to Citations (${citationsPending})`}
            </button>
          )}
          <button
            onClick={onSaveVersion}
            className={`w-full rounded-lg py-2 text-sm font-medium ${
              hasRemainingEdits || hasPendingCitations
                ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Save Version
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Style Training inline component ──────────────────────────────────────

function StyleTrainingInline() {
  const [items, setItems] = useState<{ id: string; category: string; item: string; example: string | null; notes: string | null; preference: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/style-training")
      .then((r) => r.json())
      .then((json) => { if (json.success) setItems(json.data); setLoading(false); });
  }, []);

  async function updatePref(id: string, preference: string) {
    await fetch("/api/admin/style-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_preference", id, preference }),
    });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, preference } : i));
  }

  async function bulkUpdate(category: string, preference: string) {
    await fetch("/api/admin/style-training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_update", category, preference }),
    });
    setItems((prev) => prev.map((i) => i.category === category ? { ...i, preference } : i));
  }

  const categories = [...new Set(items.map((i) => i.category))];
  const PREFS = [
    { value: "always_remove", label: "Remove", color: "bg-red-100 text-red-700 border-red-200" },
    { value: "always_keep", label: "Keep", color: "bg-green-100 text-green-700 border-green-200" },
    { value: "ask_each_time", label: "Ask", color: "bg-blue-100 text-blue-700 border-blue-200" },
  ];

  if (loading) return <div className="p-4 text-xs text-gray-400">Loading...</div>;

  const removeCount = items.filter((i) => i.preference === "always_remove").length;
  const keepCount = items.filter((i) => i.preference === "always_keep").length;
  const askCount = items.filter((i) => i.preference === "ask_each_time").length;

  return (
    <div className="h-full overflow-auto p-5">
      <h2 className="text-lg font-bold">Style Training</h2>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">
        These settings apply across every document you work on. They control how formatting artifacts
        are handled during scans and reviews.
      </p>
      <div className="mt-2 space-y-1 text-xs text-gray-500">
        <p><strong className="text-red-600">Always Remove</strong> — automatically stripped during every scan. You won&apos;t see these in your review.</p>
        <p><strong className="text-green-600">Always Keep</strong> — never flagged, never touched. The scanner will skip these entirely.</p>
        <p><strong className="text-blue-600">Ask Me Each Time</strong> — flagged during your hands-on review so you can decide case by case.</p>
      </div>

      <div className="mt-3 flex gap-2 text-xs">
        <span className="rounded bg-red-50 border border-red-200 px-2 py-1 text-red-700">{removeCount} Remove</span>
        <span className="rounded bg-green-50 border border-green-200 px-2 py-1 text-green-700">{keepCount} Keep</span>
        <span className="rounded bg-blue-50 border border-blue-200 px-2 py-1 text-blue-700">{askCount} Ask</span>
      </div>

      <div className="mt-5 space-y-5">
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-bold text-gray-700">{cat}</h3>
                <div className="flex gap-1">
                  <span className="text-[10px] text-gray-400 mr-1">All:</span>
                  {PREFS.map((p) => (
                    <button key={p.value} onClick={() => bulkUpdate(cat, p.value)} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${p.color}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="rounded border border-gray-200">
                {catItems.map((item) => (
                  <details key={item.id} className="border-b border-gray-50 last:border-0">
                    <summary className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-700">{item.item}</span>
                        {item.example && <span className="ml-2 text-xs text-gray-400 font-mono">{item.example}</span>}
                      </div>
                      <div className="flex gap-0.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                        {PREFS.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => updatePref(item.id, p.value)}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              item.preference === p.value ? p.color + " border" : "text-gray-400 hover:bg-gray-100"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </summary>
                    <div className="px-3 py-2 bg-gray-50">
                      <p className="text-[10px] text-purple-600 font-medium">{getRemovalDescription(item.item)}</p>
                      {item.notes && <p className="mt-0.5 text-[9px] text-gray-400">{item.notes}</p>}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Spelling View ─────────────────────────────────────────────────────────

function SpellingView({ findings, checked, onToggle, onCheckAll, onUncheckAll, applying, onApply }: {
  findings: import("@/lib/analysis/grammar-spelling-types").SpellingFinding[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onCheckAll: () => void;
  onUncheckAll: () => void;
  applying: boolean;
  onApply: () => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500">No spelling errors found.</p>
        <p className="mt-1 text-xs text-gray-400">Run a scan with spelling checks enabled to detect errors.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Spelling Errors <span className="ml-1 text-sm font-normal text-gray-400">({findings.length})</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={checked.size === findings.length ? onUncheckAll : onCheckAll}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            {checked.size === findings.length ? "Uncheck All" : "Check All"}
          </button>
          <button
            onClick={onApply}
            disabled={applying || checked.size === 0}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {applying ? "Applying..." : `Fix ${checked.size} Selected`}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        {findings.map((f) => (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
              checked.has(f.id) ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={checked.has(f.id)}
              onChange={() => onToggle(f.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="flex-1 text-sm text-gray-700">
              <span className="text-gray-400">...{f.contextBefore} </span>
              <span className="rounded bg-red-100 px-1 font-medium text-red-700">{f.word}</span>
              <span className="text-gray-400"> {f.contextAfter}...</span>
              <span className="mx-2 text-gray-300">&rarr;</span>
              <span className="rounded bg-green-100 px-1 font-medium text-green-700">{f.correction}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Grammar View ──────────────────────────────────────────────────────────

function GrammarView({ findings, checked, onToggle, onCheckAll, onUncheckAll, applying, onApply }: {
  findings: import("@/lib/analysis/grammar-spelling-types").GrammarFinding[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onCheckAll: () => void;
  onUncheckAll: () => void;
  applying: boolean;
  onApply: () => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500">No grammar issues found.</p>
        <p className="mt-1 text-xs text-gray-400">Run a scan with grammar checks enabled to detect issues.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Grammar Issues <span className="ml-1 text-sm font-normal text-gray-400">({findings.length})</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={checked.size === findings.length ? onUncheckAll : onCheckAll}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            {checked.size === findings.length ? "Uncheck All" : "Check All"}
          </button>
          <button
            onClick={onApply}
            disabled={applying || checked.size === 0}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {applying ? "Applying..." : `Fix ${checked.size} Selected`}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {findings.map((f) => (
          <label
            key={f.id}
            className={`block cursor-pointer rounded-lg border p-4 transition-colors ${
              checked.has(f.id) ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checked.has(f.id)}
                onChange={() => onToggle(f.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <div className="flex-1 min-w-0">
                <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {f.ruleCategory}
                </span>

                <div className="mt-2 rounded border border-red-200 bg-red-50/50 p-2">
                  <p className="text-sm text-gray-800">{f.originalText}</p>
                </div>

                <div className="my-1 flex justify-center">
                  <span className="text-xs text-gray-400">&darr;</span>
                </div>

                <div className="rounded border border-green-200 bg-green-50/50 p-2">
                  <p className="text-sm text-gray-800">{f.correctedText}</p>
                </div>

                <p className="mt-2 text-xs text-gray-500">{f.explanation}</p>
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Option comparison rendering (shared by the option cards & morph stage) ───

/**
 * Shorten a run of text the options all share, preserving leading/trailing
 * whitespace so it still butts cleanly against neighbouring divergent text.
 */
function condenseSharedText(text: string, headWords = 6, tailWords = 6, threshold = 16): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= threshold) return text;
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  return `${lead}${words.slice(0, headWords).join(" ")} … ${words.slice(-tailWords).join(" ")}${trail}`;
}

/**
 * One option's text rendered against the alignment: the parts every option
 * shares are dimmed and condensed; the part unique to THIS option is
 * highlighted. Reduces three near-identical paragraphs to "here's the bit that
 * differs" three times.
 */
function AlignedOptionText({ blocks, optionIndex }: { blocks: AlignBlock[]; optionIndex: number }) {
  return (
    <p className="text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.kind === "shared") {
          return (
            <span key={i} className="text-gray-400">
              {condenseSharedText(b.text)}
            </span>
          );
        }
        const v = b.variants[optionIndex] ?? "";
        if (!v.trim()) {
          return (
            <span key={i} className="px-1 text-gray-300" title="this option leaves this out">
              ⌀
            </span>
          );
        }
        return (
          <span key={i} className="rounded bg-amber-100 font-semibold text-gray-900">
            {v}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Comparison stage: the passage is shown once as flowing prose; at every spot
 * where the options diverge, all variants are stacked inline and numbered so
 * they can be compared in context without flipping between them. Read-only —
 * the actual choice is committed in the Choices panel on the right. The numbers
 * match the option numbers there.
 */
function MorphStage({ blocks, optionCount }: { blocks: AlignBlock[]; optionCount: number }) {
  return (
    <p className="text-base leading-relaxed text-gray-800">
      {blocks.map((b, i) => {
        if (b.kind === "shared") {
          return <span key={i}>{b.text}</span>;
        }
        return (
          <span
            key={i}
            className="mx-1 inline-flex flex-col gap-0.5 rounded-md border border-amber-200 bg-amber-50/50 p-1 align-text-bottom"
          >
            {Array.from({ length: optionCount }).map((_, oi) => {
              const v = b.variants[oi] ?? "";
              return (
                <span key={oi} className="flex items-start gap-1.5 px-1 text-sm text-gray-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500">
                    {oi + 1}
                  </span>
                  <span>{v.trim() ? v : <span className="italic text-gray-400">(leaves this out)</span>}</span>
                </span>
              );
            })}
          </span>
        );
      })}
    </p>
  );
}

