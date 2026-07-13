/**
 * Shared client-side types for the citations UI.
 */

export interface FieldCheck {
  status: "ok" | "wrong" | "unknown";
  correct: string | null;
}

export interface VerificationData {
  // Entry verdicts ("unverified" is the legacy name for "fabricated") plus
  // quote verdicts — quote rows store their check result in the same column.
  verdict:
    | "verified" | "wrong_details" | "fabricated" | "unverified" | "uncertain"
    | "quote_verified" | "quote_near_match" | "quote_not_found"
    | "quote_misrepresented" | "quote_source_found";
  confidence: number;
  explanation: string;
  correctCitation?: string | null;
  sourceUrl: string | null;
  fields?: { author: FieldCheck; year: FieldCheck; title: FieldCheck; source: FieldCheck } | null;
  plausibilityNote?: string | null;
  // Quote-check fields (entryType === "quote" rows)
  quoteMatch?: "verbatim" | "near" | "paraphrase" | "not_found" | "unknown";
  contextVerdict?: "faithful" | "misrepresented" | "unclear" | null;
  actualArgument?: string | null;
  suggestedRewrite?: string | null;
  matchedExcerpt?: string | null;
}

/** Display config for quote-check verdicts. */
export const QUOTE_VERDICT_DISPLAY: Record<
  string,
  { label: string; tone: "green" | "amber" | "red" | "blue" | "gray" }
> = {
  quote_verified: { label: "Quote Verified", tone: "green" },
  quote_near_match: { label: "Close Match", tone: "amber" },
  quote_not_found: { label: "Not Found in Source", tone: "red" },
  quote_misrepresented: { label: "Misrepresents Source", tone: "red" },
  quote_source_found: { label: "Possible Source Found", tone: "blue" },
  uncertain: { label: "Couldn't Check", tone: "gray" },
};

export interface Citation {
  id: string;
  rawText: string;
  style: string;
  entryType: "reference_entry" | "inline" | "quote";
  linkedCitationId: string | null;
  contextSentence: string | null;
  structuralFlags: { type: string; message: string; severity: "error" | "warning"; suggestedFix?: string | null }[] | null;
  verificationFlags: VerificationData | null;
  status: string;
  userAction: string | null;
  correctedText: string | null;
}

export function isNotFoundVerdict(v: VerificationData["verdict"] | undefined): boolean {
  return v === "fabricated" || v === "unverified";
}

/** Audit bucket — drives grouping, ordering, and the summary tiles. */
export type AuditBucket = "fabricated" | "needs_correction" | "uncertain" | "verified" | "unchecked";

export function bucketOf(c: Citation): AuditBucket {
  const v = c.verificationFlags?.verdict;
  if (isNotFoundVerdict(v)) return "fabricated";
  if (v === "wrong_details") return "needs_correction";
  if ((c.structuralFlags?.length ?? 0) > 0 && c.status === "open") return "needs_correction";
  if (v === "uncertain") return "uncertain";
  if (v === "verified") return "verified";
  return "unchecked";
}

export const BUCKET_ORDER: AuditBucket[] = [
  "fabricated",
  "needs_correction",
  "uncertain",
  "unchecked",
  "verified",
];

/** The correction the user would apply: verification's beats the format fix. */
export function proposedFixOf(c: Citation): string | null {
  return c.verificationFlags?.correctCitation ?? c.correctedText ?? null;
}

/** Short display name for an entry: "Boyle (2019)" / "The Mirror (2015)". */
export function shortNameOf(rawText: string): string {
  const person = rawText.match(/^([A-Z][A-Za-zÀ-ÿ'’-]+),/);
  const org = rawText.match(/^([A-Z][^(,\n]{1,40}?)\s*\(/);
  const year = rawText.match(/\((\d{4})[a-z]?\)/);
  const name = person?.[1] ?? org?.[1]?.trim() ?? rawText.slice(0, 24);
  return year ? `${name} (${year[1]})` : name;
}
