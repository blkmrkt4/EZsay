/**
 * Simple word-level diff. Returns an array of segments, each marked as
 * "same" or "changed". Used to highlight what changed in replacement options.
 */

interface DiffSegment {
  text: string;
  type: "same" | "changed";
}

export function wordDiff(original: string, replacement: string): DiffSegment[] {
  const origWords = original.split(/(\s+)/);
  const replWords = replacement.split(/(\s+)/);

  // Build a simple LCS table for word-level comparison
  const m = origWords.length;
  const n = replWords.length;

  // For very long texts, use a greedy approach instead of full LCS
  if (m * n > 50000) {
    return greedyDiff(origWords, replWords);
  }

  // Standard LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = origWords[i - 1] === replWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find which words are common
  const commonSet = new Set<number>();
  let i = m, j = n;
  const replCommon = new Set<number>();
  while (i > 0 && j > 0) {
    if (origWords[i - 1] === replWords[j - 1]) {
      replCommon.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Build segments from replacement words
  const segments: DiffSegment[] = [];
  let current: DiffSegment | null = null;

  for (let k = 0; k < replWords.length; k++) {
    const type = replCommon.has(k) ? "same" : "changed";
    if (current && current.type === type) {
      current.text += replWords[k];
    } else {
      if (current) segments.push(current);
      current = { text: replWords[k], type };
    }
  }
  if (current) segments.push(current);

  return segments;
}

function greedyDiff(origWords: string[], replWords: string[]): DiffSegment[] {
  const origSet = new Set(origWords.filter(w => w.trim()));
  const segments: DiffSegment[] = [];
  let current: DiffSegment | null = null;

  for (const word of replWords) {
    const type = origSet.has(word) || !word.trim() ? "same" : "changed";
    if (current && current.type === type) {
      current.text += word;
    } else {
      if (current) segments.push(current);
      current = { text: word, type };
    }
  }
  if (current) segments.push(current);

  return segments;
}
