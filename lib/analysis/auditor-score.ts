/**
 * Auditor Score — the single composite (0-100, higher = better) shown in the
 * toolbar ring and the free-scan funnel. This module is the ONLY place the
 * weights and fatal-flaw caps live; both call sites import from here.
 *
 * Weighting philosophy (revised 2026-07-15): plagiarism and AI detectability
 * are fatal-flaw categories — high weights AND hard caps. Spelling/grammar
 * are visible errors a marker notices (previously carried NO weight at all).
 * Tone consistency is the lightest signal.
 *
 * All inputs are 0-100 normalized to HIGHER = BETTER; null/undefined = that
 * category wasn't scanned, and its weight redistributes proportionally.
 */

export interface AuditorInputs {
  aiDetectability?: number | null;   // 100 - aiRiskScore
  aiArtifacts?: number | null;       // stored as 100 = clean
  writingQuality?: number | null;
  plagiarism?: number | null;        // 100 - plagiarismScore
  citations?: number | null;
  toneConsistency?: number | null;
  spelling?: number | null;
  grammar?: number | null;
  /** Any OPEN plagiarism result with verdict "plagiarism" — hard cap trigger. */
  hasConfirmedPlagiarismMatch?: boolean;
}

export const AUDITOR_WEIGHTS: Record<keyof Omit<AuditorInputs, "hasConfirmedPlagiarismMatch">, number> = {
  plagiarism: 30,
  aiDetectability: 25,
  citations: 12,
  aiArtifacts: 10,
  writingQuality: 9,
  spelling: 5,
  grammar: 5,
  toneConsistency: 4,
};

// Fatal-flaw caps — a document with a genuine deal-breaker cannot score well
// no matter how clean everything else is.
const CAP_CONFIRMED_PLAGIARISM = 25; // any open confirmed match
const CAP_PLAGIARISM_SCORE = 30;     // plagiarism (normalized) below 50
const CAP_HIGH_AI_RISK = 35;         // AI detectability (normalized) below 40 (risk > 60)

export function computeAuditorScore(inputs: AuditorInputs): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(AUDITOR_WEIGHTS) as [keyof typeof AUDITOR_WEIGHTS, number][]) {
    const value = inputs[key];
    if (value != null) {
      totalWeight += weight;
      weightedSum += value * weight;
    }
  }
  if (totalWeight === 0) return null;

  let composite = weightedSum / totalWeight;

  if (inputs.hasConfirmedPlagiarismMatch) composite = Math.min(composite, CAP_CONFIRMED_PLAGIARISM);
  if (inputs.plagiarism != null && inputs.plagiarism < 50) composite = Math.min(composite, CAP_PLAGIARISM_SCORE);
  if (inputs.aiDetectability != null && inputs.aiDetectability < 40) composite = Math.min(composite, CAP_HIGH_AI_RISK);

  return Math.round(composite);
}
