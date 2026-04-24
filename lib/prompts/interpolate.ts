import { readFileSync } from "fs";
import { join } from "path";

interface InterpolationContext {
  SECTION_TEXT?: string;
  DOCUMENT_TYPE?: string;
  PERSONA?: string;
  VERBAL_TICS?: string;
  ACADEMIC_LEVEL?: string;
  SUBJECT?: string;
  WRITER_DESCRIPTION?: string;
  [key: string]: string | undefined;
}

type DocumentType = "academic" | "professional" | "casual" | "legal";

interface DefaultsFile {
  defaults: Record<DocumentType, Record<string, string | null>>;
  tokens: string[];
}

let cachedDefaults: DefaultsFile | null = null;

function loadDefaults(): DefaultsFile {
  if (cachedDefaults) return cachedDefaults;
  const filePath = join(__dirname, "interpolate-defaults.json");
  const raw = readFileSync(filePath, "utf-8");
  // Skip comment lines (lines starting with #)
  const jsonLines = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  cachedDefaults = JSON.parse(jsonLines) as DefaultsFile;
  return cachedDefaults;
}

/**
 * Fills [BRACKET] tokens in a prompt template.
 *
 * Sources (in priority order):
 * 1. Explicit values in `context`
 * 2. Style profile values (passed via context)
 * 3. Defaults from interpolate-defaults.json for the given document type
 */
export function interpolate(
  template: string,
  documentType: DocumentType,
  context: InterpolationContext = {}
): string {
  const defaults = loadDefaults();
  const docDefaults = defaults.defaults[documentType] ?? {};

  let result = template;

  // Find all [TOKEN] patterns
  const tokenPattern = /\[([A-Z_]+)\]/g;
  result = result.replace(tokenPattern, (match, token: string) => {
    // Priority: explicit context → doc-type defaults → leave the token
    if (context[token] !== undefined) {
      return context[token]!;
    }
    const defaultVal = docDefaults[token];
    if (defaultVal !== null && defaultVal !== undefined) {
      return defaultVal;
    }
    // Leave the token as-is if no value found — makes debugging easier
    return match;
  });

  return result;
}
