import type { LoadedEntry } from "@/lib/library/loader";

export interface SemanticFlag {
  entry: LoadedEntry;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
  detail: string;
}

// ── Individual analysis functions ──────────────────────────────────────────

/**
 * Detects synonym rotation: same concept described with different synonyms
 * across the document instead of repeating the natural preferred word.
 */
function detectSynonymRotation(text: string, entry: LoadedEntry): SemanticFlag[] {
  // Synonym clusters — groups of words AI commonly rotates through for the same concept.
  // A human picks one and sticks with it; AI cycles through the thesaurus.
  const clusters: string[][] = [
    ["important", "crucial", "vital", "essential", "critical", "significant", "paramount"],
    ["help", "assist", "aid", "support", "facilitate", "enable"],
    ["use", "utilize", "employ", "leverage", "harness"],
    ["show", "demonstrate", "illustrate", "exhibit", "showcase", "highlight"],
    ["improve", "enhance", "boost", "elevate", "augment", "strengthen", "optimize"],
    ["make", "create", "produce", "generate", "develop", "craft", "establish"],
    ["big", "large", "substantial", "considerable", "significant", "extensive", "vast"],
    ["problem", "issue", "challenge", "obstacle", "difficulty", "hurdle"],
    ["also", "additionally", "furthermore", "moreover", "besides"],
    ["get", "obtain", "acquire", "secure", "gain", "attain", "procure"],
    ["need", "require", "necessitate", "demand"],
    ["change", "transform", "alter", "modify", "shift", "evolve"],
    ["start", "begin", "initiate", "commence", "launch", "embark"],
    ["end", "conclude", "finish", "terminate", "complete", "finalize"],
    ["fast", "rapid", "swift", "quick", "speedy", "expedient"],
    ["complex", "complicated", "intricate", "sophisticated", "multifaceted"],
    ["clear", "evident", "apparent", "obvious", "manifest", "transparent"],
  ];

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  if (words.length < 30) return []; // Too short for meaningful rotation detection

  const flags: SemanticFlag[] = [];

  for (const cluster of clusters) {
    const found: { word: string; index: number }[] = [];
    for (const synonym of cluster) {
      const regex = new RegExp(`\\b${synonym}\\b`, "gi");
      let match;
      while ((match = regex.exec(lower)) !== null) {
        found.push({ word: synonym, index: match.index });
      }
    }

    // Count distinct synonyms used from this cluster
    const distinctWords = new Set(found.map((f) => f.word));
    if (distinctWords.size >= 3 && found.length >= 4) {
      // 3+ different synonyms for the same concept — classic AI rotation
      const sortedByPos = found.sort((a, b) => a.index - b.index);
      const wordList = [...distinctWords].slice(0, 4).join(", ");
      flags.push({
        entry,
        phraseStart: sortedByPos[0].index,
        phraseEnd: sortedByPos[sortedByPos.length - 1].index + sortedByPos[sortedByPos.length - 1].word.length,
        flaggedPhrase: `Synonym rotation: ${wordList}`,
        detail: `${distinctWords.size} different words used for the same concept across ${found.length} instances. Pick one and commit to it — humans repeat their preferred word.`,
      });
      break; // One rotation flag per section
    }
  }

  return flags;
}

/**
 * Detects uniform paragraph lengths — AI writes paragraphs of suspiciously
 * similar length. Human writing has dramatic variation.
 */
function detectUniformParagraphLength(text: string, entry: LoadedEntry): SemanticFlag[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length < 3) return [];

  const lengths = paragraphs.map((p) => p.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
  const cv = Math.sqrt(variance) / avg; // coefficient of variation

  // Low CV means uniform length — flag it
  if (cv < 0.25 && paragraphs.length >= 4) {
    return [
      {
        entry,
        phraseStart: 0,
        phraseEnd: text.length,
        flaggedPhrase: `${paragraphs.length} paragraphs averaging ${Math.round(avg)} words each`,
        detail: `Coefficient of variation: ${cv.toFixed(2)} — paragraphs are too uniform. Mix 1-2 sentence paragraphs with 6+ sentence ones.`,
      },
    ];
  }
  return [];
}

/**
 * Detects clusters of same-length sentences with no variation.
 */
function detectUniformSentenceLength(text: string, entry: LoadedEntry): SemanticFlag[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length < 5) return [];

  const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
  const flags: SemanticFlag[] = [];

  // Check for runs of 3+ sentences within 3 words of each other
  for (let i = 0; i <= lengths.length - 3; i++) {
    const window = lengths.slice(i, i + 3);
    const min = Math.min(...window);
    const max = Math.max(...window);
    if (max - min <= 3) {
      const start = text.indexOf(sentences[i].trim());
      const end = start + sentences.slice(i, i + 3).join("").length;
      flags.push({
        entry,
        phraseStart: Math.max(0, start),
        phraseEnd: Math.min(text.length, end),
        flaggedPhrase: sentences
          .slice(i, i + 3)
          .map((s) => s.trim())
          .join(" "),
        detail: `3 consecutive sentences of similar length (${window.join(", ")} words). Vary between 3-8 word punchers and 25-40+ word sentences.`,
      });
      break; // One flag per section is enough
    }
  }

  return flags;
}

/**
 * Every sentence carries equal weight — no breathing room, restatements,
 * or casual observations.
 */
function detectUniformInformationDensity(text: string, entry: LoadedEntry): SemanticFlag[] {
  // Approximate information density per sentence using content word ratio.
  // Function words (the, is, a, of, etc.) are low-information; the rest carry meaning.
  // Human writing varies dramatically — some sentences are dense arguments,
  // others are casual asides or transitions. AI keeps density uniform.

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length < 5) return [];

  const functionWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "must", "need",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "mine", "yours", "ours", "theirs",
    "this", "that", "these", "those", "who", "whom", "which", "what", "whose",
    "in", "on", "at", "to", "for", "with", "by", "from", "of", "about",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "over", "up", "down", "out", "off",
    "and", "but", "or", "nor", "so", "yet", "if", "then", "than",
    "not", "no", "as", "just", "very", "also", "too", "more", "most",
    "all", "each", "every", "both", "few", "many", "much", "some", "any",
    "other", "such", "only", "own", "same", "here", "there", "when", "where",
  ]);

  const densities = sentences.map((s) => {
    const words = s.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return 0;
    const contentWords = words.filter((w) => !functionWords.has(w.replace(/[^a-z]/g, "")));
    return contentWords.length / words.length;
  });

  // Calculate coefficient of variation of density across sentences
  const avg = densities.reduce((a, b) => a + b, 0) / densities.length;
  if (avg === 0) return [];

  const variance = densities.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / densities.length;
  const cv = Math.sqrt(variance) / avg;

  // Low CV means every sentence has similar density — flag it
  // Human writing typically has CV > 0.20; AI tends toward < 0.15
  if (cv < 0.15 && sentences.length >= 6) {
    return [
      {
        entry,
        phraseStart: 0,
        phraseEnd: text.length,
        flaggedPhrase: `${sentences.length} sentences with uniform information density`,
        detail: `Density variation: ${(cv * 100).toFixed(0)}% — every sentence carries similar weight. Add breathing room: a short aside, a rhetorical question, or a lighter observation between dense points.`,
      },
    ];
  }

  return [];
}

/**
 * Contraction rate below 60% in casual/professional text.
 */
function detectMissingContractions(text: string, entry: LoadedEntry): SemanticFlag[] {
  // Common contractions and their expanded forms
  const expandable = [
    { expanded: /\b(do not)\b/gi, contraction: "don't" },
    { expanded: /\b(does not)\b/gi, contraction: "doesn't" },
    { expanded: /\b(did not)\b/gi, contraction: "didn't" },
    { expanded: /\b(is not)\b/gi, contraction: "isn't" },
    { expanded: /\b(are not)\b/gi, contraction: "aren't" },
    { expanded: /\b(was not)\b/gi, contraction: "wasn't" },
    { expanded: /\b(were not)\b/gi, contraction: "weren't" },
    { expanded: /\b(will not)\b/gi, contraction: "won't" },
    { expanded: /\b(would not)\b/gi, contraction: "wouldn't" },
    { expanded: /\b(could not)\b/gi, contraction: "couldn't" },
    { expanded: /\b(should not)\b/gi, contraction: "shouldn't" },
    { expanded: /\b(cannot)\b/gi, contraction: "can't" },
    { expanded: /\b(it is)\b/gi, contraction: "it's" },
    { expanded: /\b(I am)\b/gi, contraction: "I'm" },
    { expanded: /\b(they are)\b/gi, contraction: "they're" },
    { expanded: /\b(we are)\b/gi, contraction: "we're" },
    { expanded: /\b(you are)\b/gi, contraction: "you're" },
    { expanded: /\b(I have)\b/gi, contraction: "I've" },
    { expanded: /\b(they have)\b/gi, contraction: "they've" },
    { expanded: /\b(we have)\b/gi, contraction: "we've" },
    { expanded: /\b(I will)\b/gi, contraction: "I'll" },
    { expanded: /\b(we will)\b/gi, contraction: "we'll" },
  ];

  let expandedCount = 0;
  let contractionCount = 0;

  for (const { expanded, contraction } of expandable) {
    const expandedMatches = text.match(expanded);
    const contractionRegex = new RegExp(
      contraction.replace("'", "'"),
      "gi"
    );
    const contractionMatches = text.match(contractionRegex);

    expandedCount += expandedMatches?.length ?? 0;
    contractionCount += contractionMatches?.length ?? 0;
  }

  const total = expandedCount + contractionCount;
  if (total < 3) return []; // Not enough data

  const rate = contractionCount / total;
  if (rate < 0.6) {
    return [
      {
        entry,
        phraseStart: 0,
        phraseEnd: text.length,
        flaggedPhrase: `${expandedCount} expanded forms vs ${contractionCount} contractions`,
        detail: `Contraction rate: ${Math.round(rate * 100)}% — target 85%+. Use don't, isn't, won't etc. naturally.`,
      },
    ];
  }

  return [];
}

/**
 * Same transition words repeating in a predictable pattern.
 */
function detectTransitionCycling(text: string, entry: LoadedEntry): SemanticFlag[] {
  const transitions = [
    "however",
    "moreover",
    "furthermore",
    "additionally",
    "consequently",
    "therefore",
    "nevertheless",
    "nonetheless",
    "meanwhile",
    "subsequently",
    "accordingly",
  ];

  const found: { word: string; index: number }[] = [];
  const lower = text.toLowerCase();

  for (const t of transitions) {
    let idx = lower.indexOf(t);
    while (idx !== -1) {
      found.push({ word: t, index: idx });
      idx = lower.indexOf(t, idx + 1);
    }
  }

  if (found.length < 3) return [];

  // Sort by position
  found.sort((a, b) => a.index - b.index);

  // Check for the same transition appearing 3+ times
  const counts: Record<string, number> = {};
  for (const f of found) {
    counts[f.word] = (counts[f.word] || 0) + 1;
  }

  const repeated = Object.entries(counts).filter(([, c]) => c >= 3);
  if (repeated.length > 0) {
    const [word, count] = repeated[0];
    return [
      {
        entry,
        phraseStart: found.find((f) => f.word === word)!.index,
        phraseEnd:
          found.find((f) => f.word === word)!.index + word.length,
        flaggedPhrase: `"${word}" used ${count} times`,
        detail: `Transition "${word}" repeats ${count} times — vary transitions or drop them entirely between some paragraphs.`,
      },
    ];
  }

  return [];
}

/**
 * No tangents, self-corrections, fragments, or opinion hedging across a section.
 */
function detectAbsentPersonalVoice(text: string, entry: LoadedEntry): SemanticFlag[] {
  // Check for markers of personal voice
  const voiceMarkers = [
    /\b(honestly|I mean|basically|look,|the thing is)\b/gi,
    /\b(well,|actually|okay,?)\b/gi,
    /\b(I think|I'd say|in my experience|my guess is)\b/gi,
    /—\s/g, // em-dash asides
    /\.\.\./g, // trailing off
    /\b(but yeah|so yeah|anyway)\b/gi,
  ];

  let markerCount = 0;
  for (const marker of voiceMarkers) {
    const matches = text.match(marker);
    if (matches) markerCount += matches.length;
  }

  // Check for fragments (short sentences under 5 words ending in period)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const fragments = sentences.filter(
    (s) => s.trim().split(/\s+/).length <= 4
  );

  const wordCount = text.split(/\s+/).length;
  if (wordCount < 50) return []; // Too short to judge

  // If a 200+ word section has zero voice markers and zero fragments, flag it
  if (markerCount === 0 && fragments.length === 0 && wordCount >= 100) {
    return [
      {
        entry,
        phraseStart: 0,
        phraseEnd: text.length,
        flaggedPhrase: "No personal voice markers detected in this section",
        detail:
          "Add tangents, self-corrections, fragments, or opinion hedging — human writing has personality.",
      },
    ];
  }

  return [];
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

const analyzers: Record<
  string,
  (text: string, entry: LoadedEntry) => SemanticFlag[]
> = {
  synonym_rotation: detectSynonymRotation,
  uniform_paragraph_length: detectUniformParagraphLength,
  uniform_sentence_length: detectUniformSentenceLength,
  uniform_information_density: detectUniformInformationDensity,
  missing_contractions: detectMissingContractions,
  transition_cycling: detectTransitionCycling,
  absent_personal_voice: detectAbsentPersonalVoice,
};

/**
 * Runs all semantic pattern analyses for the given entries against text.
 */
export function analyzeSemanticPatterns(
  text: string,
  entries: LoadedEntry[]
): SemanticFlag[] {
  const flags: SemanticFlag[] = [];

  for (const entry of entries) {
    const analyzer = analyzers[entry.value];
    if (analyzer) {
      flags.push(...analyzer(text, entry));
    } else {
      console.warn(`No analyzer for semantic pattern: ${entry.value}`);
    }
  }

  return flags;
}
