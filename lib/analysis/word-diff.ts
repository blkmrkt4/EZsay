/**
 * Simple word-level diff. Returns an array of segments, each marked as
 * "same" or "changed". Used to highlight what changed in replacement options.
 */

interface DiffSegment {
  text: string;
  type: "same" | "changed";
}

export interface CondensedSegment {
  text: string;
  type: "same" | "changed" | "ellipsis";
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

/**
 * Word diff that collapses long unchanged runs down to a small amount of
 * surrounding context plus an ellipsis. Lets an option card surface only what
 * actually changed relative to the original, instead of the whole paragraph.
 *
 * `contextWords` is the number of unchanged words kept on each side of a change.
 */
export function condensedDiff(
  original: string,
  replacement: string,
  contextWords = 4
): CondensedSegment[] {
  const segments = wordDiff(original, replacement);
  const out: CondensedSegment[] = [];
  // Tokens alternate word/whitespace, so ~2 tokens per word.
  const keep = contextWords * 2;

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];

    if (seg.type === "changed") {
      out.push({ text: seg.text, type: "changed" });
      continue;
    }

    // wordDiff merges consecutive same-type segments, so a "same" segment at
    // idx > 0 always follows a change, and one before the end precedes a change.
    const hasPrevChange = idx > 0;
    const hasNextChange = idx < segments.length - 1;
    const tokens = seg.text.split(/(\s+)/);

    // Short enough to show in full.
    if (tokens.length <= keep * 2 + 1) {
      out.push({ text: seg.text, type: "same" });
      continue;
    }

    if (!hasPrevChange) {
      // Leading run before the first change — keep only the trailing context.
      out.push({ text: "… ", type: "ellipsis" });
      out.push({ text: tokens.slice(-keep).join(""), type: "same" });
    } else if (!hasNextChange) {
      // Trailing run after the last change — keep only the leading context.
      out.push({ text: tokens.slice(0, keep).join(""), type: "same" });
      out.push({ text: " …", type: "ellipsis" });
    } else {
      // Run between two changes — keep context on both sides.
      out.push({ text: tokens.slice(0, keep).join(""), type: "same" });
      out.push({ text: " … ", type: "ellipsis" });
      out.push({ text: tokens.slice(-keep).join(""), type: "same" });
    }
  }

  return out;
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
