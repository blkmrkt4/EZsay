import type { LoadedEntry } from "@/lib/library/loader";

export interface ExactMatch {
  entry: LoadedEntry;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
}

/**
 * Finds all exact phrase matches in the given text.
 * Case-insensitive. Matches whole words only (word boundary check).
 */
export function findExactMatches(
  text: string,
  entries: LoadedEntry[]
): ExactMatch[] {
  const matches: ExactMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const entry of entries) {
    const phrase = entry.value.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(phrase, searchFrom);
      if (idx === -1) break;

      // Word boundary check
      const before = idx > 0 ? lowerText[idx - 1] : " ";
      const after =
        idx + phrase.length < lowerText.length
          ? lowerText[idx + phrase.length]
          : " ";

      const isWordBoundaryBefore = /\W/.test(before);
      const isWordBoundaryAfter = /\W/.test(after);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        matches.push({
          entry,
          phraseStart: idx,
          phraseEnd: idx + phrase.length,
          flaggedPhrase: text.slice(idx, idx + phrase.length),
        });
      }

      searchFrom = idx + 1;
    }
  }

  return matches;
}
