"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import ScoreSpectrum from "@/components/ui/ScoreSpectrum";
import AuditorScoreRing from "@/components/editor/AuditorScoreRing";
import { createClient } from "@/lib/supabase/client";
import { computeAuditorScore as computeSharedAuditorScore } from "@/lib/analysis/auditor-score";

const DOC_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "legal", label: "Legal" },
];

interface ScanResult {
  aiRiskScore: number;
  writingQualityScore: number;
  aiArtifactScore: number | null;
  toneConsistencyScore: number | null;
  totalFlags: number;
  sectionCount: number;
  wordCount: number;
}

interface SampleFlag {
  flaggedPhrase: string;
  explanation: string;
  patternType: string;
}

type Stage = "upload" | "scanning" | "results";

interface ProgressStep {
  label: string;
  status: "waiting" | "running" | "done";
}

// Stash the active free-scan documentId in localStorage so that when the
// visitor returns from the email-verification link (possibly in a new tab)
// we can fetch the same scan and reveal sample flags.
const STORAGE_KEY = "ezsay_free_scan_doc_id";

export default function FreeScanPage() {
  return (
    <Suspense>
      <FreeScanInner />
    </Suspense>
  );
}

function FreeScanInner() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [docType, setDocType] = useState("professional");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scanning state
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [scanPercent, setScanPercent] = useState(0);

  // Results state
  const [result, setResult] = useState<ScanResult | null>(null);
  const [auditorScore, setAuditorScore] = useState<number | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  // Auth-aware state — drives whether we show the email gate or the
  // post-claim reveal (sample flagged sentences).
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [restoringSession, setRestoringSession] = useState(true);

  // Email gate state
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Post-claim sample flags
  const [sampleFlags, setSampleFlags] = useState<SampleFlag[]>([]);
  const [sampleFlagsFetched, setSampleFlagsFetched] = useState(false);

  // ── Mount: detect session, restore prior scan if user is returning from
  //          the verification email, listen for auth state changes.
  useEffect(() => {
    let mounted = true;
    const justClaimed = searchParams.get("claimed") === "1";

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;

      if (user) {
        setIsAnonymous(!!user.is_anonymous);
      }

      // Restore prior scan when a documentId is stashed locally — covers
      // both the post-claim flow (?claimed=1 after email verification) AND
      // a casual refresh by an anonymous visitor who already scanned.
      const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (savedId && user) {
        setDocumentId(savedId);
        await restoreResultsFromDoc(savedId);
        setStage("results");
        if (justClaimed && !user.is_anonymous) {
          await fetchSampleFlags(savedId);
        }
      }

      setRestoringSession(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user;
      if (u) setIsAnonymous(!!u.is_anonymous);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the user transitions from anonymous → permanent (and we have
  // a doc), fetch the sample flags to populate the post-claim reveal.
  useEffect(() => {
    if (!isAnonymous && documentId && stage === "results" && !sampleFlagsFetched) {
      fetchSampleFlags(documentId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnonymous, documentId, stage, sampleFlagsFetched]);

  async function fetchSampleFlags(docId: string) {
    setSampleFlagsFetched(true);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.flags)) {
        const open = json.data.flags
          .filter((f: { status: string }) => f.status === "open")
          .slice(0, 2)
          .map((f: { flaggedPhrase: string; explanation: string; patternType: string }) => ({
            flaggedPhrase: f.flaggedPhrase,
            explanation: f.explanation,
            patternType: f.patternType,
          }));
        setSampleFlags(open);
      }
    } catch {
      // Soft-fail: post-claim view still works without sample flags
    }
  }

  /** Rebuild the results view when the user returns from the email link. */
  async function restoreResultsFromDoc(docId: string) {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const json = await res.json();
      if (!json.success) return;

      const doc = json.data.document;
      const flags = json.data.flags ?? [];
      const sections = json.data.sections ?? [];
      const words = (doc.rawText ?? "").split(/\s+/).filter(Boolean).length;

      const restored: ScanResult = {
        aiRiskScore: doc.aiRiskScore ?? 0,
        writingQualityScore: doc.writingQualityScore ?? 0,
        aiArtifactScore: doc.aiArtifactScore ?? null,
        toneConsistencyScore: doc.toneConsistencyScore ?? null,
        totalFlags: flags.length,
        sectionCount: sections.length,
        wordCount: words,
      };
      setResult(restored);
      setAuditorScore(computeAuditorScore(restored));
    } catch {
      // Soft-fail
    }
  }

  function computeAuditorScore(r: ScanResult): number | null {
    // Shared weights + fatal-flaw caps live in lib/analysis/auditor-score.ts
    return computeSharedAuditorScore({
      aiDetectability: r.aiRiskScore != null ? 100 - r.aiRiskScore : null,
      aiArtifacts: r.aiArtifactScore,
      writingQuality: r.writingQualityScore,
      toneConsistency: r.toneConsistencyScore,
    });
  }

  /** Make sure we have a Supabase session before calling the upload/scan APIs. */
  async function ensureSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(
        `Couldn't start a free-scan session. ${error.message.includes("anonymous") ? "Anonymous sign-ins may be disabled in Supabase — enable Authentication → Providers → Anonymous Sign-Ins." : error.message}`
      );
    }
    if (data.user) setIsAnonymous(!!data.user.is_anonymous);
    return data.user;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function handleScan() {
    if (!file && !pastedText.trim()) {
      setError("Upload a file or paste your text.");
      return;
    }

    setError(null);

    // Ensure we have a session (creates an anonymous one if needed).
    try {
      await ensureSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not initialize session.");
      return;
    }

    setStage("scanning");

    const initialSteps: ProgressStep[] = [
      { label: "Uploading document", status: "running" },
      { label: "AI detection scan", status: "waiting" },
      { label: "Writing quality analysis", status: "waiting" },
      { label: "AI artifact detection", status: "waiting" },
      { label: "Tone consistency check", status: "waiting" },
    ];
    setSteps(initialSteps);
    setScanPercent(5);

    const formData = new FormData();
    if (file) formData.append("file", file);
    else formData.append("text", pastedText);
    formData.append("title", file?.name?.replace(/\.[^.]+$/, "") || "Free Scan Document");
    formData.append("documentType", docType);

    let uploadedDocId: string;
    let wordCount: number;
    try {
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (!uploadJson.success) {
        setError(uploadJson.error || "Upload failed.");
        setStage("upload");
        return;
      }
      uploadedDocId = uploadJson.data.documentId;
      wordCount = uploadJson.data.wordCount;
      // Stash so we can recover post-claim
      try { localStorage.setItem(STORAGE_KEY, uploadedDocId); } catch { /* ignore */ }
      setDocumentId(uploadedDocId);
    } catch {
      setError("Could not connect to the server.");
      setStage("upload");
      return;
    }

    updateStep(0, "done");
    updateStep(1, "running");
    setScanPercent(20);

    try {
      const progressInterval = setInterval(() => {
        setScanPercent((p) => Math.min(p + 3, 85));
      }, 500);

      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: uploadedDocId,
          categories: {
            aiDetection: true,
            writingQuality: true,
            aiArtifacts: true,
            plagiarism: false,
            citations: false,
            toneConsistency: true,
            spelling: false,
            grammar: false,
          },
          aiDetectionDepth: "surface",
        }),
      });

      clearInterval(progressInterval);

      const scanJson = await scanRes.json();
      if (!scanJson.success) {
        setError(scanJson.error || "Scan failed.");
        setStage("upload");
        return;
      }

      updateStep(1, "done");
      updateStep(2, "done");
      setScanPercent(70);

      const docRes = await fetch(`/api/documents/${uploadedDocId}`);
      const docJson = await docRes.json();

      updateStep(3, "done");
      updateStep(4, "done");
      setScanPercent(100);

      const doc = docJson.data?.document;
      const scanResult: ScanResult = {
        aiRiskScore: scanJson.data.aiRiskScore ?? 0,
        writingQualityScore: doc?.writingQualityScore ?? scanJson.data.writingQualityScore ?? 0,
        aiArtifactScore: doc?.aiArtifactScore ?? null,
        toneConsistencyScore: doc?.toneConsistencyScore ?? null,
        totalFlags: scanJson.data.totalFlags ?? 0,
        sectionCount: scanJson.data.sectionCount ?? 0,
        wordCount,
      };

      setResult(scanResult);
      setAuditorScore(computeAuditorScore(scanResult));

      setTimeout(() => setStage("results"), 600);
    } catch {
      setError("Scan failed. Please try again.");
      setStage("upload");
    }
  }

  function updateStep(index: number, status: ProgressStep["status"]) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status } : s))
    );
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailSubmitting(true);
    setEmailError(null);

    // updateUser({email}) on an anonymous user sends a verification link.
    // Clicking it converts them into a permanent user (preserving user_id,
    // so the scan stays attached). The link routes through /auth/callback
    // which is already in Supabase's redirect-URL allowlist; the callback
    // then forwards us to /scan?claimed=1.
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/scan?claimed=1` }
    );

    if (error) {
      setEmailError(error.message);
      setEmailSubmitting(false);
      return;
    }

    setEmailSent(true);
    setEmailSubmitting(false);
  }

  const scoreLabel = (s: number | null) =>
    s === null ? null : s >= 90 ? "Excellent" : s >= 70 ? "Good" : s >= 50 ? "Needs work" : s >= 30 ? "Poor" : "Critical";

  const PATTERN_LABELS: Record<string, string> = {
    banned_word: "Common AI phrase",
    banned_structure: "AI sentence pattern",
    synonym_rotation: "Synonym rotation",
    uniform_length: "Uniform length",
    uniform_density: "Uniform density",
    transition_pattern: "Transition pattern",
  };

  if (restoringSession) {
    return (
      <div className="min-h-screen bg-white">
        <LandingNav />
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <LandingNav />

      <div className="mx-auto max-w-2xl px-6 pb-20">
        {/* ── Upload State ─────────────────────────────────────── */}
        {stage === "upload" && (
          <div className="pt-4">
            <h1 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              See where your draft stands.
            </h1>
            <p className="mt-2 text-center text-sm text-gray-500">
              Upload a document for a free scan. No editing — just your scores.
            </p>

            <div className="mt-8 space-y-5">
              {/* File upload */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50"
                    : file
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 bg-gray-50 hover:border-gray-400"
                }`}
              >
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700">{file.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Drop a file here or click to upload</p>
                    <p className="mt-1 text-xs text-gray-400">PDF, .docx, or .txt</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFileSelect} className="hidden" />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-3 text-gray-400">or paste your text</span>
                </div>
              </div>

              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={6}
                disabled={!!file}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Paste your document text here..."
              />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Document type</label>
                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((dt) => (
                    <button
                      key={dt.value}
                      onClick={() => setDocType(dt.value)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        docType === dt.value
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleScan}
                disabled={!file && !pastedText.trim()}
                className="w-full rounded-full bg-gray-900 py-3.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                style={{ boxShadow: "0 8px 30px -6px rgba(0, 0, 0, 0.25)" }}
              >
                Scan My Draft — Free
              </button>
              <p className="text-center text-xs text-gray-400">
                One free scan per visitor. No card required.
              </p>
            </div>
          </div>
        )}

        {/* ── Scanning State ───────────────────────────────────── */}
        {stage === "scanning" && (
          <div className="pt-12 text-center">
            <div className="flex justify-center">
              <AuditorScoreRing score={null} sizeClass="h-20 w-20" />
            </div>
            <p className="mt-4 text-lg font-semibold text-gray-900">
              Scanning your document...
            </p>

            <div className="mx-auto mt-8 max-w-xs text-left space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {step.status === "done" ? (
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : step.status === "running" ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-200" />
                  )}
                  <span className={`text-sm ${step.status === "done" ? "text-gray-900" : step.status === "running" ? "text-blue-600 font-medium" : "text-gray-400"}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-8 max-w-xs">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${scanPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">{scanPercent}%</p>
            </div>
          </div>
        )}

        {/* ── Results State ─────────────────────────────────────── */}
        {stage === "results" && result && (
          <div className="pt-8">
            {/* Auditor Score */}
            <div className="text-center">
              <div className="flex justify-center">
                <AuditorScoreRing score={auditorScore} sizeClass="h-24 w-24" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">
                Auditor Score
              </p>
              <p className="text-xs text-gray-500">
                {scoreLabel(auditorScore)}
              </p>
              <p className="mx-auto mt-2 max-w-xs text-[11px] text-gray-400">
                EzSay&apos;s own estimate of AI-pattern density — not a prediction of
                what your university&apos;s detector will report.
              </p>
            </div>

            {/* Score spectrums */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              <ScoreSpectrum
                label="AI Detectability"
                score={result.aiRiskScore != null ? 100 - result.aiRiskScore : null}
                interpretation={result.aiRiskScore >= 70 ? "Very detectable" : result.aiRiskScore >= 40 ? "Some AI signals" : result.aiRiskScore >= 15 ? "Low AI signals" : "Reads human"}
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="AI Artifacts"
                score={result.aiArtifactScore}
                interpretation={result.aiArtifactScore === null ? "Not checked" : result.aiArtifactScore >= 90 ? "Clean" : result.aiArtifactScore >= 70 ? "Minor" : "Present"}
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="Writing Quality"
                score={result.writingQualityScore}
                interpretation={result.writingQualityScore >= 80 ? "Strong" : result.writingQualityScore >= 60 ? "Good" : result.writingQualityScore >= 40 ? "Fair" : "Weak"}
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="Citations"
                score={null}
                interpretation="Subscriber-only"
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="Plagiarism"
                score={null}
                interpretation="Subscriber-only"
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="Tone Consistency"
                score={result.toneConsistencyScore}
                interpretation={result.toneConsistencyScore === null ? "Not checked" : result.toneConsistencyScore >= 90 ? "Consistent" : result.toneConsistencyScore >= 70 ? "Minor shifts" : "Inconsistent"}
                lowLabel="0" highLabel="100"
              />
            </div>

            {/* Written summary */}
            <div className="mt-10">
              <h2 className="text-sm font-semibold text-gray-900">What we found</h2>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
                <p>
                  Your {result.wordCount.toLocaleString()}-word document scored{" "}
                  <span className="font-semibold text-gray-900">{auditorScore}</span> out of
                  100 on the Auditor Scale.
                </p>
                {result.totalFlags > 0 && (
                  <p>
                    {result.totalFlags} AI detection flag{result.totalFlags !== 1 ? "s" : ""} across{" "}
                    {result.sectionCount} section{result.sectionCount !== 1 ? "s" : ""} —{" "}
                    {result.aiRiskScore >= 70
                      ? "multiple patterns that AI detectors typically catch"
                      : result.aiRiskScore >= 40
                        ? "some patterns that detectors may flag"
                        : "a few minor patterns detected"}
                    .
                  </p>
                )}
                {result.totalFlags === 0 && (
                  <p>No AI detection flags found — your writing reads naturally.</p>
                )}
                <p>
                  Writing quality is {result.writingQualityScore >= 80 ? "strong" : result.writingQualityScore >= 60 ? "good" : result.writingQualityScore >= 40 ? "fair" : "below average"} ({result.writingQualityScore}/100).
                </p>
              </div>
            </div>

            {/* ── Email Gate (anonymous users) ────────────────── */}
            {isAnonymous && result.totalFlags > 0 && (
              <div className="mt-10 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6">
                {emailSent ? (
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-gray-900">Check your email</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      We sent a verification link to{" "}
                      <span className="font-medium text-gray-900">{email}</span>.
                      Click it to see exactly which sentences we flagged and why.
                    </p>
                    <p className="mt-3 text-xs text-gray-400">
                      The link will bring you back here with your full results.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-base font-semibold text-gray-900">
                      We found {result.totalFlags} specific issue{result.totalFlags !== 1 ? "s" : ""} in your draft.
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Enter your email to see exactly which sentences and how we&apos;d fix them.
                      No password required — we&apos;ll send a one-click verification link.
                    </p>
                    <form onSubmit={handleEmailSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-gray-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={emailSubmitting || !email.trim()}
                        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {emailSubmitting ? "Sending…" : "See My Issues"}
                      </button>
                    </form>
                    {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
                    <p className="mt-3 text-xs text-gray-400">
                      We&apos;ll only use your email to send your scan results and occasional
                      product updates. No spam.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Sample flagged sentences (post-claim) ──────── */}
            {!isAnonymous && sampleFlags.length > 0 && (
              <div className="mt-10">
                <h2 className="text-sm font-semibold text-gray-900">
                  Sample flagged sentences from your draft
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {result.totalFlags - sampleFlags.length > 0
                    ? `Showing ${sampleFlags.length} of ${result.totalFlags} flags. Subscribe to see the rest plus side-by-side rewrites.`
                    : `Showing all ${sampleFlags.length} flag${sampleFlags.length !== 1 ? "s" : ""}. Subscribe to see side-by-side rewrites.`}
                </p>
                <div className="mt-4 space-y-3">
                  {sampleFlags.map((flag, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-amber-200 bg-amber-50/60 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-amber-200 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          {PATTERN_LABELS[flag.patternType] ?? "AI pattern"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-gray-900">
                            <span className="bg-amber-200/70 px-0.5 font-medium">
                              {flag.flaggedPhrase}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-gray-600">{flag.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Subscribe CTA ─────────────────────────────── */}
            <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900">
                {!isAnonymous && sampleFlags.length > 0
                  ? "See every flag and a rewrite for each."
                  : "Ready to fix it?"}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                EzSay walks you through each flag with side-by-side rewrites.
                You pick what stays and what changes.
              </p>
              <div className="mt-5 flex justify-center">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-7 py-3 text-sm font-medium text-white hover:bg-gray-800"
                  style={{ boxShadow: "0 8px 30px -6px rgba(0, 0, 0, 0.25)" }}
                >
                  Start Editing — Subscribe
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Subscribe to unlock plagiarism + citation checking, grammar fixes,
                and the complete editing workspace.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
