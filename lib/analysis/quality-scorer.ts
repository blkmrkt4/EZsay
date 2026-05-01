/**
 * Writing Quality Scorer
 *
 * Combines Flesch-Kincaid readability (50%) with structural quality checks (50%)
 * to produce a 0-100 writing quality score. No LLM calls — pure local computation.
 */

import { detectArtifacts } from "./artifact-detector";

export interface QualityResult {
  qualityScore: number;        // 0-100 composite
  fleschScore: number;         // 0-100 Flesch Reading Ease
  paragraphVariation: number;  // 0-100
  sentenceVariation: number;   // 0-100
  sectionCoherence: number;    // 0-100
  lexicalDiversity: number;    // 0-100
  aiArtifactScore: number;     // 0-100 (0 = heavy AI artifacts, 100 = clean)
}

// ── Syllable counting ────────────────────────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 2) return 1;

  // Remove silent e at end
  word = word.replace(/e$/, "");

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g);
  const count = vowelGroups ? vowelGroups.length : 1;

  return Math.max(1, count);
}

// ── Text splitting helpers ───────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z''-]/g, ""))
    .filter((w) => w.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ── Flesch-Kincaid Readability (50% of final score) ──────────────────────

function calculateFlesch(text: string): number {
  const sentences = splitSentences(text);
  const words = splitWords(text);

  if (sentences.length === 0 || words.length === 0) return 50;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  const flesch = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

  return Math.max(0, Math.min(100, Math.round(flesch)));
}

// ── Structural quality sub-scores (each 0-100) ──────────────────────────

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Paragraph length variation — high CV = good (human-like variation).
 * CV > 0.5 = full marks, CV < 0.15 = zero. Linear between.
 */
function scoreParagraphVariation(text: string): number {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length < 3) return 50; // Not enough data

  const lengths = paragraphs.map((p) => splitWords(p).length);
  const cv = coefficientOfVariation(lengths);

  if (cv >= 0.5) return 100;
  if (cv <= 0.15) return 0;
  return Math.round(((cv - 0.15) / 0.35) * 100);
}

/**
 * Sentence length variation — same approach as paragraph variation.
 */
function scoreSentenceVariation(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 5) return 50;

  const lengths = sentences.map((s) => splitWords(s).length);
  const cv = coefficientOfVariation(lengths);

  if (cv >= 0.6) return 100;
  if (cv <= 0.2) return 0;
  return Math.round(((cv - 0.2) / 0.4) * 100);
}

/**
 * Section coherence — Jaccard similarity between adjacent sentences.
 * Moderate coherence (0.05-0.25 average) is ideal.
 * Too low = disjointed, too high = repetitive.
 */
function scoreSectionCoherence(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return 50;

  const wordSets = sentences.map(
    (s) => new Set(splitWords(s).map((w) => w.toLowerCase()))
  );

  let totalJaccard = 0;
  for (let i = 1; i < wordSets.length; i++) {
    const a = wordSets[i - 1];
    const b = wordSets[i];
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    totalJaccard += union.size > 0 ? intersection.size / union.size : 0;
  }

  const avgJaccard = totalJaccard / (wordSets.length - 1);

  // Sweet spot: 0.05-0.25
  if (avgJaccard >= 0.05 && avgJaccard <= 0.25) return 100;
  if (avgJaccard < 0.05) {
    // Too disjointed
    return Math.round((avgJaccard / 0.05) * 100);
  }
  // Too repetitive (>0.25)
  const excess = avgJaccard - 0.25;
  return Math.max(0, Math.round(100 - excess * 300));
}

/**
 * Lexical diversity — type-token ratio over rolling 100-word windows.
 * Higher = more diverse vocabulary = better quality.
 */
function scoreLexicalDiversity(text: string): number {
  const words = splitWords(text).map((w) => w.toLowerCase());
  if (words.length < 20) return 50;

  const windowSize = Math.min(100, words.length);
  let totalTTR = 0;
  let windows = 0;

  for (let i = 0; i <= words.length - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
    const window = words.slice(i, i + windowSize);
    const unique = new Set(window);
    totalTTR += unique.size / window.length;
    windows++;
  }

  const avgTTR = windows > 0 ? totalTTR / windows : 0.5;

  // TTR of 0.7+ = excellent, 0.4 = poor
  if (avgTTR >= 0.7) return 100;
  if (avgTTR <= 0.4) return 0;
  return Math.round(((avgTTR - 0.4) / 0.3) * 100);
}

// ── Main function ────────────────────────────────────────────────────────

export function calculateWritingQuality(text: string, skipArtifactItems?: Set<string>): QualityResult {
  if (!text || text.trim().length < 50) {
    return {
      qualityScore: 50,
      fleschScore: 50,
      paragraphVariation: 50,
      sentenceVariation: 50,
      sectionCoherence: 50,
      lexicalDiversity: 50,
      aiArtifactScore: 100,
    };
  }

  const fleschScore = calculateFlesch(text);
  const paragraphVariation = scoreParagraphVariation(text);
  const sentenceVariation = scoreSentenceVariation(text);
  const sectionCoherence = scoreSectionCoherence(text);
  const lexicalDiversity = scoreLexicalDiversity(text);
  const { score: aiArtifactScore } = detectArtifacts(text, skipArtifactItems);

  // Structural score: average of four sub-scores
  const structuralScore =
    (paragraphVariation + sentenceVariation + sectionCoherence + lexicalDiversity) / 4;

  // Composite: 50% Flesch + 50% structural
  const qualityScore = Math.round(fleschScore * 0.5 + structuralScore * 0.5);

  return {
    qualityScore,
    fleschScore,
    paragraphVariation,
    sentenceVariation,
    sectionCoherence,
    lexicalDiversity,
    aiArtifactScore,
  };
}

/**
 * Returns the N longest sentences from the text, useful as examples
 * for readability advisories.
 */
export function findComplexSentences(text: string, count: number = 3): string[] {
  return splitSentences(text)
    .filter((s) => s.split(/\s+/).length >= 5)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)
    .slice(0, count)
    .map((s) => s.length > 150 ? s.slice(0, 147) + "..." : s);
}
