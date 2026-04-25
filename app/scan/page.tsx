"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import ScoreSpectrum from "@/components/ui/ScoreSpectrum";
import AuditorScoreRing from "@/components/editor/AuditorScoreRing";

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

type Stage = "upload" | "scanning" | "results";

interface ProgressStep {
  label: string;
  status: "waiting" | "running" | "done";
}

export default function FreeScanPage() {
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
    setStage("scanning");

    // Initialize progress steps
    const initialSteps: ProgressStep[] = [
      { label: "Uploading document", status: "running" },
      { label: "AI detection scan", status: "waiting" },
      { label: "Writing quality analysis", status: "waiting" },
      { label: "AI artifact detection", status: "waiting" },
      { label: "Tone consistency check", status: "waiting" },
    ];
    setSteps(initialSteps);
    setScanPercent(5);

    // Step 1: Upload
    const formData = new FormData();
    if (file) formData.append("file", file);
    else formData.append("text", pastedText);
    formData.append("title", file?.name?.replace(/\.[^.]+$/, "") || "Free Scan Document");
    formData.append("documentType", docType);

    let documentId: string;
    let wordCount: number;
    try {
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (!uploadJson.success) {
        setError(uploadJson.error || "Upload failed.");
        setStage("upload");
        return;
      }
      documentId = uploadJson.data.documentId;
      wordCount = uploadJson.data.wordCount;
    } catch {
      setError("Could not connect to the server.");
      setStage("upload");
      return;
    }

    // Step 1 done
    updateStep(0, "done");
    updateStep(1, "running");
    setScanPercent(20);

    // Step 2-5: Scan (all happen server-side in one call)
    try {
      // Simulate progress while waiting for scan
      const progressInterval = setInterval(() => {
        setScanPercent((p) => Math.min(p + 3, 85));
      }, 500);

      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
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

      // Mark all steps done
      updateStep(1, "done");
      updateStep(2, "done");
      setScanPercent(70);

      // Load document scores
      const docRes = await fetch(`/api/documents/${documentId}`);
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

      // Calculate auditor score (simplified — AI + quality + artifacts + tone)
      const scores: { value: number | null; weight: number }[] = [
        { value: scanResult.aiRiskScore != null ? 100 - scanResult.aiRiskScore : null, weight: 25 },
        { value: scanResult.aiArtifactScore, weight: 12 },
        { value: scanResult.writingQualityScore, weight: 10 },
        { value: scanResult.toneConsistencyScore, weight: 8 },
      ];
      let totalWeight = 0;
      let totalScore = 0;
      for (const s of scores) {
        if (s.value != null) {
          totalWeight += s.weight;
          totalScore += s.value * s.weight;
        }
      }
      setAuditorScore(totalWeight > 0 ? Math.round(totalScore / totalWeight) : null);

      // Brief delay so user sees 100% before transition
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

  function resetToUpload() {
    setStage("upload");
    setFile(null);
    setPastedText("");
    setError(null);
    setResult(null);
    setAuditorScore(null);
    setSteps([]);
    setScanPercent(0);
  }

  const scoreLabel = (s: number | null) =>
    s === null ? null : s >= 90 ? "Excellent" : s >= 70 ? "Good" : s >= 50 ? "Needs work" : s >= 30 ? "Poor" : "Critical";

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

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-3 text-gray-400">or paste your text</span>
                </div>
              </div>

              {/* Paste */}
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={6}
                disabled={!!file}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Paste your document text here..."
              />

              {/* Document type */}
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
                Scan My Draft
              </button>
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

            {/* Progress steps */}
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

            {/* Progress bar */}
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
            </div>

            {/* Score spectrums */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              <ScoreSpectrum
                label="AI Detectability"
                score={result.aiRiskScore}
                interpretation={result.aiRiskScore >= 70 ? "High" : result.aiRiskScore >= 40 ? "Moderate" : result.aiRiskScore >= 15 ? "Low" : "Minimal"}
                lowLabel="0" highLabel="100" lowerIsBetter
              />
              <ScoreSpectrum
                label="AI Artifacts"
                score={result.aiArtifactScore}
                interpretation={result.aiArtifactScore === null ? "Not checked" : result.aiArtifactScore >= 90 ? "Clean" : result.aiArtifactScore >= 70 ? "Minor" : "Present"}
                lowLabel="0" highLabel="100" lowerIsBetter
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
                interpretation="Not checked"
                lowLabel="0" highLabel="100"
              />
              <ScoreSpectrum
                label="Plagiarism"
                score={null}
                interpretation="Not checked"
                lowLabel="0" highLabel="100" lowerIsBetter
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
                {result.aiArtifactScore != null && result.aiArtifactScore < 90 && (
                  <p>
                    AI formatting artifacts were detected (score: {result.aiArtifactScore}/100). These include patterns like em dashes, smart quotes, or structural formatting that detectors flag.
                  </p>
                )}
                {result.toneConsistencyScore != null && result.toneConsistencyScore < 90 && (
                  <p>
                    Tone consistency: {result.toneConsistencyScore}/100 — some shifts in voice or register were detected.
                  </p>
                )}
                <p className="text-gray-400 italic">
                  Plagiarism and citation checks are available with a subscription.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900">Ready to fix it?</h3>
              <p className="mt-2 text-sm text-gray-500">
                EzSay walks you through each flag with side-by-side rewrites.
                You pick what stays and what changes.
              </p>
              <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
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
                <button
                  onClick={resetToUpload}
                  className="rounded-full border border-gray-300 px-7 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
                >
                  Scan Another Document
                </button>
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
