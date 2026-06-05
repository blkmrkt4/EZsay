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

/**
 * Multi-option alignment. Given several replacement options that are mostly
 * the same as one another (e.g. three full rewrites of one passage that differ
 * in a sentence or two), this finds the text they all share and the points
 * where they diverge.
 *
 * Returns an ordered list of blocks: a "shared" block is text common to every
 * option; a "divergent" block carries one variant string per option (in input
 * order — "" when an option contributes nothing there). The shared skeleton is
 * identical across options, so it can be rendered once (morph view) or dimmed
 * (collapsed view), letting the eye land on just the parts that actually differ
 * between the choices.
 */
export type AlignBlock =
  | { kind: "shared"; text: string }
  | { kind: "divergent"; variants: string[] };

export function alignOptions(options: string[]): AlignBlock[] {
  if (options.length === 0) return [];
  if (options.length === 1) {
    return options[0] ? [{ kind: "shared", text: options[0] }] : [];
  }

  const tokenized = options.map((o) => o.split(/(\s+)/));

  // Common subsequence across ALL options: fold pairwise LCS.
  let common = tokenized[0];
  for (let i = 1; i < tokenized.length && common.length > 0; i++) {
    common = lcsTokens(common, tokenized[i]);
  }

  // Walk every option in lockstep against the common subsequence. Between two
  // consecutive shared tokens, whatever each option emits forms one divergence
  // slot; the shared token itself extends the current shared run.
  const pointers = new Array(options.length).fill(0);
  const blocks: AlignBlock[] = [];
  let sharedRun = "";
  let pending: string[] = new Array(options.length).fill("");

  const flushDivergence = () => {
    if (pending.some((v) => v.length > 0)) {
      if (sharedRun) {
        blocks.push({ kind: "shared", text: sharedRun });
        sharedRun = "";
      }
      blocks.push({ kind: "divergent", variants: pending });
    }
    pending = new Array(options.length).fill("");
  };

  for (let c = 0; c < common.length; c++) {
    const target = common[c];
    for (let oi = 0; oi < options.length; oi++) {
      const toks = tokenized[oi];
      while (pointers[oi] < toks.length && toks[pointers[oi]] !== target) {
        pending[oi] += toks[pointers[oi]];
        pointers[oi]++;
      }
      if (pointers[oi] < toks.length) pointers[oi]++; // consume the shared token
    }
    flushDivergence();
    sharedRun += target;
  }

  // Trailing tokens after the last shared token.
  for (let oi = 0; oi < options.length; oi++) {
    const toks = tokenized[oi];
    while (pointers[oi] < toks.length) {
      pending[oi] += toks[pointers[oi]];
      pointers[oi]++;
    }
  }
  flushDivergence();
  if (sharedRun) blocks.push({ kind: "shared", text: sharedRun });

  return coalesceAlignment(blocks, options.length);
}

/**
 * Merge short shared runs that sit *between* two divergent slots back into the
 * divergence. Coincidental shared words (and the single spaces that the LCS
 * always treats as common) otherwise shatter one differing sentence into a
 * confetti of word-level slots. A shared run only survives as a separator if it
 * carries at least MIN_SHARED_WORDS real words of context.
 */
const MIN_SHARED_WORDS = 4;

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function coalesceAlignment(blocks: AlignBlock[], optionCount: number): AlignBlock[] {
  const merged: AlignBlock[] = [];
  for (const block of blocks) {
    if (
      block.kind === "divergent" &&
      merged.length >= 2 &&
      merged[merged.length - 1].kind === "shared" &&
      merged[merged.length - 2].kind === "divergent" &&
      wordCount((merged[merged.length - 1] as { text: string }).text) < MIN_SHARED_WORDS
    ) {
      const bridge = merged.pop() as { kind: "shared"; text: string };
      const prev = merged.pop() as { kind: "divergent"; variants: string[] };
      const variants = new Array(optionCount)
        .fill("")
        .map((_, k) => prev.variants[k] + bridge.text + block.variants[k]);
      merged.push({ kind: "divergent", variants });
    } else {
      merged.push(block);
    }
  }
  return merged;
}

/** Longest common subsequence of two token arrays, returned as tokens. */
function lcsTokens(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  // Guard against pathological sizes — fall back to intersection-by-identity.
  if (m * n > 4_000_000) {
    const bSet = new Set(b);
    return a.filter((t) => bSet.has(t));
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return out.reverse();
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
