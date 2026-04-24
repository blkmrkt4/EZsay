export const PATTERN_TYPE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  banned_word: {
    label: "Common AI Phrase",
    color: "bg-red-100 text-red-700 border border-red-200",
    description: "This word or phrase is strongly associated with AI-generated text and is frequently flagged by detection tools.",
  },
  banned_structure: {
    label: "Sentence Structure",
    color: "bg-orange-100 text-orange-700 border border-orange-200",
    description: "This sentence follows a structural pattern commonly produced by language models.",
  },
  synonym_rotation: {
    label: "Synonym Rotation",
    color: "bg-purple-100 text-purple-700 border border-purple-200",
    description: "The same concept is described with different synonyms — a hallmark of AI text. Humans repeat their preferred words.",
  },
  uniform_length: {
    label: "Uniform Length",
    color: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    description: "Sentences or paragraphs are suspiciously similar in length, lacking natural variation.",
  },
  uniform_density: {
    label: "Information Density",
    color: "bg-teal-100 text-teal-700 border border-teal-200",
    description: "Every sentence carries roughly equal weight — no breathing room, restatements, or casual observations.",
  },
  transition_pattern: {
    label: "Transition Pattern",
    color: "bg-indigo-100 text-indigo-700 border border-indigo-200",
    description: "The same transition words repeat in a predictable cycle rather than using organic connectors.",
  },
  tone_inconsistency: {
    label: "Tone Inconsistency",
    color: "bg-rose-100 text-rose-700 border border-rose-200",
    description: "The tone, voice, register, or argument shifts in a way that breaks consistency.",
  },
};

export const PATTERN_BADGE_COLORS: Record<string, string> = {
  banned_word: "bg-red-500",
  banned_structure: "bg-orange-500",
  synonym_rotation: "bg-purple-500",
  uniform_length: "bg-yellow-500",
  uniform_density: "bg-teal-500",
  transition_pattern: "bg-indigo-500",
  tone_inconsistency: "bg-rose-500",
};
