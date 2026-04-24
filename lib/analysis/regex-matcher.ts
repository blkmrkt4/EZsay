import type { LoadedEntry } from "@/lib/library/loader";

export interface RegexMatch {
  entry: LoadedEntry;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
}

/**
 * Finds all regex pattern matches in the given text.
 * Each entry's `value` field is a regex string — compiled case-insensitively.
 */
export function findRegexMatches(
  text: string,
  entries: LoadedEntry[]
): RegexMatch[] {
  const matches: RegexMatch[] = [];

  for (const entry of entries) {
    try {
      const regex = new RegExp(entry.value, "gi");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          entry,
          phraseStart: match.index,
          phraseEnd: match.index + match[0].length,
          flaggedPhrase: match[0],
        });

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } catch {
      // Invalid regex in library entry — skip it, don't crash the scan
      console.warn(
        `Invalid regex in library entry ${entry.id}: ${entry.value}`
      );
    }
  }

  return matches;
}
