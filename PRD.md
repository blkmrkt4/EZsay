# EzSay — Product Requirements Document

**Product name:** EzSay
**Version:** 1.0
**Status:** Pre-launch — feature-complete, deployed to production at `ezsay.byzyb.ai`. Live Stripe payment flow verified; legal pages and security headers added (2026-06-04); custom email SMTP via Resend configured and verified end-to-end (2026-06-05). Outstanding before public launch: enable Supabase RLS, add anonymous-scan cost-abuse controls (OpenRouter spend cap + CAPTCHA), fill real legal details in `lib/legal/meta.ts`, disable `DEV_BYPASS_AUTH` in Vercel, rotate the Resend API key. See §19 checklist.
**Owner:** Robin Hutchinson
**Last updated:** May 9, 2026

*This document is maintained by Claude Code. Any architectural decision, library version, constraint discovered during build, or resolved open question must be updated here immediately — not at the end of the session.*

---

## 1. Product overview

EzSay is a web-based SaaS writing editor that helps users make AI-assisted writing sound authentically human. It is edit-oriented, not generation-oriented — users bring their own documents and EzSay helps them improve them through a guided co-editing interface.

The product is built on the Undetectable Prompting Framework (by The Lean Monk). The framework files live in `lib/prompts/` and are the engine behind every LLM call EzSay makes. Prompts, models, and context are managed through the Activity Binds system in the web admin — not hardcoded.

**Three core differentiators:**

1. Edit-oriented, not generation-oriented. Every competitor is a black box. EzSay is a co-editing environment where the user makes every decision and understands why each change is suggested.
2. It teaches. Every flag carries a category label, a contextual description, and a "Why this matters" explanation. Users learn what AI-pattern writing looks like and stop producing it over time.
3. Six-dimensional analysis. Documents are scored across AI Detectability, AI Artifacts, Writing Quality, Plagiarism, Citations, and Tone Consistency — combined into a single Auditor Score.

---

## 2. Target users

Primary: University students submitting academic essays and coursework.
Secondary: Professional and business writers producing reports, white papers, and client-facing content.
Both served equally from day one. No feature gating by user type at launch.

---

## 3. Business model

- Hard paywall. No free editing. Users upload, scan, see full results — cannot enter the editing panel without a subscription.
- Pricing: Monthly + Annual (annual shown first with discount badge).
- One price for everyone. No student tier at launch.
- Post-payment: full product unlocked, no further gates.
- **Status:** Stripe fully wired in live mode. Checkout, webhook, customer portal, and post-payment reconciliation all in place. Live webhook endpoint at `https://ezsay.byzyb.ai/api/webhooks/stripe` handles 9 events (checkout, subscription lifecycle, invoice success/failure, refunds, customer + payment-method deletion).

---

## 4. Tech stack

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 | Server components, streaming, middleware |
| Language | TypeScript | ^5 | Strict mode |
| Runtime | React | 19.2.4 | |
| Hosting | Vercel | — | Zero-config deploys |
| Database | Supabase (PostgreSQL) | — | Hosted Postgres |
| ORM | Drizzle ORM | 0.45.2 | Type-safe SQL on Supabase Postgres |
| ORM CLI | drizzle-kit | 0.31.10 | Migrations and studio |
| Auth | Supabase Auth (@supabase/ssr) | 0.10.2 | Email/password + Google SSO (Apple deferred post-V1) |
| File storage | Supabase Storage | — | PDFs and .docx uploads |
| Payments | Stripe | 22.0.2 | Live mode wired. Two products (Individual, EaaS) × two intervals (monthly, annual) = 4 price IDs. Webhook handles checkout/subscription/invoice/refund/customer/payment-method events. Customer Portal enabled. |
| DB driver | postgres (postgres.js) | 3.4.9 | Supabase Postgres direct connection |
| Model routing | OpenRouter | — | Multi-model, hidden from users |
| PDF parsing | pdfjs-dist | 5.6.205 | Server-side text extraction |
| DOCX parsing | mammoth | 1.12.0 | Preserves headings and footnotes |
| Web search | Tavily (primary) / DuckDuckGo (fallback) | — | Plagiarism + citation verification. Tavily is the primary search provider in production. If Tavily fails (API error, rate limit, key missing), falls back to DuckDuckGo automatically. |

---

## 5. Architecture

### 5.1 Workspace layout

Single-page desktop application at `/w`. No page navigation — everything accessible from one screen.

```
+------------------------------------------------------------------------------+
| EzSay | [Doc Switcher]                   | Scan | Auditor Score: 82          |
+--+--------+--------------------------+------------------+--------------------+
|  |Library |  Doc Panel               |  Edit Panel      | Choices Panel      |
|N |        |  (full document text,    |  (flags, options,|  (compact choices, |
|A |  w-64  |   sections highlighted)  |   batch reviews) |   skip/reject)     |
|V |        |  flex-[3] min-w-250      |  flex-[5] min-300|  flex-[2.5]        |
|  |        |                          |                  |   min-w-220        |
|R |        |  Green = active section  |  Navigation bar  |                    |
|A |        |  Blue = citation hl      |  Type badge      |                    |
|I |        |                          |  Content+options |                    |
|L |        |                          |  Why this matters|                    |
+--+--------+--------------------------+------------------+--------------------+
| 2,560 words | 12 flags | 22 items to review       | Reset | Save to Files | Save Version |
+------------------------------------------------------------------------------+
```

**Panel collapsing:** Doc, Edit, and Choices collapse to 28px vertical strips with chevron + vertical label + keyboard shortcut badge (D, E, C).

**Keyboard shortcuts:** D = toggle Doc, E = toggle Edit, C = toggle Choices, 1-9 = select option, Enter = confirm, S = skip, R = reject, left/right arrows = navigate items.

### 5.2 Nav rail items

| Icon | Label | Purpose |
|---|---|---|
| Folder | Library | Document list + upload form |
| + | Add New Doc | Opens upload form in Library panel |
| Search | Scan Results | Analysis panel with score spectrums |
| Chart | Analysis | Same as Scan Results |
| Pencil | Edit | Flag editing view |
| Book | Citations | Citation extraction, verification, style conversion |
| Sliders | Style Training | 44 artifact preferences (Remove/Keep/Ask) |
| Flask | Big Test | Multi-model AI detection scoring (debug) |
| Gear | Admin Panel | Link to /admin |

---

## 6. Scan system

### 6.1 Scan configuration dialog

Before every scan, a modal dialog lets the user choose:

**Step 1 -- What to check** (checkboxes, never overridden):
- AI Detection (default: on)
- Writing Quality (default: on)
- AI Artifacts (default: on)
- Plagiarism (default: off)
- Citations (default: off)
- Tone Consistency (default: on)

**Step 2 -- AI Detection depth** (radio buttons):

| Depth | Sensitivity | Library entries loaded |
|---|---|---|
| Surface | Low | ~55 high-severity entries |
| Deep | Medium | ~218 high + medium entries |
| Comprehensive | High | ~250 all entries |

All three depths run the full detection pipeline (exact + regex + semantic). The only difference is how many library entries are loaded. Depth does NOT override category checkboxes.

### 6.2 Scan flow

1. User clicks Scan -> dialog opens -> user picks settings -> confirm
2. Button shows "Scanning..." (blue) -> "Preparing..." (amber) -> "Scanned" (green)
3. Analysis panel shows progress checklist with checkmarks, spinners, and waiting indicators
4. "Start Editing" button disabled until suggestions are ready
5. After viewing results, Scan button grays out until user saves a version

### 6.3 Scan history message

The scan dialog shows context about the previous scan:
- Upgrading depth: green message
- Same depth at max: "Already at maximum depth. This re-scan will check your latest edits."
- Same depth below max: blue suggestion to upgrade
- Downgrading: amber warning

---

## 7. Six score spectrums

The Analysis panel shows six clickable score bars. Each expands to show detail. All bars use the same gradient (red -> yellow -> green, left to right). "Lower is better" or "higher is better" labels on each.

### 7.1 AI Detectability (lower is better, weight: 25%)

Severity-weighted flag density with sigmoid curve. Flags come from exact phrase matching (~250 library entries), regex structural patterns (~23), and semantic analysis (5 implemented analyzers). Severity weights: high = 3x, medium = 1.5x, low = 1x. Formula: `(weightedDensity / (weightedDensity + 5)) * 100` with word count dampener for short documents.

### 7.2 AI Artifacts (lower is better, weight: 12%)

Penalty-based scoring across 44 formatting artifacts. Four indicativeness tiers: definitive AI tells (2x: assistant closers, TL;DR), strong signals (1.5x: emojis, code blocks), moderate (1x: default), weak (0.7x: curly quotes, spacing). Items set to "always_keep" in Style Training are excluded. Score = 100 - sum(penalty * tier).

### 7.3 Writing Quality (higher is better, weight: 10%)

50% Flesch-Kincaid readability + 50% structural quality (paragraph variation, sentence variation, section coherence, lexical diversity). Each sub-score 0-100. Detail panel shows five individual bars.

### 7.4 Plagiarism (lower is better, weight: 30%)

Every paragraph searched via web (DuckDuckGo or Tavily). LLM assesses each match. Only "plagiarism" verdicts count toward score (weighted by confidence). "Common knowledge" shown as informational, clearly labeled "not plagiarism." Detail panel shows all passages sorted by severity, clean passages collapsed.

### 7.5 Citations (higher is better, weight: 15%)

Two-step check: structural validation (formatting errors) + web verification (source exists). 8 styles supported: APA, MLA, Chicago, Harvard, Oxford, Bluebook, OSCOLA, Business. LLM-powered style conversion available.

### 7.6 Tone Consistency (higher is better, weight: 8%)

LLM analysis for tone shifts, voice inconsistencies, register changes, contradictions, and repetition. Creates editable flags with suggestions.

---

## 8. Auditor Score

Composite 0-100 displayed in toolbar header (blue pill). Higher = better document.

**Weights:** Plagiarism 30%, AI Detectability 25%, Citations 15%, AI Artifacts 12%, Writing Quality 10%, Tone Consistency 8%.

**Missing scores** redistribute weight proportionally. **Floor penalties:** heavy plagiarism caps composite at 30; very detectable AI caps at 40.

**Labels:** 90-100 Excellent, 70-89 Good, 50-69 Needs Work, 30-49 Poor, 0-29 Critical.

---

## 9. Unified edit queue

All finding types flow into one sequential queue:

| Order | Type | Badge | Choices |
|---|---|---|---|
| 1st | AI Detection flags | Amber | Option 1/2/3, Edit myself, Stay with original |
| 2nd | Artifact batch | Purple | Remove/Keep/Ask per category, Process/Skip |
| 3rd | Artifact individual | Purple | Replace/Keep/Edit myself |
| 4th | Writing Quality advisories | Blue (Advisory) | Skip, Skip All, Edit |
| 5th | Plagiarism matches | Red | Save Rewrite, Add Citation, Dismiss |

Shared navigation bar across all types. Advisory items don't count toward flag total. Artifact batch persists with processed history until all artifacts resolved.

### 9.2 Suggestion generation (background, after scan)

The scan (`/api/scan`) only **detects** flags — it writes `flags` rows with no options. Replacement options are then generated by an LLM (one call per flag, ~30–60s each). This runs as a **client-orchestrated background loop**, not one long request and not lazily per-flag (reworked 2026-06-09 — previously a single `/api/suggest-all` call generated every flag in one request, which exceeded Vercel's function timeout and left most flags permanently empty behind a perpetual spinner).

How it works now:

- **No new infrastructure.** The browser tab drives generation: `runGenerationLoop` in `app/w/page.tsx` walks the open flags in document order and calls `/api/suggest-all` **one flag per request** (so each invocation is a single LLM call). The deployment is on the **Vercel Hobby plan (60s hard function cap)**, so the sizing is tuned to fit: `maxDuration = 60` on `/api/suggest-all`, `/api/suggest`, and `/api/scan`, and the OpenRouter per-call timeout (`REQUEST_TIMEOUT_MS` in `lib/routing/openrouter.ts`) is **45s** — a slow call aborts and the route returns a clean "failed → Retry" response well inside the 60s cap instead of being hard-killed. (If the plan is later upgraded, the per-request slice size and these timeouts can be raised.) Generation runs while the UI is fully interactive.
- **Generate everything, in order.** All open flags (including tone-inconsistency) get options up front so the user can walk away and return to a prepared document. Options are persisted to `flag_options` as each slice completes and merged into client state immediately (no full reload).
- **Idempotent + auto-resume.** A flag that already has options is never regenerated (guarded both client-side and in `/api/suggest` / `/api/suggest-all`). An effect (re)starts the loop whenever a doc has open flags still missing options — covering both "right after scan" and "reopened a half-generated doc". A `genLoopRef` guard keeps a single loop per tab; closing the tab pauses generation, reopening resumes it. There is intentionally **no server-side queue/cron** — pausing on tab close is an accepted trade-off.
- **Truthful per-flag state.** `flagGenState(flag)` derives `ready` / `generating` / `failed` / `pending` from `flag_options`, `flags.status`, and an in-memory `generatingIds` set. The edit panel shows the right state instead of a blanket spinner. Generation failures now **set `flags.status = 'generation_failed'`** (previously never written) so a flag shows an error + **Retry** instead of spinning forever.
- **Never stuck.** If the user lands on a flag with no options and the loop isn't running, a single `/api/suggest` call generates it on demand (the per-flag path, re-enabled for this fallback + Retry).
- **Status panel.** A persistent status area pinned to the bottom of the Choices panel shows: a **scan checklist** (AI patterns, AI artifacts, spelling, grammar, plagiarism, tone, citations — each with a spinner→✓ as its phase completes), the live **`Creating options for N edits (X of N)`** line with a 2-character scramble ticker, and a **`Ready — you can start editing`** confirmation once flag 1 is prepared.

**Spelling/grammar detection sizing (fixed 2026-07-13, reworked same day to client-driven).** The detectors previously ran **one LLM call per section, serially**, inside the single `/api/scan` request — a 30-section document meant ~60 serial calls, the function was hard-killed at the 60s cap mid-loop, and the client's unguarded `fetch` left the scan checklist spinning forever. Now:

- `lib/analysis/detector-batching.ts` groups sections into **~6k-char batches** (one LLM call each); finding attribution survives batching because both detectors locate findings by searching section text (LLM offsets were never trusted).
- Spelling/grammar moved **out of `/api/scan`** (the client sends them as `false` there) into `/api/scan/detectors` — a client-orchestrated batch loop like suggestion generation: a plan call returns `batchCount`, then one request per batch (`reset: true` on batch 0), each merging findings into `documents.spelling/grammar_results` idempotently and recomputing the score. The in-scan path still exists for backward compatibility (parallel, 3-way concurrent, 40s deadline, partial results).
- **Scan status panel** (Choices panel footer) now shows: an **elapsed timer** ("Scanning… 1:42"), a **Stop button** (sets a flag checked between batches — spelling/grammar/citation-verify loops halt after the current step; stopped phases show a struck-circle "Stopped —" state), and a **live activity ticker**: latest line always visible, expandable to the full timestamped log ("[0:12] Spelling: document split into 4 batches (23 sections)", "[0:19] Spelling: batch 1 of 4 done — 3 issues found", "[1:02] Citations: verified 8 of 21 sources…").
- `handleScan` catches fetch/timeout failures and non-success responses, clears the checklist, and shows an inline error with a **Retry** button instead of hanging.

**Option regeneration.** On any AI Detection flag the user can regenerate an individual numbered option (`FlagOption` → `/api/suggest/regenerate`). Regeneration takes an optional direction — `more_casual`, `more_formal`, `closer_to_original`, or `simpler` — and passes the previously rejected option texts as negative examples so the new suggestion doesn't repeat them. The regenerated option replaces the old one in place. The call honours the user's style preferences and the document's intake tokens. Paywalled (subscription-gated) like the rest of suggest.

### 9.1 Citations bridge

Citations are **never** part of the edit queue (see section 10) and are **not counted in the "items to review" total** — they are a deliberate *final* step, done once all edits are complete. Fixing citations mid-edit is wasted effort because rewrites can move, merge, or remove the surrounding text. But a user who finishes editing without seeing them would sit at 15% of their Auditor Score untouched, so three visible bridges convey the "edits first, citations last" ordering and close the gap (all added 2026-06-08, when citation structural fixes were removed from the queue):

1. **Footer shows citations separately.** From scan completion the bottom-of-screen count reads `N sections · N flags + M citations · P items to review` whenever `M > 0`. The `+ M citations` segment hides when zero, and `P items to review` (= the edit queue) excludes citations entirely.
2. **End-of-queue handoff.** `EditSessionSummary`'s title and warning icon are driven by remaining **edits only** (`hasRemainingEdits` = unresolved flags / spelling / grammar; citations excluded): "Edits Still Need Attention" vs. "Editing Complete". Pending citations always render as a distinct **"Final step: review your citations"** card — muted/grey while edits remain (with "finish the edits above first" copy), amber and prominent once edits are done. The **Go to Citations** button is *disabled* until edits are complete (label: "Citations (M) — finish edits first"), then becomes the primary CTA.
3. **Citations-tab banner.** Opening the Citations tab while edit items remain shows an amber "Citations are best left for last" banner with the remaining edit count and a "Back to editing" link (`setWorkspaceMode('edit')`).

"Citations needing review" mirrors the server score rule at `app/api/citations/route.ts`: a citation counts when its `status === 'open'` AND it has structural flags OR a verification verdict of `unverified` / `wrong_details`. The parent `app/w/page.tsx` fetches `/api/citations?documentId=...` when the doc is active and `hasScanned`, and refetches on `nav` changes into edit/analysis views so the count stays accurate after the user returns from the Citations tab.

---

## 10. Citations page

Collapsible style conversion section with 8 expandable style cards (full name, usage, in-text + reference examples). Citation list with clickable cards that expand to show full paragraph context. Doc panel highlights and scrolls to selected citation. Verification results show per-citation verdicts with source URLs.

**Citations are reviewed only on this page — never in the unified edit queue (section 9).** The architecture is deliberately split: citations have their own `citations` table, their own `/api/citations/*` endpoints, and a distinct action vocabulary (Accept / Edit / Verify / Dismiss — no numbered options). This follows the hard constraint that citation content is locked at the parser layer and never flagged, modified, or scored by the editing engine. Citations still contribute to the Auditor Score via the Citations spectrum (15% weight), but the *workflow* for fixing them is a separate pass from AI / artifact / plagiarism flags.

**Bridge from the edit queue → Citations tab** is documented in section 9.1: the footer count exposes pending citations throughout editing, and the end-of-queue summary surfaces a "Go to Citations" primary action when citations remain unresolved. This closes the discoverability gap that the architectural separation would otherwise create.

**Citation extraction must not over-detect** (now `lib/citations/graph.ts`; moved out of the route 2026-07-13). Two constraints, both added 2026-06-08 after a 23k-char essay reported 309 "citations" (almost all bogus, inflating the edit queue to 309 items vs. ~61 real flags):
1. A reference section is only recognised when a header word (References / Bibliography / Works Cited / Reference List) appears as a **standalone heading** — at the start of a line and immediately followed by a colon, newline, or end-of-text. A passing mention in prose (e.g. a coursework declaration's "…indicated in the bibliography at the end…") must never match and swallow the document.
2. `splitReferenceEntries` only returns lines/parts that pass `looksLikeReferenceEntry` — a plausible publication year (1500–2099) **and** an author-shaped token ("Surname, I.", "et al", or a corporate author like "BBC News (2021)"). This rejects body-text fragments even if the section capture is too greedy. Results are de-duplicated before insertion.

### 10.1 Citation graph — document-wide checks (added 2026-07-13, phase 1 of 4)

The structural check builds a **citation graph** (`lib/citations/graph.ts`) instead of checking entries in isolation. Three object types are extracted and linked: **reference entries**, **in-text citations** (parenthetical `(Gill, 2022)` and narrative `Boyle (2019)`, person and corporate authors), and **quotes** (≥5-word quoted spans with their context sentence). Deterministic, LLM-free reconciliation runs at scan time:

| Finding type | Severity | Meaning |
|---|---|---|
| `no_reference_entry` | error | In-text citation matches nothing in the reference list |
| `year_mismatch` | error | Body year ≠ reference-list year for the same source |
| `author_inconsistent` | warning | In-text names a non-first author of the matched entry |
| `never_cited` | warning | Reference entry never cited in the body |
| `possible_duplicate` | warning | Two entries appear to reference the same source |
| `quote_without_citation` | error | Quote has no citation inside its own sentence |
| `ai_artifact` | error/warning | Entry matches a `citation_artifact` phrase-library pattern |

**Storage:** `citations.entryType` (`reference_entry` / `inline` / `quote`), `linkedCitationId` (inline/quote → entry row), `contextSentence`. Reference entries are always stored; inline/quote rows are stored **only when they carry findings**. Verify-all and style conversion target reference entries only (quotes are never converted). A quote's citation must be inside the quote's own sentence — never a following sentence/paragraph, which would silently cover an uncited quote.

**AI artifacts** (`lib/citations/artifacts.ts`): patterns live in `library_entries` with category `citation_artifact` (seeded by `scripts/seed-citation-artifacts.ts` — dangling "Wikipedia", `(Accessed: [insert date])`, `[insert …]`/`[date]`/`[URL]` placeholders, editor instructions like `[pull live URL …]`, "Various coverage", year-less access dates). Regex artifacts contribute a removal-based suggested fix; suggested corrections strip artifacts first, then apply format fixes. Admin-managed per constraint #8.

**LLM config:** citation prompts/models moved from hardcoded route constants to activity binds — `citation-verify`, `citation-verify-queries`, `citation-convert` (seeded by `scripts/seed-citation-binds.ts`; hardcoded values remain only as last-resort fallbacks when a bind is missing). Fixes the constraint-#7 violation.

**UI:** the Citations page shows a **Document-Wide Findings** section (flagged in-text citations and quotes; actions: Mark Fixed / Dismiss) above the **Reference Entries** list.

### 10.2 Existence verification — field-level diffs (added 2026-07-13, phase 2 of 4)

`lib/citations/verify.ts` replaces the single-query verify. Per reference entry:

1. **Deterministic queries** built from the parsed entry fields (no LLM query-generation step — the `citation-verify-queries` bind exists but is no longer called): exact-title phrase search, author + year + title keywords, author + entry text fallback. Each attacks a different failure mode — the exact-title search is what finds "title exists under a different author" (the Boyle/Humphries case).
2. Results merged across queries (dedupe by URL, best score wins, top 6).
3. **Field-diff assessment** via the `citation-verify` bind (prompt "Citation Verify — Assess (field diff)"): author / year / title / source each checked **independently** (`ok`/`wrong`/`unknown` + correct value), plus a **plausibility** sanity check for internal impossibilities (anachronistic dates etc.). Verdicts: `verified` / `wrong_details` / `fabricated` / `uncertain` (`unverified` is the legacy name for fabricated; both are handled everywhere). All-searches-failed → `uncertain`, zero results across queries → `fabricated` at 0.6 confidence without an LLM call.
4. `verificationFlags` jsonb now stores `fields`, `plausibilityNote`, `queriesUsed` alongside the verdict; the UI renders field chips (✓ Author / ✗ Year → 2005) and the plausibility warning.

**Batch execution (Vercel Hobby 60s cap):** `verify_batch` action verifies up to 4 entries per request (35s wall-clock guard; `reset: true` on the first call clears old verdicts). Both clients — the Citations page "Verify All Sources" button (with progress bar, verdicts streaming in per batch) and the scan-time citation phase in `app/w/page.tsx` — drive the loop until `remaining === 0`. The score is recomputed only when the loop finishes. `verify_all` is an alias for one batch (kept for stale clients). Verified live 2026-07-13: Jewkes 2015 → verified 95%; Gill "Gender and media futures" 2022 → wrong_details (year → 2007, real title "Gender and the Media"); Boyle 2019 → wrong_details (author → Drew Humphries (Ed.), year → 2009, publisher → Northeastern University Press) with exact corrected citation.

### 10.3 Citation audit report (added 2026-07-13, phase 3 of 4)

The Citations page presents results as an audit rather than a flat list (`components/citations/AuditSummary.tsx`, `CorrectedList.tsx`, shared types + bucket logic in `components/citations/types.ts`):

- **Verdict summary** at the top: tiles for ✅ Verified / 🟡 Needs correction / 🔴 Fabricated–wrong source / ⚪ Uncertain / ⏳ Not yet verified, each with counts and the short names of its entries ("Boyle (2019), Gill (2022)…").
- **Audit ordering:** reference entry cards sort most-severe-first (fabricated → needs correction → uncertain → unchecked → verified). Bucket rules in `bucketOf()`: fabricated/legacy-unverified verdict → fabricated; wrong_details verdict or open structural flags → needs correction; resolved entries fall back to their verdict bucket.
- **BEFORE/AFTER cards:** an open entry with a proposed fix (verification's `correctCitation` wins over the structural `correctedText` — `proposedFixOf()`) shows red BEFORE / green AFTER blocks. The primary action is **Accept Fix**, which passes the proposed text through the resolve endpoint — the same explicit-user-action path as always (constraint #3, no silent corrections); Edit pre-fills with the proposed fix.
- **Corrected Reference List** (collapsible, bottom): copy-paste-ready list in the document's original reference order. Final text per entry = accepted/edited `correctedText`, otherwise the original — suggestions the user has NOT accepted appear unchanged with an "unresolved" badge, and the header counts them. Copy-to-clipboard button.

### 10.4 Quote verification (added 2026-07-13, phase 4 of 4)

`lib/citations/quotes.ts` + `fetchPageText` in `lib/search/tavily.ts` (Tavily Extract API → direct-fetch + HTML-strip fallback, 24k-char cap; **a failed fetch is always "uncertain", never "fake"** — paywalls must not read as fabrication).

- **All quotes are stored** at structural-check time (linked to their reference entry via the in-text citation) as the quote-check queue; the UI hides healthy unverified quote rows, and the citations score only counts rows with flags or verdicts.
- **Linked quotes:** fetch the entry's verified `sourceUrl` → local match first (normalized verbatim check, then sliding-window token containment; <0.35 containment → `quote_not_found` without an LLM call) → LLM assessment via the `citation-quote-check` bind returns QUOTE_MATCH (verbatim/near/paraphrase/not_found) and — independently — CONTEXT (faithful/**misrepresented**/unclear) with the source's ACTUAL_ARGUMENT and a faithful SUGGESTED_REWRITE. `contextVerdict: misrepresented` dominates the final verdict: a word-perfect quote used to support a claim the source doesn't make is `quote_misrepresented`.
- **Orphan quotes:** web search for the quote text plus up to 3 proper nouns from its context sentence (bare short quotes match song lyrics; context disambiguates), social/lyrics domains excluded → `quote_source_found` with candidate URL, or `quote_not_found`.
- **Execution:** `verify_quotes` batch action (3/request, same time guard and client loop as `verify_batch`); "Verify Quotes (N)" button on the Citations page — a deliberately separate, user-triggered action since it's the most expensive check. Quote cards show the verdict badge, explanation, "Source actually says", faithful rewrite, and source link.
- Verdicts: `quote_verified` / `quote_near_match` / `quote_not_found` / `quote_misrepresented` / `quote_source_found` / `uncertain`; `quote_not_found` and `quote_misrepresented` count against the citations score.
- Live-tested 2026-07-13 against the Fitz-Gibbon & Walklate Conversation article: genuine sentence → `quote_verified` (verbatim, faithful, 90%); invented "lets serious violence off the hook" quote with inverted claim → `quote_not_found` with actual-argument note; orphan "she was just walking home" with Everard context → `quote_source_found` (news coverage URL).

---

## 11. Style Training

44 formatting artifacts, 7 categories, 3 preferences (Always Remove, Always Keep, Ask Me Each Time). Expandable rows showing what "Remove" does. Integrated with scan: kept items excluded from detection, removed items auto-processed, ask items appear in batch review.

These artifacts are **global** defaults (`style_training` table). A user can override any individual artifact for their own account via `user_artifact_overrides` (per-user `preference` keyed to a `styleTrainingId`, unique per user+artifact, cascade-deleted with the artifact).

### 11.1 Style Preferences (per-user)

A separate, broader preference system that lets each user set explicit style rules that steer both scanning and rewrite generation. Defined in `lib/style-settings/definitions.ts` (single source of truth for UI, defaults, and scan effects); stored in `user_style_preferences` (one row per user per `documentType`; `documentType = null` means universal). Surfaced through `components/style-settings/` and `/api/style-preferences`.

- **Categories:** universal, academic, legal/professional, fiction, marketing, business, punctuation & typography, numbers & dates, capitalisation & lists, page formatting, strictness & voice. Each definition declares which `documentTypes` it applies to, an input type (select/boolean/number/text), a default, and an optional `advanced` flag.
- **Settings panel** (`StyleSettingsPanel`) — searchable, grouped by category, filtered to the active document type. Saves are debounced per preference.
- **Setup wizard** (`StyleWizard`) — guided multi-step first-run flow that walks the highest-priority preferences (`wizardStep` / `wizardPriority`); completion stamped in `wizardCompletedAt`.
- **Style guide upload** (`StyleGuideUpload` → `/api/style-preferences/parse-guide`) — user uploads their own style guide; it is parsed into preference values. URL + parse time stored in `styleGuideFileUrl` / `styleGuideParsedAt`.
- **Artifact overrides UI** (`ArtifactOverrides` → `/api/style-preferences/artifact-overrides`) — per-user keep/remove/ask overrides of the global artifacts described above.
- **Scan & rewrite effect:** each preference declares a `scanEffect` of `prompt_token` (injects a `[BRACKET]` token into prompts), `library_toggle`, or `threshold`. Preferences feed prompt interpolation alongside the document's intake answers (see below).

### 11.2 Document intake

Uploaded documents carry an optional `intake` questionnaire (`documents.intake` jsonb: audience, purpose, AI usage, discipline). `lib/prompts/intake-tokens.ts` (`buildIntakeTokens`) turns these answers — with sensible per-field defaults — into prompt tokens used by suggest / evaluate / regenerate calls so rewrites match the document's stated audience and purpose.

---

## 12. Corruption checker

Validates text after replacements. Catches LLM response markers (CHANGED:, OPTION N:), broken contractions (i', doesn'), orphaned punctuation, markdown in prose. Filters corrupt suggestions before saving. Logs warnings on flag resolution.

---

## 13. Document management

- **Upload:** .pdf, .docx, .txt, or paste. No auto-scan.
- **Versioning:** User-triggered, auto-naming (docname-MonDD-YY.N).
- **Reset to Original:** Restores from rawText, clears all flags/scores.
- **Save to Files:** Dropdown with .txt and .docx export. The .docx includes title heading, detected section headings, 1.5 line spacing, 1-inch margins, and reference section formatting. PDF was considered but rejected — server-side generation produces poor output with broken Unicode and no font embedding; students get better results exporting .docx and using Word/Google Docs "Save as PDF".

---

## 14. Big Test (debug)

5-model AI detection comparison: Mistral Large, Qwen 3.6 Plus, Gemini 2.5 Pro, Grok 4, Cohere Command A. Score direction: 100 = human-written. Full-page view with consensus score and per-model reasoning.

---

## 15. What's implemented

| Feature | Status |
|---|---|
| Workspace (single-page app, 4 collapsible panels) | Done |
| Auth (email + password reset + Google SSO, dev bypass) | Done |
| Document upload, versioning, reset, download | Done |
| Scan engine (3 depths, 6 categories) | Done |
| Scan progress checklist + re-scan gating | Done |
| AI Detectability scoring (severity-weighted, sigmoid) | Done |
| AI Artifacts scoring (44 items, tier-weighted) | Done |
| Writing Quality scoring (Flesch + structural) | Done |
| Plagiarism detection (deterministic paragraph check) | Done |
| Citation extraction, structural check, verification | Done |
| Citation style conversion (8 styles) | Done |
| Tone Consistency analysis (5 issue types) | Done |
| Auditor Score (weighted composite) | Done |
| Unified edit queue (5 item types) | Done |
| Artifact batch processing with history | Done |
| Corruption checker | Done |
| Six clickable score spectrums with detail panels | Done |
| Style Training (44 items, 3 preferences) | Done |
| Style Preferences (per-user wizard, settings panel, style-guide upload, artifact overrides) | Done |
| Document intake questionnaire → prompt tokens | Done |
| Option-level regeneration (direction + negative examples) | Done |
| Big Test (5-model debug) | Done |
| Phrase library (250 entries) | Done |
| Admin: Activity Binds, Libraries, Settings, Log | Done |
| Paywall modal UI | Done |
| Stripe checkout + webhook (live mode) | Done |
| Watch Demo walkthrough (`/demo`, public) | Done |
| Production deployment to `ezsay.byzyb.ai` | Done |

---

## 16. What's next

| Feature | Priority | Notes |
|---|---|---|
| Citations bridge from edit queue | Done | Footer count shows pending citations; end-of-queue summary retitles and surfaces "Go to Citations" primary action when citations remain. Spec in section 9.1 — implemented 2026-04-24 (pending user verification in dev server). |
| Free-scan funnel (anonymous → email gate → claimed reveal) | Done | `/scan` lets anonymous visitors scan via Supabase anonymous sign-in. Scores show immediately; sample flagged sentences gated behind email verification (`updateUser({ email })` magic link). New `free` plan tier in `lib/stripe/plan-limits.ts` caps unsubscribed users at 1 scan / 5,000-word doc / 1 doc storage. Spec in §22 — implemented 2026-04-25. **Requires:** Anonymous Sign-Ins enabled in Supabase Authentication → Providers. |
| Full Stripe integration | Done | Checkout, subscription sync, access gating live as of 2026-05-09. Live webhook at `https://ezsay.byzyb.ai/api/webhooks/stripe`. |
| Enable Supabase Row-Level Security | High — pre-launch blocker | Tables currently unprotected at the DB level — all access control runs through API route guards. Before opening signup to the public, enable RLS on `documents`, `sections`, `flags`, `flag_options`, `citations`, `style_profiles`, `profiles`, `user_style_preferences`, `user_artifact_overrides`, `usage_tracking`, `events`, and any user-scoped table, with policies that restrict reads/writes to `auth.uid() = user_id`. |
| Disable `DEV_BYPASS_AUTH` and remove dev-only UI | High — pre-launch blocker | `DEV_BYPASS_AUTH` is currently `true` locally and not yet flipped to `false` in Vercel production. Dev-only buttons / debug controls are still rendered in some screens. Both must be cleaned up before public launch. References: `lib/supabase/middleware.ts`, `lib/supabase/dev-auth.ts`. |
| PDF export | Rejected | Considered but server-side PDF generation produces poor output (broken Unicode, no font embedding, manual layout). Students can export .docx and use Word/Google Docs "Save as PDF" for better results. |
| Mobile responsive | Medium | Desktop-first |
| Grammar/spelling check | Medium | New scan category |
| Analytics dashboard | Low | Usage stats, score trends |

---

## 17. Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # server-side only — never expose to client
DATABASE_URL=                       # Postgres connection string

# Stripe (live keys in Vercel production, test keys for local dev)
STRIPE_SECRET_KEY=                  # sk_live_... in prod, sk_test_... in dev
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # pk_live_... in prod, pk_test_... in dev
STRIPE_WEBHOOK_SECRET=              # whsec_... — unique per environment
STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID= # price_...
STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID=  # price_...
STRIPE_EAAS_MONTHLY_PRICE_ID=       # price_...
STRIPE_EAAS_ANNUAL_PRICE_ID=        # price_...

# OpenRouter (admin panel value in DB takes precedence at runtime)
OPENROUTER_API_KEY=

# Tavily (primary citation/plagiarism web search; falls back to DuckDuckGo)
TAVILY_API_KEY=

# Dev mode — must be false (or unset) in Vercel production
DEV_BYPASS_AUTH=false
```

---

## 18. Resolved open questions

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | UI metaphor | Desktop application, not website | 2026-04-17 |
| 2 | Panel layout | Four panels with collapsible strips | 2026-04-17 |
| 3 | Scan depth | Three levels controlling sensitivity, not detection methods | 2026-04-21 |
| 4 | Scan categories | Six categories, depth never overrides checkboxes | 2026-04-21 |
| 5 | Plagiarism approach | Deterministic paragraph check, not LLM-selected | 2026-04-20 |
| 6 | Common knowledge | Not counted as plagiarism, shown as informational | 2026-04-21 |
| 7 | Composite score name | "Auditor Score" | 2026-04-22 |
| 8 | Composite weights | Plagiarism 30%, AI 25%, Citations 15%, Artifacts 12%, Quality 10%, Tone 8% | 2026-04-22 |
| 9 | Big Test direction | 100 = human (undetectable) | 2026-04-22 |
| 10 | Citation verification | Web search + LLM, triggered by scan or manual | 2026-04-22 |
| 11 | Auto-scan on upload | Removed -- user clicks Scan when ready | 2026-04-22 |
| 12 | Re-evaluate button | Removed -- redundant with scan + save version flow | 2026-04-22 |
| 13 | Style Training | User-facing, not admin-only. 44 items, 7 categories | 2026-04-18 |
| 14 | Artifact batch persistence | Stays in queue until all artifacts resolved | 2026-04-21 |
| 15 | Writing Quality in edit queue | Advisory flags, skippable, don't count toward total | 2026-04-21 |
| 16 | Production domain | Subdomain on existing portfolio domain — `ezsay.byzyb.ai` — not a new top-level domain | 2026-05-09 |
| 17 | Stripe environment for launch | Live mode from day one. Two products × two intervals; no separate test deployment | 2026-05-09 |

---

## 19. Production deployment

**Live URL:** `https://ezsay.byzyb.ai`

### Hosting

- **Vercel project name:** `ezsay`
- **Domain:** subdomain of `byzyb.ai` (existing personal/portfolio domain). DNS managed at GoDaddy. Single CNAME record `ezsay → cname.vercel-dns.com` routes the subdomain to Vercel; SSL is provisioned automatically by Vercel.
- **Build & deploy:** `git push origin main` triggers a Vercel production deployment automatically. No `vercel.json` — Next.js auto-detection is used. `next.config.ts` declares `pdf-parse` and `@napi-rs/canvas` as `serverExternalPackages`.

### Stripe live-mode configuration

- **Webhook endpoint:** `https://ezsay.byzyb.ai/api/webhooks/stripe`
- **Subscribed events (9):** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`, `customer.deleted`, `payment_method.detached`
- **API version:** `2026-04-22.dahlia` (Stripe account default)
- **Defensive reconciliation:** `app/api/stripe/checkout/success/route.ts` retrieves the session direct from Stripe on the success redirect and syncs the profile row, so paying users are unblocked immediately even if the webhook is delayed. The webhook remains the authoritative source for renewals, cancellations, and `past_due` transitions.
- **Customer Portal:** enabled in Stripe → Settings → Billing → Customer portal. The `/api/stripe/portal` route depends on this.

### Supabase configuration for production

- **Site URL:** `https://ezsay.byzyb.ai`
- **Redirect URLs:** `https://ezsay.byzyb.ai/**`, `https://ezsay.byzyb.ai/auth/callback`, `http://localhost:3000/auth/callback` (kept for local dev).
- **Single project for dev + prod.** Same `DATABASE_URL` used in local `.env.local` and in Vercel production env. No separate prod migration step needed unless we later split.
- **Anonymous Sign-Ins** must remain enabled (Authentication → Providers) — required for the free-scan funnel at `/scan`.

### Google OAuth

Sign-in with Google is mediated by Supabase. Google's OAuth client is configured with Supabase's `*.supabase.co/auth/v1/callback` as the only redirect URI — Google never sees the app's domain — so adding `ezsay.byzyb.ai` to Google Cloud Console is **not required** when changing the app domain. Updating Supabase Redirect URLs is sufficient.

### Pre-public-launch checklist

**Done**

- [x] **End-to-end production payment test** — full signup → upload → scan → paywall → real Stripe card checkout verified working (2026-06-04).
- [x] **Legal pages** — `/terms`, `/privacy`, `/refund` added as static routes (`app/terms`, `app/privacy`, `app/refund`), built on `components/legal/LegalShell.tsx`. Company/contact/jurisdiction details are centralised in `lib/legal/meta.ts` and **still carry scaffold placeholders** (`companyName`, `jurisdiction`, `contactEmail`) that must be filled with real values. Footer links to all three added on the landing and pricing pages. Content is a starting-point scaffold — review (ideally with counsel) before relying on it.
- [x] **Baseline security headers** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` added via `next.config.ts` `headers()`. (Full CSP deferred — needs per-route nonces.)
- [x] **Dev-only UI confirmed prod-safe** — `components/dev/DevTools.tsx` returns `null` and tree-shakes out of prod bundles via the `NODE_ENV` check; `DEV_BYPASS_AUTH` is gated behind `NODE_ENV === "development"` everywhere it is read, so it is inert in Vercel production regardless of the env value. `/api/dev/reset` returns 403 outside development (verified live).
- [x] **API-layer access control audited** — all 43 API routes authenticate and scope every user-data query by `userId` (or join child→parent and check ownership). No IDOR gaps found. Webhook verifies Stripe signatures.
- [x] **Custom email SMTP (Resend)** — Supabase Auth now sends via Resend over SMTP (`smtp.resend.com:465`, user `resend`), sending as `noreply@ezsay.byzyb.ai`. Verified end-to-end on 2026-06-05: real signup confirmation email delivered to the inbox (not spam). DNS for the **`ezsay.byzyb.ai`** subdomain set at GoDaddy — DKIM (`resend._domainkey.ezsay`), SPF + return-path MX (`send.ezsay`); the parent `byzyb.ai` Google Workspace mail is untouched and Resend "receiving" is off (send-only). Supabase email rate limits set to **30/hour** with a **60s** per-user minimum interval. Resend free tier ceiling is 100 emails/day, 3,000/month. **Note:** the Resend API key was pasted in plaintext during setup — rotate it (fresh send-only key → swap into Supabase → delete old). **Caveat:** Resend "Auto configure" deleted the existing `ezsay` web-app DNS record during setup (CNAME-vs-record conflict); it was restored manually (`ezsay` CNAME → Vercel). Prefer manual DNS entry over Auto configure on this zone.

**Outstanding**

- [ ] **Enable Row-Level Security** on all user-scoped tables in Supabase (`documents`, `sections`, `flags`, `flag_options`, `citations`, `plagiarism_results`, `style_profiles`, `usage_tracking`, `profiles`) with `auth.uid() = user_id` policies. App-layer guards are correct and complete today, so this is defence-in-depth — but required before opening public signup.
- [ ] **Disable `DEV_BYPASS_AUTH`** in Vercel production (set to `false` or unset) — hygiene; already inert via the `NODE_ENV` gate.
- [ ] **Fill real legal details** in `lib/legal/meta.ts` (operating entity, jurisdiction/governing law, monitored contact inbox) and review the Terms/Privacy/Refund copy.
- [ ] **Cost-abuse controls on paid-API endpoints** — the free `/api/scan` is deterministic (no LLM spend), but `/scan` mints anonymous Supabase sessions with no friction. As of 2026-06-04 the two paid-API endpoints that previously only checked auth — `/api/plagiarism` (OpenRouter + Tavily) and `/api/tone-consistency` (OpenRouter) — are now behind `requireSubscription` (matching suggest/evaluate/citations/rescore), and tone-consistency now has a 5/min rate limit. **Remaining (dashboard):** set a hard OpenRouter monthly spend cap and enable Supabase CAPTCHA / abuse protection for anonymous sign-ins as defence-in-depth. The in-memory per-`userId` rate limiter (`lib/rate-limit.ts`) is per-instance best-effort; consider Redis/Upstash + IP-based limiting later.

---

## 20. Brand assets

Six SVG files live in `public/brand/` — three variants × black/white pairs. All vector, transparent background.

| File | Dimensions (viewBox) | Aspect | Use |
|---|---|---|---|
| `ezsay-lockup-black.svg` / `-white.svg` | 3135 × 2731 | ~1.15:1 | Wordmark + mark together. Primary brand treatment for landing page, marketing site, auth screens, email headers, social. |
| `ezsay-wordmark-black.svg` / `-white.svg` | 3050 × 1000 | ~3:1 | Wordmark only. In-app header, nav rail top, admin panel chrome — any horizontal slot where "EzSay" needs to read as text. |
| `ezsay-mark-black.svg` / `-white.svg` | 1800 × 1800 | 1:1 | Icon only (no "EzSay" text). Used for favicon and as the brand anchor in the landing page's sticky scroll pill. Square aspect also suits avatars, loading states, and tight UI corners. |

**Colour pairing:** black variant on light backgrounds, white variant on dark backgrounds. No other recolouring — logo ships in two flavours only.

**Reference pattern:** served from `/brand/*.svg` at runtime. Use `next/image` for rasterised contexts (OG images, avatars) and plain `<img>` or inline SVG for in-app chrome where no optimisation is needed.

**Favicon:** the mark serves as the favicon via `app/icon.svg` (Next.js file convention — auto-detected, no metadata wiring needed). The legacy `app/favicon.ico` stays in place as a fallback for browsers that don't accept SVG favicons.

### 20.1 Live placements

| Location | File | Rendered size | File |
|---|---|---|---|
| Landing page nav (top-left) | `ezsay-lockup-black.svg` | `h-16` (64px tall) | `components/landing/LandingNav.tsx` |
| Landing page sticky scroll pill | `ezsay-mark-white.svg` | `h-5 w-5` (20px) | `components/landing/LandingNav.tsx` |
| Workspace header (top-left) | `ezsay-wordmark-black.svg` | `h-5` (20px tall) | `app/w/page.tsx` |
| Browser tab favicon | `ezsay-mark-black.svg` (copied to `app/icon.svg`) | browser-controlled | `app/icon.svg` |

### 20.2 Candidate placements (not yet wired)

- **Auth screens** (`app/(auth)/login/page.tsx`, signup, forgot-password): currently show "EzSay" as plain text above the form. Use lockup at `h-12` — pre-auth territory is marketing-adjacent, so the full treatment fits.
- **Admin panel chrome** (`app/admin/*`): use wordmark for consistency with the workspace.
- **Landing footer**: "EZsay. Your voice, louder." line could lead with a small `h-4` mark.
- **Email templates** (future): lockup in header.
- **Open Graph / social preview image**: lockup on a branded background, 1200×630. Ship as `app/opengraph-image.png` (Next.js file convention).

---

## 22. Free-scan funnel

The `/scan` route is the public, no-signup entry point that proves the product works and captures email at the moment of highest interest. It implements the "give to get" pattern — visible scores immediately, specific flagged sentences only after the visitor verifies an email.

### 22.1 Flow

```
1. Visitor lands on /scan (no auth required — middleware exempts /scan)
2. Page mounts: if no Supabase session, calls supabase.auth.signInAnonymously()
   → visitor gets a real auth session with is_anonymous = true
3. Visitor uploads .pdf/.docx/.txt or pastes text + picks document type
4. POST /api/upload then /api/scan run as the anonymous user
   → server creates document, sections, flags
5. Results screen shows: Auditor Score ring + 6 score spectrums + written summary
   → "What we found" — counts of flags and sections, score commentary
6. Below the summary, an **email gate** appears (only if anonymous + flags exist):
   "We found N specific issues. Enter your email to see exactly which sentences."
7. Submit email → supabase.auth.updateUser({ email },
                    { emailRedirectTo: /auth/callback?redirect=/scan?claimed=1 })
   → Supabase sends verification link
   → Page swaps to "Check your email" state
8. Visitor clicks link in email → routes through /auth/callback (existing
   route, in Supabase's redirect-URL allowlist) → /scan?claimed=1
9. Page mount detects ?claimed=1 + non-anonymous user + stashed documentId
   → fetches the same document, renders sample flagged sentences (up to 2)
   → still shows the Subscribe CTA at the bottom
10. "Scan Another Document" button is removed — free users get one scan
```

### 22.2 Plan tier and cap enforcement

`lib/stripe/plan-limits.ts` defines a `free` tier:

| Limit | Value |
|---|---|
| `monthlyWordLimit` | 5,000 |
| `perDocumentWordLimit` | 5,000 |
| `monthlyScanLimit` | 1 |
| `documentStorageLimit` | 1 |

`resolvePlanSlug` defaults unsubscribed users to `free` (was `individual`). Cap enforcement happens in `/api/upload` and `/api/scan` via `checkLimit`. After the visitor uses their one free scan, attempting another returns 402 "Monthly scan limit reached" — the funnel relies on this server-side cap to push them toward subscription.

### 22.3 Local-storage continuity

The /scan page stashes the active document ID in `localStorage["ezsay_free_scan_doc_id"]` after a successful scan. This lets it:

- Restore the results view on a casual page refresh
- Recover the post-claim state when the visitor returns from the verification email link, even in a new tab

### 22.4 Architectural decisions

| Decision | Choice | Why |
|---|---|---|
| Auth model for anonymous scan | Supabase Anonymous Sign-In | Reuses existing /api/upload + /api/scan endpoints unchanged. The user_id stays the same when the anon user is converted to a permanent user via email update — so the scan stays attached. Alternative (separate `anonymous_documents` table + custom session cookie) would be more code and a data-migration step. |
| Email gating mechanism | `supabase.auth.updateUser({ email })` from the anonymous session | Sends a real verification email. On verification, the user's `is_anonymous` flag flips to `false` while the `user_id` is preserved. No data migration needed. |
| Email redirect path | `/auth/callback?redirect=/scan?claimed=1` | Reuses the existing `/auth/callback` route (already in Supabase's redirect-URL allowlist for the password-reset flow). One config, two flows. |
| Client gate vs server gate | Server-side via `checkLimit` | Don't trust the client. The "1 scan only" rule is enforced by `/api/scan` returning 402 once the count is reached. The UI only mirrors server state. |
| Sample flag count | 2 | Enough to convince ("look, you can see the actual problem"), not enough to give away the value ("subscribe to see the rest + rewrites"). |

### 22.5 Required Supabase configuration

For the funnel to work, **Anonymous Sign-Ins** must be enabled in the Supabase dashboard:
- Authentication → Providers → Anonymous Sign-Ins → toggle ON

Without this, `signInAnonymously()` returns an error and the page surfaces the message "Anonymous sign-ins may be disabled in Supabase…" inline on the scan button.

The `/auth/callback` redirect URL must already be in Authentication → URL Configuration → Redirect URLs (it should be, from the password-reset wiring).

---

## 23. Watch Demo walkthrough

Added 2026-06-09. The **"Watch Demo"** button links to `/demo`, a **public, no-auth, no-subscription** stepped wizard that walks a visitor through the whole product in ~2 minutes before they commit to a scan or signup. It doubles as a how-it-works / what's-new refresher for returning users, so it stays reachable while signed in. Entry points:

- **Landing nav** (`components/landing/LandingNav.tsx`) — both the main row and the floating scroll pill, in **both** the signed-out and signed-in states.
- **Workspace left rail** (`app/w/page.tsx`, bottom utility section next to Admin) — opens in a **new tab** (`target="_blank"`) so an in-progress edit session isn't lost.

### 23.1 Structure

- **Route:** `app/demo/page.tsx` — renders `LandingNav` + `<DemoWizard />`. No gating; not under `(dashboard)`/`/w`.
- **Wizard:** `components/demo/DemoWizard.tsx` — `"use client"`, holds a step index. Progress dots, Back / "Got it" (Next), Exit (→ `/`). Keyboard: `→`/`Enter`/`Space` advance, `←` back, `Esc` exit. Final step CTAs link to `/scan` (free) and `/signup`. Supports a `?step=N` deep-link (1-based) for marketing links.
- **Content:** `components/demo/steps.tsx` — single ordered `STEPS` array (eyebrow, title, body, faux `url`, `visual`, optional `callouts`, optional `caption`). 13 steps: welcome → upload/rename → library → scan & score → workspace tabs → Analysis → Edit three panes → compare options → color legend → Review → Citations → Style Rules → re-evaluate/save + CTA.
- **Annotations:** `components/demo/Callout.tsx` — pulsing dot + label pill positioned by `{x,y}` **percent** of the visual box (so they scale with the fixed 16:10 stage); `CalloutLayer` overlays an array onto a visual.

### 23.2 Drill-down detours (cul-de-sacs)

Some main steps carry an optional **detour** — a short set of deeper sub-screens you can step into and return from, so the main path stays a clean overview while power detail lives one level down. Modeled on `DemoStep.drill = { label, steps: DrillStep[] }` in `steps.tsx`; entering a detour is opt-in via a "Go deeper: …" pill under the nav.

The "tunnel" is shown in the progress bar: the **full main dot row stays visible**, and on any step that has a detour a vertical connector drops from the active dot to a **second, connected row of sub-dots** (one per detour screen — horizontal, since a detour can hold several screens). This branch renders **dimmed as a preview the moment you land on the step** (so the deeper layer is discoverable before you enter — clicking a preview sub-dot drops straight in), then brightens once you're inside: the active step dot turns amber, the current sub-dot widens, and the label reads "Step N · Detail M of K". The nav offers **← Back to tour** + Next/Done (forward past the last sub-screen returns to the main step). Deep-linkable via `?step=N&drill=M` (both 1-based).

Detours shipped:

| Main step | Detour |
|---|---|
| Welcome | "It's not just AI" → the full 8-spectrum dashboard (`DashboardMock focus="overview"`) |
| Library | Document version history (`LibraryVersionsMock`) |
| Analysis | Click a score → AI-detection flags · AI artifacts · writing-quality breakdown · plagiarism close-matches (`DashboardMock focus=…`) |
| Edit panes | Collapse panels via the caret (`PanelCollapseMock`) · edit mark-points on the scroll rail (`EditMarksMock`) |
| Citations | Structural checks + live web verification (`CitationsDetailMock`) |
| Style Rules | Full universal-preferences list (`StyleRulesFullMock`) · document-formatting wizard (`FormattingWizardMock`) |
| Re-evaluate | Scan → Auditor score (`AuditorScanMock`) · live word/char count status bar (`StatusBarMock`) |

### 23.3 Visuals — hybrid, currently all HTML mockups

The plan called for a hybrid of real workspace screenshots + HTML mockups for simpler screens. Shipped state: **all screens are HTML/Tailwind mockups** in `components/demo/mocks/` (`WelcomeMock`, `UploadMock`, `LibraryMock`, `ResultsMock`, `WorkspaceMock`, `AnalysisMock`, `MorphMock`, `ReviewMock`, `CitationsMock`, `StyleRulesMock`, `ShadingLegendMock`). The mocks reuse the app's real color tokens (`SIGNAL_COLORS` / `SIGNAL_BADGE` from `app/w/page.tsx`, pattern colors from `lib/constants.ts`) so the shading legend is truthful. Real captures were deferred because they need an authenticated session with a fully-scanned document + generated options; swapping a screenshot into a workspace step is a one-line `visual:` change in `steps.tsx` (drop the PNG in `public/demo/` and reference it with an `<img>`).
