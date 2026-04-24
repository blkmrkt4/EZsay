/**
 * Corruption Checker
 *
 * Detects text corruption from bad LLM response parsing or artifact removal.
 * Runs after any text replacement to catch issues before they reach the user.
 */

export interface CorruptionIssue {
  type: string;
  description: string;
  match: string;
  position: number;
}

/**
 * Check text for corruption artifacts.
 * Returns an array of issues found. Empty array = clean.
 */
export function checkForCorruption(text: string): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];

  // 1. LLM response formatting that leaked through
  const llmLeaks = [
    { pattern: /\bCHANGED:\s*/gi, type: "llm_leak", description: "LLM response marker 'CHANGED:' found in text" },
    { pattern: /\bOPTION\s+\d+\s*:/gi, type: "llm_leak", description: "LLM response marker 'OPTION N:' found in text" },
    { pattern: /\bEXPLANATION:\s*/gi, type: "llm_leak", description: "LLM response marker 'EXPLANATION:' found in text" },
    { pattern: /\bPRINCIPLE:\s*/gi, type: "llm_leak", description: "LLM response marker 'PRINCIPLE:' found in text" },
    { pattern: /\bVERDICT:\s*/gi, type: "llm_leak", description: "LLM response marker 'VERDICT:' found in text" },
    { pattern: /\bCONFIDENCE:\s*[\d.]+/gi, type: "llm_leak", description: "LLM response marker 'CONFIDENCE:' found in text" },
    { pattern: /\bSCORE:\s*\d+/gi, type: "llm_leak", description: "LLM response marker 'SCORE:' found in text" },
    { pattern: /\bREASONING:\s*/gi, type: "llm_leak", description: "LLM response marker 'REASONING:' found in text" },
  ];

  for (const leak of llmLeaks) {
    let match;
    const re = new RegExp(leak.pattern.source, leak.pattern.flags);
    while ((match = re.exec(text)) !== null) {
      issues.push({
        type: leak.type,
        description: leak.description,
        match: match[0],
        position: match.index,
      });
    }
  }

  // 2. Broken contractions — word ending with just an apostrophe (i', does', wha', Norwa')
  const brokenContractions = text.matchAll(/\b(\w{2,})'\s/g);
  for (const match of brokenContractions) {
    const word = match[1];
    // Check if this looks like a truncated contraction (not a possessive like "John's")
    // Common contraction stems that should have more after the apostrophe
    const suspectStems = ["doesn", "don", "isn", "wasn", "weren", "couldn", "wouldn", "shouldn",
      "hasn", "haven", "hadn", "won", "can", "ain", "it", "i", "he", "she", "we", "they",
      "you", "wha", "tha", "who", "there", "here", "let"];
    if (suspectStems.includes(word.toLowerCase())) {
      issues.push({
        type: "broken_contraction",
        description: `Broken contraction: "${word}'" looks truncated (missing letters after apostrophe)`,
        match: match[0],
        position: match.index ?? 0,
      });
    }
  }

  // 3. Orphaned punctuation — standalone punctuation marks with spaces on both sides
  const orphanedPunct = text.matchAll(/\s([—–\-])\s{2,}/g);
  for (const match of orphanedPunct) {
    issues.push({
      type: "orphaned_punctuation",
      description: `Orphaned punctuation: "${match[1]}" with extra spaces`,
      match: match[0],
      position: match.index ?? 0,
    });
  }

  // 4. Double/triple spaces (except after periods which are normal)
  const multiSpaces = text.matchAll(/[^.!?]\s{3,}/g);
  for (const match of multiSpaces) {
    issues.push({
      type: "extra_spaces",
      description: "Multiple consecutive spaces found",
      match: match[0].trim(),
      position: match.index ?? 0,
    });
  }

  // 5. Markdown formatting that shouldn't be in final text
  const markdownLeaks = [
    { pattern: /\*\*[^*]{2,50}\*\*/g, type: "markdown_leak", description: "Bold markdown **text** found in document" },
    { pattern: /`[^`]{2,30}`/g, type: "markdown_leak", description: "Backtick `code` formatting found in document" },
  ];

  for (const md of markdownLeaks) {
    let match;
    const re = new RegExp(md.pattern.source, md.pattern.flags);
    while ((match = re.exec(text)) !== null) {
      issues.push({
        type: md.type,
        description: md.description,
        match: match[0],
        position: match.index,
      });
    }
  }

  return issues;
}

/**
 * Validate that a replacement text doesn't introduce corruption.
 * Returns null if clean, or a description of the problem.
 */
export function validateReplacement(originalText: string, replacementText: string): string | null {
  const issues = checkForCorruption(replacementText);

  // Filter out issues that were already in the original text
  const newIssues = issues.filter((issue) => {
    return !originalText.includes(issue.match);
  });

  if (newIssues.length === 0) return null;

  return newIssues.map((i) => i.description).join("; ");
}
