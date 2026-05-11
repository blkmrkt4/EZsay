"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import AnalysisPanel from "@/components/results/AnalysisPanel";
import { detectArtifacts, type ArtifactFinding } from "@/lib/analysis/artifact-detector";
import { calculateWritingQuality, findComplexSentences } from "@/lib/analysis/quality-scorer";
import { getRemovalDescription } from "@/lib/analysis/artifact-removals";
import CitationsPage from "@/components/citations/CitationsPage";
import CommandCapsule from "@/components/editor/CommandCapsule";
import HeatmapScrollbar, { type HeatmapTick } from "@/components/editor/HeatmapScrollbar";
import DiffDocPanel from "@/components/editor/DiffDocPanel";
import DiffEditPanel from "@/components/editor/DiffEditPanel";
import DiffChoicesPanel from "@/components/editor/DiffChoicesPanel";
import { trackEvent } from "@/lib/events/track-client";
import { wordDiff } from "@/lib/analysis/word-diff";
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
  | { type: "citation_fix"; citation: CitationSummary }
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

export default function WorkspacePage() {
  const searchParams = useSearchParams();

  // Document list
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);

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
    // Switch from Library panel to Doc panel, and back to edit view
    setShowLibraryPanel(false);
    setShowDocPanel(true);
    if (nav === "style-rules" || nav === "library") { setNav("workspace"); setWorkspaceMode("edit"); }
    loadDocument(docId);
  }

  // No auto-scan on upload — user clicks Scan when ready

  // ── Scan ───────────────────────────────────────────────────────────────

  async function handleScan() {
    if (!activeDocId) return;
    setScanning(true);
    setNav("workspace"); setWorkspaceMode("dashboard");
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: activeDocId,
        categories: scanConfig.categories,
        aiDetectionDepth: scanConfig.aiDetectionDepth,
      }),
    });
    const json = await res.json();
    if (json.success) {
      await loadDocument(activeDocId);
      await loadDocs();

      // Immediately generate suggestions for all flags
      setSuggestProgress({ generating: true, current: 0, total: json.data.totalFlags });
      generateAllSuggestions(activeDocId);

      // Run plagiarism check in parallel if enabled
      if (scanConfig.categories.plagiarism) {
        runPlagiarismCheck(activeDocId);
        trackEvent("feature_used", { feature: "plagiarism" });
      }

      // Run tone consistency check in parallel if enabled
      if (scanConfig.categories.toneConsistency) {
        runToneConsistencyCheck(activeDocId);
        trackEvent("feature_used", { feature: "tone_consistency" });
      }

      // Run citation extraction and structural check if enabled
      if (scanConfig.categories.citations) {
        runCitationCheck(activeDocId);
        trackEvent("feature_used", { feature: "citations" });
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
      // Step 2: Verify citations (are they real?)
      const verifyRes = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_all", documentId: docId }),
      });
      const verifyJson = await verifyRes.json();
      if (verifyJson.success && verifyJson.data?.score != null) {
        setActiveDoc((prev) => prev ? { ...prev, citationsScore: verifyJson.data.score } : prev);
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

  async function handleCitationFixResolve(
    citationId: string,
    userAction: "accepted" | "edited" | "dismissed",
    correctedText?: string
  ) {
    await fetch("/api/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", citationId, userAction, correctedText }),
    });

    setDocCitations((prev) =>
      prev.map((c) => c.id === citationId
        ? { ...c, status: userAction === "dismissed" ? "dismissed" : "resolved", userAction, correctedText: correctedText ?? c.correctedText }
        : c
      )
    );
    if (activeDocId) await loadDocument(activeDocId);
    setSelectedFlagIdx((prev) => prev + 1);
    setSelectedOptionIdx(null);
    setManualEditText("");
  }

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

  async function generateAllSuggestions(docId: string) {
    try {
      const res = await fetch("/api/suggest-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const json = await res.json();
      if (json.success) {
        setSuggestProgress({
          generating: false,
          current: json.data.total,
          total: json.data.total,
        });
        // Reload document to pick up new flag options
        await loadDocument(docId);
      } else {
        console.error("suggest-all failed:", json.error);
        setSuggestProgress((prev) => ({ ...prev, generating: false }));
      }
    } catch (err) {
      console.error("suggest-all fetch error:", err);
      setSuggestProgress((prev) => ({ ...prev, generating: false }));
    }
  }


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

  // Compute artifact findings — only after a scan has been run
  const artifactFindings = useMemo(() => {
    if (!fullDocText || !hasScanned) return [];
    return detectArtifacts(fullDocText).findings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullDocText, hasScanned]);

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

  // Citations needing review in the Citations tab — only verification issues,
  // since structural issues now enter the edit queue as citation_fix items.
  const citationsNeedingReview = useMemo(() => {
    return docCitations.filter((c) => {
      const verdict = c.verificationFlags?.verdict;
      const hasVerifyIssue = verdict === "unverified" || verdict === "wrong_details";
      return hasVerifyIssue;
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
    for (const result of plagiarismResults) {
      if (result.verdict !== "plagiarism" || result.status !== "open" || !result.sectionId) continue;
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

    // 6. Citation structural fixes
    for (const cit of docCitations) {
      const flags = cit.structuralFlags ?? [];
      if (flags.length > 0 && cit.status === "open") {
        queue.push({ type: "citation_fix", citation: cit });
      }
    }

    // 7. Spelling batch
    const spellingFindings = (activeDoc?.spellingResults as import("@/lib/analysis/grammar-spelling-types").SpellingFinding[] | null) || [];
    if (spellingFindings.length > 0) {
      queue.push({ type: "spelling_batch", findings: spellingFindings });
    }

    // 8. Grammar batch
    const grammarFindings = (activeDoc?.grammarResults as import("@/lib/analysis/grammar-spelling-types").GrammarFinding[] | null) || [];
    if (grammarFindings.length > 0) {
      queue.push({ type: "grammar_batch", findings: grammarFindings });
    }

    return queue;
  }, [openFlags, artifactFindings, artifactFlags, writingQualityAdvisories, openPlagiarismResults, processedArtifacts, docCitations, activeDoc?.spellingResults, activeDoc?.grammarResults]);

  // Current queue item
  const currentQueueItem = editQueue[selectedFlagIdx] ?? null;
  const currentFlag = currentQueueItem?.type === "ai_detection" || currentQueueItem?.type === "artifact_individual"
    ? currentQueueItem.flag
    : null;
  const currentSection = currentFlag ? sectionMap.get(currentFlag.sectionId) ?? null : null;
  const currentOptions = currentFlag ? flagOptions.filter((o) => o.flagId === currentFlag.id) : [];

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
    if (!currentFlag) return;
    const el = document.querySelector(`[data-section-id="${currentFlag.sectionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentFlag]);

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

          {/* Admin link */}
          <div className="border-t border-gray-200 py-2">
            <a
              href="/admin"
              title="Admin Panel"
              className="flex w-full items-center gap-3 px-3.5 py-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              {(navExpanded || navPinned) && <span className="text-xs truncate">Admin Panel</span>}
            </a>
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
                    <div className={`flex w-full items-center rounded px-2 py-1.5 text-left ${activeDocId === doc.id ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}>
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
                      const isActive = currentFlag && section.id === currentFlag.sectionId;
                      const sectionFlags = flags.filter((f) => f.sectionId === section.id);
                      const hasFlags = sectionFlags.length > 0;
                      const allResolved = hasFlags && sectionFlags.every((f) => f.status !== "open" && f.status !== "generation_failed");
                      const hasOpenFlags = sectionFlags.some((f) => f.status === "open" || f.status === "generation_failed");

                      let sectionColor = "text-gray-700 hover:bg-gray-50";
                      if (section.isLocked) {
                        sectionColor = "text-gray-400 bg-gray-50 cursor-default";
                      } else if (isActive) {
                        sectionColor = "text-gray-900 border-l-2 border-amber-400";
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
                            // Entire sentence is the flag — just amber
                            return (
                              <>
                                {text.slice(0, sentStart)}
                                <mark className="rounded bg-amber-200 px-0.5 text-gray-900 font-medium ring-1 ring-amber-400">{text.slice(pStart, pEnd)}</mark>
                                {text.slice(sentEnd)}
                              </>
                            );
                          }

                          // Three layers: normal → yellow sentence → amber phrase → yellow sentence → normal
                          return (
                            <>
                              {text.slice(0, sentStart)}
                              <span className="bg-yellow-100 rounded-sm">{text.slice(sentStart, pStart)}</span>
                              <mark className="rounded bg-amber-200 px-0.5 text-gray-900 font-medium ring-1 ring-amber-400">{text.slice(pStart, pEnd)}</mark>
                              <span className="bg-yellow-100 rounded-sm">{text.slice(pEnd, sentEnd)}</span>
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
                      currentQueueItem.type === "citation_fix" ? "bg-orange-100 text-orange-700" :
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
                       currentQueueItem.type === "citation_fix" ? "Citation Format" :
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

              {/* ── Citation Format Fix ──────────────────────────────── */}
              {nav === "workspace" && workspaceMode === "edit" && currentQueueItem?.type === "citation_fix" && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Citation Format</span>
                    <span className="text-[10px] text-gray-400">{(currentQueueItem.citation.structuralFlags ?? []).length} issue{(currentQueueItem.citation.structuralFlags ?? []).length !== 1 ? "s" : ""}</span>
                  </div>
                  {/* Original citation */}
                  <div className="rounded-lg border-2 border-gray-300 bg-white p-4">
                    <p className="text-[10px] font-medium text-gray-500 mb-1">Original citation:</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{currentQueueItem.citation.rawText}</p>
                  </div>
                  {/* Structural flags */}
                  <div className="space-y-1.5">
                    {(currentQueueItem.citation.structuralFlags ?? []).map((f, i) => (
                      <div key={i} className={`flex items-start gap-2 rounded px-2.5 py-1.5 text-[10px] ${f.severity === "error" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}>
                        <span className="shrink-0 mt-0.5">{f.severity === "error" ? "\u2717" : "\u26A0"}</span>
                        <span>{f.message}</span>
                      </div>
                    ))}
                  </div>
                  {/* Suggested fix */}
                  {currentQueueItem.citation.correctedText && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <p className="text-[10px] font-medium text-green-700 mb-1">Suggested fix:</p>
                      <p className="text-sm text-green-900 leading-relaxed">{currentQueueItem.citation.correctedText}</p>
                    </div>
                  )}
                  {/* Manual edit textarea — always available */}
                  <div className="rounded-lg border border-gray-300 bg-white p-3">
                    <label className="text-[10px] font-medium text-gray-600 mb-1 block">Or edit manually:</label>
                    <textarea
                      value={manualEditText || currentQueueItem.citation.correctedText || currentQueueItem.citation.rawText}
                      onChange={(e) => setManualEditText(e.target.value)}
                      rows={3}
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

                  {/* Original text — the most prominent element */}
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

                  {/* Loading indicator for options */}
                  {currentOptions.length === 0 && (
                    <div className="flex items-center gap-2 rounded border border-blue-100 bg-blue-50 px-3 py-2">
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 shrink-0" />
                      <p className="text-xs text-blue-600">Generating replacement suggestions...</p>
                    </div>
                  )}

                  {/* Full option display — user reads these here, chooses in Choices panel */}
                  {currentOptions.length > 0 && (
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
                          className={`rounded-lg border p-3 transition-colors ${
                            selectedOptionIdx === i ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200"
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
                          ) : (() => {
                            const originalText = currentSection?.currentText?.slice(currentFlag.phraseStart, currentFlag.phraseEnd) || currentFlag.flaggedPhrase;
                            const segments = wordDiff(originalText, opt.text);
                            const hasChanges = segments.some(s => s.type === "changed");
                            return (
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {hasChanges ? segments.map((seg, si) => (
                                  seg.type === "changed"
                                    ? <span key={si} className="bg-green-100 text-green-800 font-medium">{seg.text}</span>
                                    : <span key={si}>{seg.text}</span>
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

            {/* Progress bar — shown during scanning and suggestion generation */}
            {(scanning || suggestProgress.generating || plagiarismLoading) && (
              <div className="border-b border-gray-200 px-3 py-2 space-y-1.5">
                {scanning && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-blue-700">Scanning</span>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                    </div>
                    <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: "60%" }} />
                    </div>
                  </div>
                )}
                {suggestProgress.generating && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-amber-700">Suggestions</span>
                      <span className="text-[10px] text-amber-600">{suggestProgress.current}/{suggestProgress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${suggestProgress.total > 0 ? (suggestProgress.current / suggestProgress.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
                {plagiarismLoading && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-purple-700">Plagiarism check</span>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                    </div>
                    <div className="h-1.5 rounded-full bg-purple-100 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500 animate-pulse" style={{ width: "40%" }} />
                    </div>
                  </div>
                )}
              </div>
            )}

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

                    {/* ── Citation fix choices ─────────────────────────── */}
                    {currentQueueItem.type === "citation_fix" && (
                      <>
                        {currentQueueItem.citation.correctedText && (
                          <button
                            onClick={() => handleCitationFixResolve(currentQueueItem.citation.id, "accepted", currentQueueItem.citation.correctedText!)}
                            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-white bg-green-600 hover:bg-green-700"
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-green-600">1</span>
                            <span>Apply Fix</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const edited = manualEditText;
                            if (edited && edited !== currentQueueItem.citation.rawText) {
                              handleCitationFixResolve(currentQueueItem.citation.id, "edited", edited);
                            }
                          }}
                          disabled={!manualEditText || manualEditText === currentQueueItem.citation.rawText}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">{currentQueueItem.citation.correctedText ? "2" : "1"}</span>
                          <span>Save Manual Edit</span>
                        </button>
                        <button
                          onClick={() => handleCitationFixResolve(currentQueueItem.citation.id, "dismissed")}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600">{currentQueueItem.citation.correctedText ? "3" : "2"}</span>
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
                  {/* Suggestion generation progress */}
                  {suggestProgress.generating && (
                    <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 shrink-0" />
                        <p className="text-[10px] font-medium text-blue-700">Generating suggestions...</p>
                      </div>
                      <p className="text-[10px] text-blue-600">{suggestProgress.current} of {suggestProgress.total} flags</p>
                    </div>
                  )}

                  {!suggestProgress.generating && (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center max-w-[180px]">
                        <p className="text-xs font-semibold text-gray-400">Choices</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {nav === "workspace" && workspaceMode === "edit" ? "No flags to review." : "Run a scan and AI suggestions will be generated automatically."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

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

function EditSessionSummary({ flags, spellingRemaining, grammarRemaining, onSaveVersion, citationsPending, onGoToCitations }: {
  flags: { id: string; patternType: string; status: string }[];
  spellingRemaining: number;
  grammarRemaining: number;
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
  const hasRemainingWork = unresolvedFlags > 0 || spellingRemaining > 0 || grammarRemaining > 0 || hasPendingCitations;

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
            hasRemainingWork ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"
          }`}>
            {hasRemainingWork ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            )}
          </div>
          <h3 className="text-lg font-bold text-gray-800">
            {hasRemainingWork ? "Items Still Need Attention" : "Editing Complete"}
          </h3>
          {hasRemainingWork ? (
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
              {hasPendingCitations && (
                <p className="text-amber-700 font-medium">{citationsPending} citation{citationsPending !== 1 ? "s" : ""} to review</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              You reviewed all {total} flag{total !== 1 ? "s" : ""} in this document.
            </p>
          )}
        </div>

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
              className="w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Go to Citations ({citationsPending})
            </button>
          )}
          <button
            onClick={onSaveVersion}
            className={`w-full rounded-lg py-2 text-sm font-medium ${
              hasRemainingWork
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

