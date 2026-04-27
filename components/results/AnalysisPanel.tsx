"use client";

import { useState, useMemo } from "react";
import { PATTERN_TYPE_LABELS } from "@/lib/constants";
import { detectArtifacts, type ArtifactFinding } from "@/lib/analysis/artifact-detector";
import { calculateWritingQuality } from "@/lib/analysis/quality-scorer";

interface DocumentData {
  id: string;
  title: string;
  aiRiskScore: number | null;
  writingQualityScore: number | null;
  aiArtifactScore: number | null;
  citationsScore: number | null;
  toneConsistencyScore: number | null;
  spellingScore: number | null;
  grammarScore: number | null;
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
}

interface FlagData {
  id: string;
  patternType: string;
  status: string;
  flaggedPhrase: string;
  explanation: string;
  metadata: unknown;
}

interface PlagiarismResultData {
  id: string;
  verdict: string;
  status: string;
  passageText: string;
  explanation: string | null;
  confidence: number | null;
  topMatchUrl: string | null;
  topMatchTitle: string | null;
  topMatchSnippet: string | null;
}

interface SuggestProgress {
  generating: boolean;
  current: number;
  total: number;
}

interface AnalysisPanelProps {
  document: DocumentData | null;
  versions: { id: string; versionLabel: string; versionNumber: number; aiRiskScore: number | null; writingQualityScore: number | null }[];
  flags: FlagData[];
  plagiarismResults: PlagiarismResultData[];
  plagiarismLoading: boolean;
  scanning?: boolean;
  documentText?: string;
  suggestionsGenerating?: boolean;
  suggestionsProgress?: SuggestProgress;
  toneCheckDone?: boolean;
  plagiarismEnabled?: boolean;
  toneEnabled?: boolean;
  onStartEditing: () => void;
  /** Switches the workspace nav to the Citations page. */
  onGoToCitations?: () => void;
}

export default function AnalysisPanel({ document: doc, versions, flags, plagiarismResults, plagiarismLoading, scanning, documentText, suggestionsGenerating, suggestionsProgress, toneCheckDone, plagiarismEnabled, toneEnabled, onStartEditing, onGoToCitations }: AnalysisPanelProps) {
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  // Hooks must be called before any early returns
  const artifactFindings = useMemo(() => documentText ? detectArtifacts(documentText).findings : [], [documentText]);
  const qualityBreakdown = useMemo(() => documentText ? calculateWritingQuality(documentText) : null, [documentText]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <h3 className="text-sm font-semibold text-gray-400">Analysis</h3>
          <p className="mt-2 text-xs text-gray-400">Load a document and run a scan to see your analysis here.</p>
        </div>
      </div>
    );
  }

  if (doc.aiRiskScore == null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <h3 className="text-sm font-semibold text-gray-400">No scan data yet</h3>
          <p className="mt-2 text-xs text-gray-400">Run a scan first using the Scan button in the toolbar.</p>
        </div>
      </div>
    );
  }

  // AI detection flags only (for the AI Detection section)
  const aiDetectionFlags = flags.filter((f) => f.patternType !== "ai_artifact" && f.patternType !== "writing_quality" && f.patternType !== "plagiarism_match");
  const aiDetectionOpen = aiDetectionFlags.filter((f) => f.status === "open" || f.status === "generation_failed").length;

  // Artifact instance count
  const artifactInstanceCount = artifactFindings.reduce((sum, f) => sum + f.count, 0);

  // Plagiarism counts — separate actual plagiarism from common knowledge
  // Counts show ALL results (not just open) so they match what the user sees in the detail panel
  const plagiarismFlagCount = plagiarismResults.filter((r) => r.verdict === "plagiarism").length;
  const commonKnowledgeCount = plagiarismResults.filter((r) => r.verdict === "common_knowledge").length;
  const plagiarismCheckedTotal = plagiarismResults.filter((r) => r.verdict !== "error").length;

  // Total across all types
  const totalToReview = aiDetectionOpen + (artifactFindings.length > 0 ? 1 : 0) + plagiarismFlagCount;

  const aiScore = doc.aiRiskScore ?? 0;
  const qualScore = doc.writingQualityScore ?? 50;
  const artifactScore = doc.aiArtifactScore ?? null;
  const artifactScoreInverted = artifactScore !== null ? 100 - artifactScore : null;
  const extractionMeta = doc.extractionMeta;
  const showCoverageWarning = extractionMeta?.sourceType === "pdf"
    && (extractionMeta.confidence === "low" || extractionMeta.likelyGraphicsHeavy);
  const analyzedCoveragePercent = extractionMeta?.coverageRatio != null
    ? Math.round(extractionMeta.coverageRatio * 100)
    : null;

  // Plagiarism score — only actual plagiarism counts, weighted by confidence
  const plagiarismOnly = plagiarismResults.filter((r) => r.verdict === "plagiarism");
  const plagScore = plagiarismCheckedTotal > 0
    ? Math.round(
        (plagiarismOnly.reduce((sum, r) => sum + (r.confidence ?? 0.5), 0) / plagiarismCheckedTotal) * 100
      )
    : null;

  const citationScore = doc.citationsScore ?? null;
  const toneScore = doc.toneConsistencyScore ?? null;
  const spellingScore = doc.spellingScore ?? null;
  const grammarScore = doc.grammarScore ?? null;

  // Flag stats by category for AI Detection detail
  const categories = Object.keys(PATTERN_TYPE_LABELS);
  const categoryStats = categories.map((type) => {
    const typeFlags = flags.filter((f) => f.patternType === type);
    return {
      type,
      label: PATTERN_TYPE_LABELS[type].label,
      color: PATTERN_TYPE_LABELS[type].color,
      total: typeFlags.length,
      open: typeFlags.filter((f) => f.status === "open" || f.status === "generation_failed").length,
      flags: typeFlags,
    };
  }).filter((c) => c.total > 0);

  function toggle(id: string) {
    setExpandedScore(expandedScore === id ? null : id);
  }

  return (
    <div className="h-full overflow-auto p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Analysis</h2>
          {scanning && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
              <span className="text-xs text-gray-500">Scanning...</span>
            </div>
          )}
          {!scanning && totalToReview > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                <strong>{aiDetectionOpen}</strong> AI flag{aiDetectionOpen !== 1 ? "s" : ""}
                {artifactFindings.length > 0 && <>, <strong>{artifactInstanceCount}</strong> artifact{artifactInstanceCount !== 1 ? "s" : ""}</>}
                {plagiarismFlagCount > 0 && <>, <strong>{plagiarismFlagCount}</strong> plagiarism</>}
                {commonKnowledgeCount > 0 && <>, <strong>{commonKnowledgeCount}</strong> common knowledge</>}
              </span>
              <button
                onClick={onStartEditing}
                disabled={suggestionsGenerating}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestionsGenerating ? "Preparing..." : "Start Editing"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress checklist — shown during scan pipeline */}
      {(scanning || suggestionsGenerating || plagiarismLoading) && (() => {
        const steps = [
          { label: "AI detection scan", done: !scanning && doc?.aiRiskScore != null, active: !!scanning },
          { label: "Writing quality", done: doc?.writingQualityScore != null, active: false },
          { label: "AI artifacts", done: doc?.aiArtifactScore != null, active: false },
          { label: suggestionsProgress ? `Generating suggestions (${suggestionsProgress.current}/${suggestionsProgress.total})` : "Generating suggestions", done: !suggestionsGenerating && !scanning, active: !!suggestionsGenerating },
          ...(plagiarismEnabled !== false ? [{ label: "Plagiarism check", done: !plagiarismLoading && plagiarismResults.length > 0, active: !!plagiarismLoading }] : []),
          ...(toneEnabled !== false ? [{ label: "Tone consistency", done: !!toneCheckDone, active: !toneCheckDone && !scanning }] : []),
        ];
        const enabledSteps = steps;
        const completedCount = enabledSteps.filter((s) => s.done).length;
        const progressPercent = Math.round((completedCount / enabledSteps.length) * 100);

        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700">Scanning & Preparing Your Document</span>
              <span className="text-[10px] text-blue-500">{progressPercent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-blue-200 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="space-y-0.5">
              {enabledSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  {step.done ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : step.active ? (
                    <div className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-300 border-t-blue-600 shrink-0" />
                  ) : (
                    <span className="text-gray-400">&#9675;</span>
                  )}
                  <span className={step.done ? "text-green-700" : step.active ? "text-blue-700 font-medium" : "text-gray-400"}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {showCoverageWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-800">Limited analysis confidence for this PDF</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
            This file appears graphics-heavy or image-based. Scores are based only on extracted text{analyzedCoveragePercent != null ? ` (${analyzedCoveragePercent}% page text coverage)` : ""} and may not represent the full document.
          </p>
          <p className="mt-1 text-[10px] text-amber-700">
            Text score reflects extracted content only{extractionMeta?.extractedWordCount != null ? ` (${extractionMeta.extractedWordCount.toLocaleString()} words analyzed)` : ""}.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-400">Click any score to see what contributed to it.</p>

      {/* Score spectrums — 2 per row, clickable */}
      <div className="space-y-3">
        {/* Row 1: AI Detection + AI Artifacts */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreSpectrum label="AI Detectability" score={aiScore} interpretation={aiScore >= 70 ? "High" : aiScore >= 40 ? "Moderate" : aiScore >= 15 ? "Low" : "Very Low"} lowLabel="0" highLabel="100" lowerIsBetter expanded={expandedScore === "ai"} onClick={() => toggle("ai")} />
          <ScoreSpectrum label="AI Artifacts" score={artifactScoreInverted} interpretation={artifactScoreInverted === null ? "Not scanned" : artifactScoreInverted <= 10 ? "Clean" : artifactScoreInverted <= 30 ? "Minor" : artifactScoreInverted <= 50 ? "Moderate" : "Heavy"} lowLabel="0" highLabel="100" lowerIsBetter expanded={expandedScore === "artifacts"} onClick={() => toggle("artifacts")} />
        </div>

        {/* AI Detection detail */}
        {expandedScore === "ai" && (
          <DetailPanel title={`AI Detection (${aiDetectionOpen} flag${aiDetectionOpen !== 1 ? "s" : ""})`}>
            {categoryStats.length === 0 && <p className="text-xs text-gray-400">No AI patterns detected.</p>}
            {categoryStats.map((cat) => (
              <div key={cat.type} className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.color}`}>{cat.label}</span>
                  <span className="text-[10px] text-gray-500">{cat.total} flag{cat.total !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-0.5 pl-1">
                  {cat.flags.slice(0, 8).map((f) => (
                    <div key={f.id} className="flex items-start gap-2 text-[10px]">
                      <span className="text-amber-600 font-medium shrink-0">"{f.flaggedPhrase.length > 30 ? f.flaggedPhrase.slice(0, 30) + "..." : f.flaggedPhrase}"</span>
                      <span className="text-gray-400">{f.explanation.length > 60 ? f.explanation.slice(0, 60) + "..." : f.explanation}</span>
                    </div>
                  ))}
                  {cat.flags.length > 8 && <p className="text-[9px] text-gray-400">+ {cat.flags.length - 8} more</p>}
                </div>
              </div>
            ))}
          </DetailPanel>
        )}

        {/* AI Artifacts detail */}
        {expandedScore === "artifacts" && (
          <DetailPanel title={`AI Artifacts (${artifactInstanceCount} instance${artifactInstanceCount !== 1 ? "s" : ""})`}>
            {artifactFindings.length === 0 && <p className="text-xs text-gray-400">No AI formatting artifacts detected. Your document is clean.</p>}
            {artifactFindings.map((f, i) => (
              <div key={i} className="flex items-start justify-between py-1 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-[10px] font-medium text-gray-700">{f.item}</p>
                  <p className="text-[9px] text-gray-400">{f.detail}</p>
                </div>
                <span className={`shrink-0 ml-2 rounded px-1.5 py-0.5 text-[9px] font-semibold ${f.penalty >= 10 ? "bg-red-100 text-red-600" : f.penalty >= 5 ? "bg-amber-100 text-amber-600" : "bg-yellow-100 text-yellow-600"}`}>
                  -{f.penalty}
                </span>
              </div>
            ))}
          </DetailPanel>
        )}

        {/* Row 2: Writing Quality + Citations */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreSpectrum label="Writing Quality" score={qualScore} interpretation={qualScore >= 80 ? "Excellent" : qualScore >= 60 ? "Good" : qualScore >= 40 ? "Fair" : "Needs Work"} lowLabel="0" highLabel="100" expanded={expandedScore === "quality"} onClick={() => toggle("quality")} />
          <ScoreSpectrum label="Citations" score={citationScore} interpretation={citationScore === null ? "Not checked" : citationScore >= 90 ? "Excellent" : citationScore >= 70 ? "Good" : citationScore >= 50 ? "Fair" : "Needs attention"} lowLabel="0" highLabel="100" expanded={expandedScore === "citations"} onClick={() => toggle("citations")} />
        </div>

        {/* Writing Quality detail */}
        {expandedScore === "quality" && qualityBreakdown && (
          <DetailPanel title="Writing Quality Breakdown">
            <SubScore label="Readability (Flesch)" score={qualityBreakdown.fleschScore} description="Sentence length and word complexity. Higher = more readable." />
            <SubScore label="Paragraph Variation" score={qualityBreakdown.paragraphVariation} description="How varied your paragraph lengths are. Uniform = AI-like." />
            <SubScore label="Sentence Variation" score={qualityBreakdown.sentenceVariation} description="Mix of short and long sentences. Higher = more natural." />
            <SubScore label="Section Coherence" score={qualityBreakdown.sectionCoherence} description="How well adjacent sentences connect. Too high = repetitive, too low = disjointed." />
            <SubScore label="Lexical Diversity" score={qualityBreakdown.lexicalDiversity} description="Vocabulary range. Higher = richer word choice." />
          </DetailPanel>
        )}

        {/* Citations detail */}
        {expandedScore === "citations" && (
          <DetailPanel title={`Citations${citationScore !== null ? ` — score ${citationScore}/100` : ""}`}>
            {citationScore === null && (
              <p className="text-xs text-gray-400">No citation check has been run. Enable "Citations" in the scan configuration, or go to the Citations page to extract and check manually.</p>
            )}
            {citationScore !== null && citationScore >= 90 && (
              <p className="text-xs text-green-600">All citations look structurally correct.</p>
            )}
            {citationScore !== null && citationScore < 90 && (
              <p className="text-xs text-amber-600">Some citations have structural issues. Go to the Citations page to review and fix them.</p>
            )}
            {onGoToCitations && (
              <button
                onClick={onGoToCitations}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-400 transition-colors"
              >
                Open Citations
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            )}
          </DetailPanel>
        )}

        {/* Row 3: Plagiarism + Tone Consistency */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreSpectrum label="Plagiarism" score={plagScore} loading={plagiarismLoading} interpretation={plagScore === null ? (plagiarismLoading ? "Checking..." : "Not checked") : plagScore === 0 ? "Clean" : plagScore <= 10 ? "Minor" : plagScore <= 30 ? "Moderate" : "High"} lowLabel="0" highLabel="100" lowerIsBetter expanded={expandedScore === "plagiarism"} onClick={() => toggle("plagiarism")} />
          <ScoreSpectrum label="Tone Consistency" score={toneScore} interpretation={toneScore === null ? "Not checked" : toneScore >= 90 ? "Consistent" : toneScore >= 70 ? "Minor shifts" : toneScore >= 50 ? "Some issues" : "Inconsistent"} lowLabel="0" highLabel="100" expanded={expandedScore === "tone"} onClick={() => toggle("tone")} />
        </div>

        {/* Plagiarism detail */}
        {expandedScore === "plagiarism" && (
          <DetailPanel title={`Plagiarism — ${plagiarismCheckedTotal} passages checked, ${plagiarismFlagCount} plagiarism${commonKnowledgeCount > 0 ? `, ${commonKnowledgeCount} common knowledge` : ""}`}>
            {plagiarismResults.length === 0 && !plagiarismLoading && (
              <p className="text-xs text-gray-400">No plagiarism check has been run. Enable it in the scan configuration.</p>
            )}
            {plagiarismResults.length > 0 && plagiarismFlagCount === 0 && commonKnowledgeCount === 0 && (
              <p className="text-xs text-green-600 mb-2">No plagiarism detected across {plagiarismCheckedTotal} passages.</p>
            )}
            {/* All results sorted by severity: plagiarism → common_knowledge → quotation → error → coincidence */}
            {(() => {
              const VERDICT_ORDER: Record<string, number> = { plagiarism: 0, common_knowledge: 1, quotation: 2, error: 3, coincidence: 4 };
              const sorted = [...plagiarismResults]
                .filter((r) => r.verdict !== "error" || r.status === "open")
                .sort((a, b) => (VERDICT_ORDER[a.verdict] ?? 5) - (VERDICT_ORDER[b.verdict] ?? 5));

              const nonClean = sorted.filter((r) => r.verdict !== "coincidence");
              const clean = sorted.filter((r) => r.verdict === "coincidence");

              return (
                <>
                  {nonClean.map((r) => (
                    <div key={r.id} className={`rounded-lg border-l-4 p-2.5 mb-2 ${
                      r.verdict === "plagiarism" ? "border-l-red-500 bg-red-50" :
                      r.verdict === "common_knowledge" ? "border-l-yellow-400 bg-yellow-50" :
                      r.verdict === "quotation" ? "border-l-blue-400 bg-blue-50" :
                      "border-l-gray-300 bg-gray-50"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          r.verdict === "plagiarism" ? "bg-red-100 text-red-700" :
                          r.verdict === "common_knowledge" ? "bg-yellow-100 text-yellow-700" :
                          r.verdict === "quotation" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-200 text-gray-600"
                        }`}>
                          {r.verdict === "plagiarism" ? "Plagiarism" :
                           r.verdict === "common_knowledge" ? "Common Knowledge" :
                           r.verdict === "quotation" ? "Quotation" : r.verdict}
                        </span>
                        {r.verdict === "common_knowledge" && (
                          <span className="text-[8px] text-yellow-600 italic">not plagiarism</span>
                        )}
                        {r.confidence != null && (
                          <span className="text-[8px] text-gray-400">{Math.round(r.confidence * 100)}% confidence in verdict</span>
                        )}
                      </div>
                      {/* Contextual explanation per verdict type */}
                      {r.verdict === "plagiarism" && (
                        <p className="text-[9px] text-red-600 mb-1">This closely matches a specific source without attribution.</p>
                      )}
                      {r.verdict === "common_knowledge" && (
                        <p className="text-[9px] text-yellow-600 mb-1">This matches web sources but is widely known factual information — no citation needed.</p>
                      )}
                      <p className="text-[10px] text-gray-700 leading-relaxed italic">&ldquo;{r.passageText.length > 200 ? r.passageText.slice(0, 200) + "..." : r.passageText}&rdquo;</p>
                      {r.explanation && <p className="mt-1 text-[9px] text-gray-500">{r.explanation}</p>}
                      {r.topMatchUrl && (
                        <a href={r.topMatchUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[9px] text-blue-600 hover:underline truncate">
                          {r.topMatchTitle || r.topMatchUrl}
                        </a>
                      )}
                    </div>
                  ))}
                  {/* Clean passages — collapsible */}
                  {clean.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-[9px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                        {clean.length} passage{clean.length !== 1 ? "s" : ""} checked — no matches (click to show)
                      </summary>
                      <div className="mt-1 space-y-1">
                        {clean.map((r) => (
                          <div key={r.id} className="rounded border-l-2 border-l-gray-200 bg-gray-50 p-2">
                            <p className="text-[9px] text-gray-500 italic">&ldquo;{r.passageText.length > 120 ? r.passageText.slice(0, 120) + "..." : r.passageText}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </DetailPanel>
        )}

        {/* Tone Consistency detail */}
        {expandedScore === "tone" && (
          <DetailPanel title={`Tone Consistency${toneScore !== null ? ` — score ${toneScore}/100` : ""}`}>
            {toneScore === null && (
              <p className="text-xs text-gray-400">Not checked yet. Enable Tone Consistency in the scan configuration.</p>
            )}
            {toneScore !== null && (() => {
              // Show tone_inconsistency flags from the flags array
              const toneFlags = flags.filter((f) => f.patternType === "tone_inconsistency");
              if (toneFlags.length === 0) {
                return <p className="text-xs text-green-600">No tone inconsistencies detected. Your document reads consistently.</p>;
              }
              const typeLabels: Record<string, { label: string; color: string }> = {
                tone_shift: { label: "Tone Shift", color: "bg-rose-100 text-rose-700" },
                voice_inconsistency: { label: "Voice", color: "bg-orange-100 text-orange-700" },
                register_change: { label: "Register", color: "bg-amber-100 text-amber-700" },
                contradiction: { label: "Contradiction", color: "bg-red-100 text-red-700" },
                repetition: { label: "Repetition", color: "bg-yellow-100 text-yellow-700" },
              };
              return (
                <div className="space-y-2">
                  {toneFlags.map((f) => {
                    const meta = f.metadata as { issueType?: string; severity?: string; suggestion?: string } | null;
                    const issueType = meta?.issueType ?? "tone_shift";
                    const typeInfo = typeLabels[issueType] ?? { label: issueType, color: "bg-gray-100 text-gray-600" };
                    return (
                      <div key={f.id} className="rounded-lg border-l-4 border-l-rose-400 bg-rose-50 p-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${typeInfo.color}`}>{typeInfo.label}</span>
                          {meta?.severity && <span className={`text-[8px] ${meta.severity === "high" ? "text-red-500" : meta.severity === "medium" ? "text-amber-500" : "text-gray-400"}`}>{meta.severity}</span>}
                        </div>
                        <p className="text-[10px] text-gray-700 italic">&ldquo;{f.flaggedPhrase.length > 150 ? f.flaggedPhrase.slice(0, 150) + "..." : f.flaggedPhrase}&rdquo;</p>
                        <p className="mt-1 text-[9px] text-gray-500">{f.explanation}</p>
                        {meta?.suggestion && <p className="mt-1 text-[9px] text-blue-600 font-medium">Suggestion: {meta.suggestion}</p>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </DetailPanel>
        )}

        {/* Row 4: Spelling + Grammar */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreSpectrum label="Spelling" score={spellingScore} interpretation={spellingScore === null ? "Not checked" : spellingScore >= 95 ? "Clean" : spellingScore >= 80 ? "Minor issues" : spellingScore >= 60 ? "Several errors" : "Many errors"} lowLabel="0" highLabel="100" expanded={expandedScore === "spelling"} onClick={() => toggle("spelling")} />
          <ScoreSpectrum label="Grammar" score={grammarScore} interpretation={grammarScore === null ? "Not checked" : grammarScore >= 95 ? "Clean" : grammarScore >= 80 ? "Minor issues" : grammarScore >= 60 ? "Several issues" : "Many issues"} lowLabel="0" highLabel="100" expanded={expandedScore === "grammar"} onClick={() => toggle("grammar")} />
        </div>

        {/* Spelling detail */}
        {expandedScore === "spelling" && (
          <DetailPanel title={`Spelling${spellingScore !== null ? ` — score ${spellingScore}/100` : ""}`}>
            {spellingScore === null && (
              <p className="text-xs text-gray-400">Not checked yet. Enable Spelling Check in the scan configuration.</p>
            )}
            {spellingScore !== null && spellingScore >= 95 && (
              <p className="text-xs text-green-600">No significant spelling errors detected.</p>
            )}
            {spellingScore !== null && spellingScore < 95 && (
              <p className="text-xs text-gray-500">Spelling errors were found. Go to the Spelling tab to review and fix them.</p>
            )}
          </DetailPanel>
        )}

        {/* Grammar detail */}
        {expandedScore === "grammar" && (
          <DetailPanel title={`Grammar${grammarScore !== null ? ` — score ${grammarScore}/100` : ""}`}>
            {grammarScore === null && (
              <p className="text-xs text-gray-400">Not checked yet. Enable Grammar Check in the scan configuration.</p>
            )}
            {grammarScore !== null && grammarScore >= 95 && (
              <p className="text-xs text-green-600">No significant grammar issues detected.</p>
            )}
            {grammarScore !== null && grammarScore < 95 && (
              <p className="text-xs text-gray-500">Grammar issues were found. Go to the Grammar tab to review and fix them.</p>
            )}
          </DetailPanel>
        )}
      </div>

      {scanning && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="mt-3 text-xs text-gray-500">Analysing your document...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail panel wrapper ────────────────────────────────────────────────

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

// ── Sub-score row for writing quality breakdown ─────────────────────────

function SubScore({ label, score, description }: { label: string; score: number; description: string }) {
  return (
    <div className="py-1.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-medium text-gray-700">{label}</span>
        <span className={`text-xs font-bold ${score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-red-500"}`}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-0.5">
        <div className={`h-full rounded-full ${score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
      </div>
      <p className="text-[9px] text-gray-400">{description}</p>
    </div>
  );
}

// ── Score spectrum bar (clickable) ──────────────────────────────────────

// Deterministic mock of scan-history values per label. Deterministic so the
// sparkline doesn't dance on every render. Real data should replace this
// once we persist historical scan scores.
function mockScanHistory(label: string, current: number): number[] {
  const seed = label.charCodeAt(0) + (label.charCodeAt(1) || 0);
  const hist: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const base = current * (0.6 + 0.4 * t);
    const noise = Math.sin((seed + i * 17) * 0.37) * 7;
    hist.push(Math.max(0, Math.min(100, Math.round(base + noise))));
  }
  hist.push(current);
  return hist;
}

function Sparkline({ history, color, width = 44, height = 16 }: {
  history: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (history.length < 2) return null;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const range = max - min || 1;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * (width - 2) + 1;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = history[history.length - 1];
  const lastY = height - ((last - min) / range) * (height - 2) - 1;

  return (
    <svg width={width} height={height} className="shrink-0 opacity-80" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width - 1} cy={lastY} r={1.75} fill={color} />
    </svg>
  );
}

function ScoreSpectrum({ label, score, interpretation, lowLabel, highLabel, lowerIsBetter, loading, expanded, onClick }: {
  label: string;
  score: number | null;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
  lowerIsBetter?: boolean;
  loading?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const hasScore = score !== null;
  const markerPosition = hasScore ? (lowerIsBetter ? 100 - score : score) : 0;
  const history = hasScore ? mockScanHistory(label, score) : [];

  // Trend colour = same "red/yellow/green" logic as the gauge marker,
  // so the sparkline visually agrees with the current bar position.
  const perf = hasScore ? (lowerIsBetter ? 100 - score : score) : 0;
  const sparkColor = perf >= 67 ? "#10b981" : perf >= 34 ? "#f59e0b" : "#ef4444";

  return (
    <button
      onClick={onClick}
      aria-pressed={expanded}
      className={`w-full text-left rounded-lg border p-3 transition-all duration-200 ${
        expanded
          ? "border-blue-400 bg-blue-50/40 scale-[1.02]"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
      style={
        expanded
          ? {
              boxShadow:
                "0 0 0 2px rgba(59, 130, 246, 0.30), 0 8px 20px -6px rgba(59, 130, 246, 0.25)",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">{label}</span>
          <span className="text-[8px] text-gray-400 italic">{lowerIsBetter ? "lower is better" : "higher is better"}</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />}
          {hasScore ? (
            <>
              <Sparkline history={history} color={sparkColor} />
              <span className="text-xl font-bold text-gray-800 tabular-nums">{score}</span>
            </>
          ) : (
            <span className="text-sm text-gray-300">&mdash;</span>
          )}
        </div>
      </div>

      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{
          background: hasScore
            ? "linear-gradient(to right, #ef4444, #eab308 50%, #22c55e)"
            : "#e5e7eb",
          // Inner glow: subtle top inset shadow for depth + 1px inner highlight
          // so the bar reads as a glossy filled rail rather than a flat stripe.
          boxShadow: hasScore
            ? "inset 0 1px 2px rgba(0, 0, 0, 0.18), inset 0 -1px 1px rgba(255, 255, 255, 0.25)"
            : undefined,
        }}
      >
        {hasScore && (
          <div
            className="absolute top-[-1px] h-[calc(100%+2px)] w-1.5 bg-gray-900 rounded-full"
            style={{
              left: `${markerPosition}%`,
              transform: "translateX(-50%)",
              boxShadow: "0 0 0 1.5px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.25)",
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-gray-400">{lowLabel}</span>
        <span className="text-[10px] text-gray-500">{interpretation}</span>
        <span className="text-[9px] text-gray-400">{highLabel}</span>
      </div>
    </button>
  );
}
