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

**Footer actions feedback (2026-07-16).** Two footer defects fixed: (1) the "Download Edited File" format menu was hover-only with a margin gap between button and menu, so moving the pointer toward the menu closed it before it could be clicked — it is now click-toggled (chevron rotates, closes on outside click and after choosing a format); (2) "Save Version" gave no feedback at all — it now runs Saving… → "✓ Version saved" (green) or "Save failed — try again" (red), reverting after 2.5s. The same `saveVersionState` drives the Save Version buttons in the EditSessionSummary card and the citations checklist's "Citations complete" banner, since all three call the same workspace handler.

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

### 6.1 One-click comprehensive scan (dialog removed 2026-07-19)

**There is no scan configuration dialog.** Every scan runs ALL categories (AI Detection, Writing Quality, AI Artifacts, Plagiarism, Citations, Tone Consistency, Spelling, Grammar) at **comprehensive** depth (~250 library entries). The `ScanConfigDialog` component, the Surface/Deep depth choice, and the per-category checkboxes were removed — the config lives as a constant in `app/w/page.tsx` (`scanConfig`). Rationale: a stressed student should never face 8 checkboxes and a jargon depth-picker before getting value; "if we do this right, we don't need a dialogue box."

Cost guards that make always-comprehensive affordable:
- AI detection / rescore are pure code — $0 per scan.
- Suggest options and citation verifications are idempotent (never re-billed).
- Plagiarism re-checks reuse the stored verdict for any paragraph whose text is unchanged since the last pass (`app/api/plagiarism/route.ts`, keyed by exact paragraph text) — only edited paragraphs pay for search + assessment.

### 6.2 Scan flow

1. User clicks **Scan** (or **Re-check** after the first scan) — the scan starts immediately, no dialog
2. A re-check auto-saves a version first (score history keeps its snapshots); scanning is still user-triggered only (constraint #2)
3. Button shows "Scanning..." (blue) -> "Preparing..." (amber) -> "Scanned" (green)
4. Analysis panel shows progress checklist with checkmarks, spinners, and waiting indicators
5. "Start Editing" button disabled until suggestions are ready

### 6.3 Scan history message

Removed with the dialog (2026-07-19) — depth is always comprehensive, so upgrade/downgrade messaging no longer applies. The footer still shows "Last scan" info.

### 6.4 English-variant conformance (added 2026-07-15)

A British academic paper full of American spellings previously passed every check — the spelling prompt said "British vs American — both valid", and the `SPELLING_VARIANT` token built by `buildIntakeTokens` had no consumer in any prompt.

**Resolution order (per document):** `documents.intake.english_variant` (intake answer) → `userStylePreferences.english_variant` / legacy `british_spelling` (Style Rules UI or a parsed style guide) → null = no enforcement. An explicit "american" choice IS a target ("colour" gets flagged); only total absence means the legacy both-are-valid behaviour. Implemented in `lib/style/english-variant.ts` (`resolveEnglishVariant`, `variantToken`, `detectEnglishVariant`).

**Intake:** the questionnaire now has 5 questions for ALL document types — "Which English should this document follow?" (6 variants + No preference) sits between purpose and aiUsage. The answer is pre-selected from the user's saved style preference, else from `detectEnglishVariant` (marker-word counter over the section text: colour/color, -ise/-ize, centre/center, …; returns null under 3 markers or below a 70% majority — can only distinguish british vs american). A hint line shows where the pre-selection came from.

**Edit context for existing documents (added 2026-07-15).** Intake normally runs once, right after upload — documents uploaded before a question existed could never answer it. The library row's kebab menu now has **"Edit context"** (`openDocumentContext` in `app/w/page.tsx`): reopens the intake questionnaire for any document with answers pre-filled from `documents.intake`, and Done re-saves via the same PATCH. This is how older documents get an English variant (or change any answer).

**Style-guide nudges (added 2026-07-15).** Users won't find the Style Rules tab on their own, and the scan can only check what an institution requires if the rules exist. Two non-blocking nudges appear until the user has GONE THROUGH their style guide — that means a deliberate, complete act only: an uploaded/parsed guide (`styleGuideParsedAt`) OR a full wizard run-through after the nudge feature shipped (`wizardCompletedLatest` — max `wizardCompletedAt` across the user's rows — newer than the hardcoded `STYLE_RULES_ENGAGEMENT_EPOCH`, 2026-07-15). Toggling a single rule and pre-nudge wizard answers deliberately do NOT count. The client's `hasStyleRules` refetches on nav changes so completing the wizard/upload clears the nudges immediately:
**(Updated 2026-07-19)** With the intake questionnaire replaced by the assignment brief and the scan dialog removed, the nudge is now a single non-blocking amber line inside the brief card ("Have an institution style guide? Upload it in Style Rules…"); leaving for Style Rules still silently PATCHes the answers given so far. Scanning is never blocked and the primary "Save & run the full scan" button is always available.

**Token rule:** `buildIntakeTokens` now ALWAYS emits `SPELLING_VARIANT` — `executeActivity` leaves unmatched `[PLACEHOLDER]`s literally in the prompt (`lib/routing/openrouter.ts:233-237`), so `variantToken(null)` supplies the neutral "no target variant, both valid" instruction. Any prompt gaining a new token must follow this always-emit rule.

**Consumers:** `[SPELLING_VARIANT]` now appears in the user prompts of `detect-spelling`, `detect-grammar` (seeded via `scripts/seed-grammar-spelling-binds.ts`), and `suggest-rewrite` / `suggest-academic` / `suggest-tone` / `evaluate-rewrite` (appended via `scripts/add-variant-to-prompts.ts`, idempotent, resolves prompts through `activityBinds`). Spelling reports wrong-variant words with `category: "variant"` (new optional field on `SpellingFinding`, blue VARIANT badge in `SpellingView`); grammar uses `ruleCategory: "variant"` and must write corrections in the target variant; tone-consistency (now bind-driven via `loadBind("tone-consistency")` — the constraint-#7 debt was cleared 2026-07-19) gets a target-variant line in its user message and treats unquoted off-variant spelling as a register_change.

**Quote exemption:** quoted material keeps its source's spelling (a verbatim US quote in a British paper stays American). Enforced in every prompt AND by a code backstop: `lib/analysis/quote-ranges.ts` (`findQuotedRanges` — straight doubles, curly doubles, curly single pairs; straight singles skipped for apostrophe ambiguity; 600-char span cap against unbalanced quotes) — the spelling/grammar detectors drop variant-category findings whose span intersects a quoted range.

**Shared prefs loader:** `lib/style/load-prefs.ts` `loadMergedStylePreferences(userId, docType)` extracts the universal+type-specific merge previously inlined in every route; used by the detector routes (`scan`, `scan/detectors`, `spelling/detect`, `grammar/detect`, `tone-consistency`). The suggest/evaluate routes still carry inline copies (cleanup candidate).

---

## 7. Six score spectrums

The Analysis panel shows clickable score bars. Each expands to show detail. All bars use the same gradient (red -> yellow -> green, left to right). **Every displayed score is 0-100 with HIGHER = BETTER — no exceptions, no direction labels (removed 2026-07-17).** Metrics whose underlying stored value runs the other way are flipped at display time: AI Detectability shows `100 - aiRiskScore`, Plagiarism shows `100 - plagiarism match score`; AI Artifacts displays the stored `aiArtifactScore` directly (already 100 = clean — the old display inverted it). Interpretations describe the state in words ("Reads human", "Original", "Clean") so the number and the words always agree.

### 7.1 AI Detectability (displayed as 100 - risk, weight: 25%)

Severity-weighted flag density with sigmoid curve. Flags come from exact phrase matching (~250 library entries), regex structural patterns (~23), and semantic analysis (5 implemented analyzers). Severity weights: high = 3x, medium = 1.5x, low = 1x. Formula: `(weightedDensity / (weightedDensity + 5)) * 100` with word count dampener for short documents.

### 7.2 AI Artifacts (displayed as stored score, 100 = clean, weight: 10%)

Penalty-based scoring across 44 formatting artifacts. Four indicativeness tiers: definitive AI tells (2x: assistant closers, TL;DR), strong signals (1.5x: emojis, code blocks), moderate (1x: default), weak (0.7x: curly quotes, spacing). Items set to "always_keep" in Style Training are excluded. Score = 100 - sum(penalty * tier).

### 7.3 Writing Quality (weight: 9%)

50% Flesch-Kincaid readability + 50% structural quality (paragraph variation, sentence variation, section coherence, lexical diversity). Each sub-score 0-100. Detail panel shows five individual bars.

### 7.4 Plagiarism (displayed as 100 - match score, weight: 30%)

Every paragraph searched via web (DuckDuckGo or Tavily). LLM assesses each match. Only "plagiarism" verdicts count toward score (weighted by confidence). "Common knowledge" shown as informational, clearly labeled "not plagiarism." Detail panel shows all passages sorted by severity, clean passages collapsed.

**Cited paraphrase is never flagged (added 2026-07-13).** A `cited` verdict marks passages that attribute their ideas with an in-text citation and paraphrase legitimately — proper academic practice, shown as informational ("Properly Cited"), never in the edit queue. The assess prompt requires `close_match` to point at actual near-verbatim wording from an **unattributed** source — "mirrors standard academic discourse" is explicitly insufficient — and the route detects the passage's own in-text citations (parenthetical + narrative) and lists them in the assess message so the model cannot miss the attribution. Added after cited passages (Christie 1986, Tuchman 1978, Fitz-Gibbon 2019 paraphrases) were flagged "Close Match — Consider Rephrasing", which would coach users into weakening correct citations.

**Doc-panel follow for plagiarism items (fixed 2026-07-13):** the document panel's violet highlight, auto-scroll, and heatmap ticks previously keyed off AI-detection flags only — reviewing a plagiarism queue item left the doc panel unaligned and (since `close_match` produced no tick) the heatmap empty. Plagiarism items now highlight their passage in violet, scroll the doc panel to it, and both actionable verdicts produce heatmap ticks.

### 7.5 Citations (weight: 12%)

Two-step check: structural validation (formatting errors) + web verification (source exists). 8 styles supported: APA, MLA, Chicago, Harvard, Oxford, Bluebook, OSCOLA, Business. LLM-powered style conversion available.

### 7.6 Tone Consistency (weight: 4%)

LLM analysis for tone shifts, voice inconsistencies, register changes, contradictions, and repetition. Creates editable flags with suggestions.

---

## 8. Auditor Score

Composite 0-100 displayed in toolbar header (blue pill). Higher = better document. Weights and caps live in ONE place — `lib/analysis/auditor-score.ts` (`computeAuditorScore`) — shared by the workspace (`objectiveAuditorScore` in `app/w/page.tsx`) and the free-scan funnel (`app/scan/page.tsx`).

**Weights (revised 2026-07-15):** Plagiarism 30%, AI Detectability 25%, Citations 12%, AI Artifacts 10%, Writing Quality 9%, Spelling 5%, Grammar 5%, Tone Consistency 4%. (Previously spelling and grammar carried NO weight and tone carried 8% — inverted from what a marker cares about. Plagiarism and AI detectability are the fatal-flaw categories: top weights AND hard caps.)

**Missing scores** redistribute weight proportionally. **Fatal-flaw caps:** any OPEN confirmed plagiarism match caps the composite at 25 (resolving/dismissing the match lifts the cap); plagiarism score (normalized) below 50 caps at 30; AI risk above 60 caps at 35 (was: risk above 70 → cap 40).

**Labels:** 90-100 Excellent, 70-89 Good, 50-69 Needs Work, 30-49 Poor, 0-29 Critical.

---

## 9. Unified edit queue

All finding types flow into one sequential queue:

| Order | Type | Badge | Choices |
|---|---|---|---|
| 1st | AI Detection flags | Amber | Option 1/2/3, Edit myself, Stay with original |
| 2nd | Artifact batch | Purple | Remove/Keep/Ask per category, Process/Skip |
| 3rd | Artifact individual | Purple | Replace/Keep/Edit myself |
| 4th | Writing Quality advisories | Blue (Advisory) | Skip, Skip All, Edit (only when the advisory has example sentences) |
| 5th | Plagiarism matches | Red/Orange ("Plagiarism: Close Match") | Save Rewrite, Add Citation (→ confirmation + Continue), Dismiss |

Shared navigation bar across all types. Advisory items don't count toward flag total. Artifact batch persists with processed history until all artifacts resolved.

**Artifact batch defaults to Remove (2026-07-15).** Every artifact type in the batch chooser defaults to **Remove** (was "Ask"), and "Process Choices" resolves an effective choice for every finding — untouched items are removed (previously untouched items were silently skipped, so Process Choices often did nothing). A blue banner states "All artifact types are set to Remove — set preferences in Style Rules if you don't want it this way", and the scan-config dialog's notice says the same (its "Set preferences" button now opens Style Rules). Items the user marked always-keep never reach the batch in the first place.

**Corruption root cause + resolve rewrite (2026-07-17).** A real document was corrupted (paragraphs pasted over themselves up to 6x, mid-word splices like "naturaOne of…", tail duplicates like "2019).2019)."). Root cause: `flags/resolve` spliced replacement text at the flag's SCAN-TIME offsets with no verification — while generated options are FULL-SECTION rewrites (the suggest prompts only interpolate `[SECTION_TEXT]`; they never use `[FLAGGED_PHRASE]`) and both editors prefill manual edits with the whole section. Splicing a full-paragraph rewrite into a narrow/stale span duplicated everything around it, and each accept in a section shifted every other flag's offsets further (nothing ever re-anchors `flags.phraseStart/End`; the old `validateReplacement` call only console.warned and can't detect duplication anyway). Fix: non-artifact accepts replace the whole section; artifact accepts are span-scoped with verify + search re-anchor and a 409 refusal when the text is gone; corruption check is blocking; tiny-replacement guard; full-section accepts auto-skip the section's other open content flags (returned as `autoSkippedSiblings`, counted into the session counter). Recovery for corrupted docs: "Reset to Original" re-parses `rawText`, which no edit path ever mutates.

**Corruption hardening sweep (2026-07-18).** Full audit of every text-write path after the corruption incident; fixes shipped:
- *Idempotency:* `flags/resolve` refuses flags that aren't open/generation_failed (409 `already_resolved`) — re-accepting an auto-skipped sibling could otherwise overwrite the fresh rewrite with a stale full-section option. Bare accepts (no option, no manual text) are refused too.
- *Optimistic concurrency:* EVERY `sections.currentText` write is now conditional — `WHERE currentText = <text as read>` (`flags/resolve`, `sections/update`, `spelling/bulk-fix`, `grammar/bulk-fix`, `artifacts/bulk-remove`, `plagiarism/resolve`, all four citations writes). A concurrent writer makes the write a no-op: single-target routes return 409 `stale_section`, bulk loops skip that section. Rule for all future code: **never write section text unconditionally.**
- *Client in-flight locks:* `handleFlagResolved` (covers double-click, Enter key-repeat, navigate-then-accept), artifact Process Choices (busy state + response check — failures no longer recorded as processed), citations resolve/remove-entry.
- *Blocking validator recalibrated:* `validateReplacementBlocking` (corruption-checker) only refuses shapes ~impossible in prose — line-anchored LLM markers, code fences, `**bold**`, CONFIDENCE-with-number. Mid-sentence "the verdict: guilty" no longer blocks an accept. The truncation guard applies to options only (manual condensing is legitimate).
- *Citations silent-drop fixed:* resolve applies the text change FIRST and returns 409 `stale_citation` if the citation text is gone — previously the row was marked resolved before checking, silently dropping the fix. Legacy `/edit` reloads after accepts so stale sections/siblings aren't displayed.
- Known accepted trade-offs: citation `replaceAll` updates every occurrence of an identical citation string (correct for format fixes); `locateSpan` nearest-occurrence on 1-char artifact phrases can pick an equivalent adjacent instance (replacement identical, cosmetic); accepting a pre-existing generated option after hand-editing the same section replaces the section with the option as displayed (WYSIWYG).

**No-op spelling findings filtered (2026-07-17).** The LLM spelling pass sometimes "flags" a word and returns the identical string as the correction (over-triggering on the variant instruction for words already in the target variant), and sometimes flags punctuation/number tokens ("2019)."). Three-level fix: the detector drops findings whose word and correction are identical after NFC + zero-width normalization, and findings with no letters; the edit-queue build filters stored no-ops from `spellingResults`/`grammarResults` (documents scanned before the guard still carry them); the seeded detect-spelling prompt forbids identical corrections and non-word tokens.

**Stable session counter (2026-07-15).** Resolved items leave the queue, which used to RE-NUMBER the position display after every fix ("1 of 6" → "1 of 5"). A `resolvedThisSession` counter (reset on document switch and on each new scan) is added to both the displayed position and total, so fixing item 3 of 17 advances to "4 of 17". Increments: every flag resolution, plagiarism resolve/continue, a fully-applied spelling/grammar batch, and Skip All Writing Quality (counts all advisory items it removes). The total can still legitimately grow mid-session (plagiarism results loading, artifact re-detection, advisories appearing) — that's honest; it just never shrinks from resolving.

**Queue advance-on-resolve rule (fixed 2026-07-14).** Resolving an item (flag accepted/rejected/skipped, plagiarism resolved, batch fully applied) removes it from the queue and the next item slides into the same index — so resolve handlers must NOT increment `selectedFlagIdx` (previously they did, skipping one item per resolution and eventually stranding the user on the summary screen with items still pending). Increment only when the item survives (e.g. a partially-applied spelling/grammar batch, the artifact batch which persists with its processed history). A clamp effect caps `selectedFlagIdx` at `editQueue.length` whenever the queue shrinks.

**Writing Quality "Edit" = inline sentence editor (added 2026-07-14).** Advisories are document-wide scores, so there is no flag row or passage span to resolve. "Edit" (shown only when the advisory carries example sentences, e.g. Readability's complex sentences) switches the advisory card to edit mode: one textarea per example sentence, each with its own Save. Save calls **`POST /api/sections/update`** `{ sectionId, originalSentence, replacementText }` — auth + ownership checked, locked (citation) sections refused, first occurrence replaced (the sentence splitter strips terminal punctuation, so the route drops the original's trailing period when the replacement supplies its own). The user's replacement is applied verbatim, never sanitized. After each save the document reloads, so the advisory score/examples recompute live; `findComplexSentences` now returns full untruncated sentences (truncation happens at display time) because edit mode needs them verbatim for find-and-replace.

**Plagiarism item presentation + Add Citation confirmation (reworked 2026-07-14).** The badge now leads with the concern: "Plagiarism: Close Match" (+ inline guidance "Consider rephrasing or add a citation"); the long LLM explanation is collapsed behind an ⓘ toggle; the "Matching source" box renders as a red alert. `/api/plagiarism/resolve` responses are now checked: failures (e.g. passage not found after earlier edits) show an inline error and keep the item on screen instead of silently advancing. A successful **Add Citation** holds the item with a green "✓ Citation added: (Source, n.d.)" confirmation showing the cited passage, and a single **Continue** choice releases it — previously the citation was inserted but the UI jumped to the next flag with zero feedback.

### 9.2 Suggestion generation (background, after scan)

The scan (`/api/scan`) only **detects** flags — it writes `flags` rows with no options. Replacement options are then generated by an LLM (one call per flag, ~30–60s each). This runs as a **client-orchestrated background loop**, not one long request and not lazily per-flag (reworked 2026-06-09 — previously a single `/api/suggest-all` call generated every flag in one request, which exceeded Vercel's function timeout and left most flags permanently empty behind a perpetual spinner).

How it works now:

- **No new infrastructure.** The browser tab drives generation: `runGenerationLoop` in `app/w/page.tsx` walks the open flags in document order and calls `/api/suggest-all` **one flag per request** (so each invocation is a single LLM call). The deployment is on the **Vercel Hobby plan (60s hard function cap)**, so the sizing is tuned to fit: `maxDuration = 60` on `/api/suggest-all`, `/api/suggest`, and `/api/scan`, and the OpenRouter per-call timeout (`REQUEST_TIMEOUT_MS` in `lib/routing/openrouter.ts`) is **45s** — a slow call aborts and the route returns a clean "failed → Retry" response well inside the 60s cap instead of being hard-killed. (If the plan is later upgraded, the per-request slice size and these timeouts can be raised.) Generation runs while the UI is fully interactive.
- **Generate everything, in order.** All open flags (including tone-inconsistency) get options up front so the user can walk away and return to a prepared document. Options are persisted to `flag_options` as each slice completes and merged into client state immediately (no full reload).
- **Idempotent + auto-resume.** A flag that already has options is never regenerated (guarded both client-side and in `/api/suggest` / `/api/suggest-all`). An effect (re)starts the loop whenever a doc has open flags still missing options — covering both "right after scan" and "reopened a half-generated doc". A `genLoopRef` guard keeps a single loop per tab; closing the tab pauses generation, reopening resumes it. There is intentionally **no server-side queue/cron** — pausing on tab close is an accepted trade-off.
- **Truthful per-flag state.** `flagGenState(flag)` derives `ready` / `generating` / `failed` / `pending` from `flag_options`, `flags.status`, and an in-memory `generatingIds` set. The edit panel shows the right state instead of a blanket spinner. Generation failures now **set `flags.status = 'generation_failed'`** (previously never written) so a flag shows an error + **Retry** instead of spinning forever.
- **Never stuck.** If the user lands on a flag with no options and the loop isn't running, a single `/api/suggest` call generates it on demand (the per-flag path, re-enabled for this fallback + Retry).
- **Status panel.** A persistent status area pinned to the bottom of the Choices panel shows: a **scan checklist** (AI patterns, AI artifacts, spelling, grammar, plagiarism, tone, citations — each with a spinner→✓ as its phase completes), the live **`Creating options for N edits (X of N)`** line with a 2-character scramble ticker, and a **`Ready — you can start editing`** confirmation once flag 1 is prepared.
- **Auto-enter first edit (2026-07-15).** The moment the first edit is prepared (the "Ready" line), the workspace switches to the Edit view at item 1 automatically — but only if the user is still sitting on the Analysis view; it never yanks them out of citations/review/etc. Fires once per generation run (re-arms when a fresh run starts from zero).

**Spelling/grammar detection sizing (fixed 2026-07-13, reworked same day to client-driven).** The detectors previously ran **one LLM call per section, serially**, inside the single `/api/scan` request — a 30-section document meant ~60 serial calls, the function was hard-killed at the 60s cap mid-loop, and the client's unguarded `fetch` left the scan checklist spinning forever. Now:

- `lib/analysis/detector-batching.ts` groups sections into **~6k-char batches** (one LLM call each); finding attribution survives batching because both detectors locate findings by searching section text (LLM offsets were never trusted).
- Spelling/grammar moved **out of `/api/scan`** (the client sends them as `false` there) into `/api/scan/detectors` — a client-orchestrated batch loop like suggestion generation: a plan call returns `batchCount`, then one request per batch (`reset: true` on batch 0), each merging findings into `documents.spelling/grammar_results` idempotently and recomputing the score. The in-scan path still exists for backward compatibility (parallel, 3-way concurrent, 40s deadline, partial results).
- **Scan status panel** (Choices panel footer) now shows: an **elapsed timer** ("Scanning… 1:42"), a **Stop button** (sets a flag checked between batches — spelling/grammar/citation-verify loops halt after the current step; stopped phases show a struck-circle "Stopped —" state), and a **live activity ticker**: latest line always visible, expandable to the full timestamped log ("[0:12] Spelling: document split into 4 batches (23 sections)", "[0:19] Spelling: batch 1 of 4 done — 3 issues found", "[1:02] Citations: verified 8 of 21 sources…").
- `handleScan` catches fetch/timeout failures and non-success responses, clears the checklist, and shows an inline error with a **Retry** button instead of hanging.

**Generated options are artifact-sanitized (added 2026-07-13).** LLM-generated replacement options habitually contain typographic AI artifacts (em dashes, curly quotes, unicode ellipses, markdown markers) — accepting one re-introduced the exact patterns EzSay removes. `lib/analysis/sanitize-generated.ts` cleans every option before it is stored (`/api/suggest-all`, `/api/suggest`, `/api/suggest/regenerate`), reusing the artifact detector + the bulk-remove replacement strategies, restricted to mechanically-safe items, plus a markdown pass (detector thresholds are document-tuned; in a short option even one `**` is an artifact). Items the user prefers to KEEP (style training / per-user overrides via `loadArtifactKeepSet`) are never sanitized. User-written text is NEVER sanitized — machine output only.

**Final artifact sweep (added 2026-07-13).** `artifactFindings` recomputes live from the current text, so artifacts introduced mid-session are always detected — but the artifact batch sits early in the queue and nothing sent the user back. The end-of-queue `EditSessionSummary` now shows a "Final sweep: N AI artifacts in the document" card (count = live findings minus items the user chose to keep or reviews individually) with a **Review Artifacts** button that jumps the queue back to the artifact batch; the count also holds `hasRemainingEdits` true, gating the citations CTA until the document is clean.

**Artifact sweep fixes (2026-07-14).**
- The "Double spaces after periods" rule is now **spaces/tabs only** (`/\.[ \t]{2,}/`, was `\s{2,}`). The old rule matched `".\n\n"` at every paragraph boundary of the client's `"\n\n"`-joined `fullDocText`, producing one phantom instance per paragraph that per-section bulk-remove could never remove — so "Review Artifacts (39)" never cleared no matter how often the user processed it.
- The client-side final sweep now passes the user's **always-keep set** (fetched from `/api/style-preferences/artifact-overrides`) into `detectArtifacts`, matching the scan endpoint — previously a user who kept em dashes still saw them re-flagged at the end of the queue.
- **Positive confirmation:** when the sweep count reaches 0 after processing, `EditSessionSummary` shows a green "✓ All AI artifacts cleaned" card and the artifact batch chooser shows "✓ All artifact types processed" above its PROCESSED history — previously nothing told the user their choices had actually been applied.

**Grammar corrections never introduce typographic artifacts (2026-07-14).** The LLM grammar detector suggested "fixes" like spaced-hyphen → em dash, directly contradicting the artifact sweep (which replaces em dashes with spaced hyphens). `detectGrammarErrors` now sanitizes every `correctedText` through `sanitizeGeneratedText` (honouring the user's always-keep set via the new `keepItems` context option, wired in `/api/scan`, `/api/scan/detectors`, `/api/grammar/detect`) and **drops findings** whose correction is identical to the original after sanitizing — those were purely stylistic typography, not grammar errors. `sanitizeGeneratedText` gained a character-level typographic pass (em/en dashes, curly quotes, unicode ellipsis, nbsp/hair spaces) that works on text of any length — the detector-based pass skips texts under 20 chars, which most grammar corrections are. The seeded `detect-grammar` prompt and `lib/prompts/grammar-check.md` also now forbid suggesting these characters (re-run `scripts/seed-grammar-spelling-binds.ts` or edit the active prompt in Admin → Prompts to update the live DB prompt; the code-level filter guarantees the behaviour regardless).

**Option regeneration.** On any AI Detection flag the user can regenerate an individual numbered option (`FlagOption` → `/api/suggest/regenerate`). Regeneration takes an optional direction — `more_casual`, `more_formal`, `closer_to_original`, or `simpler` — and passes the previously rejected option texts as negative examples so the new suggestion doesn't repeat them. The regenerated option replaces the old one in place. The call honours the user's style preferences and the document's intake tokens. Paywalled (subscription-gated) like the rest of suggest.

### 9.1 Citations bridge

Citations are **never** part of the edit queue (see section 10) and are **not counted in the "items to review" total** — they are a deliberate *final* step, done once all edits are complete. Fixing citations mid-edit is wasted effort because rewrites can move, merge, or remove the surrounding text. But a user who finishes editing without seeing them would sit at 15% of their Auditor Score untouched, so three visible bridges convey the "edits first, citations last" ordering and close the gap (all added 2026-06-08, when citation structural fixes were removed from the queue):

1. **Footer shows citations separately.** From scan completion the bottom-of-screen count reads `N sections · N flags + M citations · P items to review` whenever `M > 0`. The `+ M citations` segment hides when zero, and `P items to review` (= the edit queue) excludes citations entirely.
2. **End-of-queue handoff.** `EditSessionSummary`'s title and warning icon are driven by remaining **edits only** (`hasRemainingEdits` = unresolved flags / spelling / grammar; citations excluded): "Edits Still Need Attention" vs. "Editing Complete". Pending citations always render as a distinct **"Final step: review your citations"** card — muted/grey while edits remain (with "finish the edits above first" copy), amber and prominent once edits are done. The **Go to Citations** button is *disabled* until edits are complete (label: "Citations (M) — finish edits first"), then becomes the primary CTA.
3. **Citations-tab banner.** Opening the Citations tab while edit items remain shows an amber "Citations are best left for last" banner with the remaining edit count and a "Back to editing" link (`setWorkspaceMode('edit')`).

"Citations needing review" mirrors the server score rule at `app/api/citations/route.ts`: a citation counts when its `status === 'open'` AND it has structural flags OR a verification verdict of `unverified` / `wrong_details`. The parent `app/w/page.tsx` fetches `/api/citations?documentId=...` when the doc is active and `hasScanned`, and refetches on `nav` changes into edit/analysis views so the count stays accurate after the user returns from the Citations tab.

4. **Status-aware Edit-tab empty state (2026-07-16).** `hasScanned` is session-local, so reloading a document whose edits are already done used to show "Ready to scan — click the Scan button", steering users toward a pointless re-scan when the real next step was citations. The empty state now branches on the persisted `lastScanAt`: never scanned → the original "Ready to scan" prompt; scanned before with pending citations → **"Edits done — citations next"** with a Go to Citations primary button (Re-scan mentioned as secondary); scanned before and nothing pending → **"All caught up"** pointing at Re-scan / save version / download.

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

**Citation locking hardened (2026-07-13).** Two constraint-#1 breaches found in testing (a reference entry got a "Sentence Structure" flag with options that mutated its year): (1) the parser only locked a reference section when the heading was *exactly* "References" — real portfolios use "References – Part A"; and multi-part documents have reference sections mid-document followed by more essay, so "first header → end of text" is also wrong. `lib/citations/parser.ts` now classifies paragraph-by-paragraph with a state machine (`classifyReferenceParagraphs`): a header (with optional `– suffix`) starts a locked run, entries that look like bibliography lines stay locked, the first non-entry paragraph ends it. `/api/scan` runs the same classifier as a **lock repair** at scan start, healing documents parsed before the fix. (2) `citation_artifact` library patterns were loaded by the general scan engine (`loadActiveEntries` had no category filter), turning citation placeholders into prose flags — the loader now excludes the category; those patterns belong to the Citations pipeline exclusively.

**AI artifacts** (`lib/citations/artifacts.ts`): patterns live in `library_entries` with category `citation_artifact` (seeded by `scripts/seed-citation-artifacts.ts` — dangling "Wikipedia", `(Accessed: [insert date])`, `[insert …]`/`[date]`/`[URL]` placeholders, editor instructions like `[pull live URL …]`, "Various coverage", year-less access dates). Regex artifacts contribute a removal-based suggested fix; suggested corrections strip artifacts first, then apply format fixes. Admin-managed per constraint #8.

**LLM config:** citation prompts/models moved from hardcoded route constants to activity binds — `citation-verify`, `citation-verify-queries`, `citation-convert` (seeded by `scripts/seed-citation-binds.ts`; hardcoded values remain only as last-resort fallbacks when a bind is missing). Fixes the constraint-#7 violation.

**UI:** the Citations page shows a **Document-Wide Findings** section (flagged in-text citations and quotes) above the **Reference Entries** list.

**Findings are actionable, not just reportable (2026-07-16).** User testing showed the finding cards told users *what* was wrong but not *how to fix it*, and the jump-to-document affordance was invisible (only the mono citation text was clickable). Changes to the Document-Wide Findings cards (`CitationsPage.tsx`):
- **The whole card is clickable** and jumps to the passage in the Document panel (buttons/links `stopPropagation`); a "Click to view in document →" hint sits in the badge row. The old inner text-only button is gone.
- **Content order: finding first, passage second** — the Error/Warning lines (now `text-[11px] font-medium`) lead the card, followed by the citation/quote text and context sentence, so the *finding* is what the card is about.
- **Computable fixes get a one-click Apply Fix.** `author_inconsistent` now populates `GraphFlag.suggestedFix` in `lib/citations/graph.ts` (swap the cited surname for the entry's first author, preserving the citation's form: `(Fitz-Gibbon, 2019)` → `(Walklate, 2019)`). The card renders Before/After and a green **Apply Fix** button wired to the existing `resolve` action with `correctedText` (which replaces the text in `sections.currentText` server-side).
- **Non-computable findings get "How to fix" guidance** — a per-type plain-language instruction map (`FIX_GUIDANCE`: no_reference_entry, year_mismatch, author_inconsistent, quote_without_citation) rendered in a white inset box. Mark Fixed ("I've fixed this myself") and Dismiss remain, with clarifying tooltips.
- **Reference Entries expansion affordance:** entries with an open proposed fix show a green **Fix** chip beside the caret, and the caret itself turns green — signalling that expanding the card is how you apply the fix. The chip hides while expanded (the Accept Fix button is visible there).

**"No reference entry" findings can search for the source (2026-07-16).** The cross-reference check alone can't tell whether "(Tuchman, 1978)" is a real publication missing from the reference list or an invented citation — and users can't either. Each `no_reference_entry` finding now has a **Search for This Source** button (`action: "find_source"`, `lib/citations/find-source.ts`): deterministic queries from the cited author + year + distinctive words of the writer's sentence → `searchForEntry` web search → LLM assessment via the **`citation-find-source`** activity bind (seeded in `seed-citation-binds.ts`; the assess model must match BOTH the cited author and the attributed idea, and drafts the full reference entry in the document's citation style). Outcomes, persisted on the inline row's `verificationFlags` (verdicts `source_found` / `source_not_found` / `uncertain`, drafted entry in `correctCitation`, survives re-checks):
- **Found** → green "Source found" box with the drafted entry, source link, and an **Add to Reference List** button (`action: "add_reference"`): inserts the entry into the reference-list section via `insertReferenceEntry` (alphabetical when entries are line-separated; skips hard-wrapped continuation lines from PDF extraction; falls back to last locked section, then to appending a References block), resolves the finding, recomputes the score, reloads the document (new `onDocumentChanged` prop), and re-runs the structural check — the finding disappears because the entry now genuinely exists, and the new entry appears in Reference Entries (unchecked, so checklist step ① picks it up).
- **Not found** → "We searched — no matching source was found" with the explanation, honest guidance (add it yourself if you have it; otherwise remove/replace the citation), the searched date, and **Search Again**. Deliberately distinct from `add_reference`'s one-click path: EzSay never fabricates an entry it couldn't verify.
- `resolve` vs `add_reference` are separate on purpose: resolve's `correctedText` path REPLACES the citation's rawText in the body; add_reference INSERTS a new entry and leaves the in-text citation alone.

**Never-cited entries distinguish "used but unattributed" from "unused" (2026-07-16).** The old flat warning ("This reference entry is never cited in the body text") couldn't tell the user which situation they were in. `buildCitationGraph` now searches the body for the entry's first author (word-boundary match on the name as written) and produces one of two messages: (a) *mentioned but uncited* — "'Dahl' IS mentioned in the body without a citation… add (Dahl, 2013) there", with the mention sentence stored on the flag (`GraphFlag.mentionContext`) and rendered in the expanded entry as an amber **Possible uncited use** box with a **Show in document** jump; (b) *genuinely unused* — "…and 'X' isn't mentioned anywhere in it either — add an in-text citation where you used this source, or remove the unused entry." Never-cited entries get a red **Remove from List** action (`action: "remove_reference"`, confirm-gated): deletes the entry from the reference section via `removeReferenceEntry` in graph.ts (full-line removal including hard-wrapped PDF continuation lines; substring removal for run-together text), resolves the row, recomputes the score, reloads the document, re-runs the structural check.

**"Error:" prefix renamed to "Issue:" (2026-07-16).** User feedback: "Error" reads like the software errored. Structural finding lines now render as `Issue:` (severity error, red) / `Warning:` (amber) in both the Document-Wide Findings cards and the Reference Entries list; the severity values in the data model are unchanged.

**Re-check analyzes the current text and preserves work (2026-07-15).** Two defects fixed in `structural_check`: (1) it analyzed `documents.rawText` — the original upload, never updated — so a re-check after editing could not see any rewrite (`sections.currentText`), despite the "citations are best left for last" banner existing precisely because rewrites move text around citations. It now assembles the document from all sections' `currentText` (ordered by index, locked sections included — they hold the reference list), falling back to `rawText` when no sections exist. (2) It deleted and re-inserted all citation rows with `verificationFlags: null`, destroying web-verification verdicts and the user's accept/edit/verify/dismiss resolutions. Fresh rows now carry over `verificationFlags`, non-open `status`, `userAction`, and the applied `correctedText` from the previous rows, matched by `entryType` + whitespace-normalized text (a resolved citation appears in the document as its `correctedText`, so old rows are keyed on both texts). Structural flags are always recomputed fresh. The explicit "Verify sources" button still resets all verdicts via `reset: true` — that is the intentional full re-verify path.

**Citations page check buttons (2026-07-15).** Because the structural check is instant, LLM-free, and (as of the same day) non-destructive, it **runs automatically once per Citations-tab open** — formatting and cross-reference findings always reflect the document as currently edited, and what it catches post-editing is editing drift: rewrites that dropped/displaced in-text citations or quotes, and citations inserted by the plagiarism "Add Citation" flow. The old "Re-check" button is demoted to a small ↻ "Re-check formatting" refresh control under the header (auto-run noted beside it; opening the tab is the user trigger, keeping the spirit of the no-live-recalculation constraint). The misleading grey helper line ("choose Citations after selecting the Scan button") was removed. The header **Scan** pill now reads **"Re-scan"** when the document has been scanned before (session `hasScanned` or persisted `lastScanAt`) — that is the whole-document re-check affordance, making the citations-tab refresh unmistakably local.

**Guided citations checklist (2026-07-16).** The two verify buttons looked optional when they are mandatory for citation integrity, and nothing distinguished scan-time verdicts from post-edit state. The Citations tab header is now a **numbered checklist** (`components/citations/Checklist.tsx`) with live computed states and the first incomplete step highlighted: **① Verify sources are real** (count = reference entries with `verificationFlags == null`), **② Check quotes against sources** (same for quote rows; scan never verifies quotes — `runCitationCheck` runs structural + `verify_batch` only — so this step starts unchecked), **③ Resolve the findings** (open fabricated/needs-correction entries + open document-wide findings, excluding healthy verified quotes; points at the existing fix cards). When all three hit zero, a green **"Citations complete"** banner offers Save a version (wired to the workspace `handleSaveVersion` via a new `onSaveVersion` prop) and points at Re-scan/Download. Key semantics:
- **Verification is incremental by default**: step buttons send `reset: false`, checking only unchecked entries (new, or text-changed since last verification — the re-check preservation clears those verdicts). Full wipe-and-redo remains as small "Re-verify all" / "Re-check all quotes" links (`reset: true`). Rationale: a source-existence verdict depends only on the reference string, so body edits can't invalidate it; no "initial findings vs final" epoch labeling is needed — staleness is fully represented by the unchecked count.
- **Quote-verdict staleness exception**: a quote's context verdict judges the writer's surrounding sentence, so quote verdict preservation in `structural_check` keys on `rawText + contextSentence` (entries/inline key on text only) — editing the claim around an unchanged quote correctly re-opens step ②.
- **`verifiedAt`**: every verdict written by `verify_batch` / `verify_quotes` (success and error paths) now carries an ISO timestamp, rendered as "Checked {date}" in the expanded verification panel and quote detail box.
- Order of operations (user decision 2026-07-16): verify first, then fix — verification adds findings, and fixes change text which re-opens verification, so the loop is verify → fix → incremental re-verify, represented by the live step states rather than prose.
- **Completed steps show results, not just completion (2026-07-16):** a bare "✓ All 16 checked" implied all sources were real. Done steps render outcome chips from the verdicts — sources: `N confirmed real` / `N real but details wrong` / `N not found — likely fabricated` / `N couldn't check`; quotes: verified / close-but-not-exact / not found / misrepresents / possible source / couldn't check — and their subtitles hand off to step 3. Step 3 has a **Show me** button scrolling to `#doc-findings` / `#reference-entries`. Note the step-1 chips count verification verdicts (existence), while the Citation Audit tiles bucket by combined triage (`bucketOf` demotes real-but-flagged entries to "Needs correction") — the chip wording ("confirmed real") is deliberately about existence to keep the two readable side by side.

### 10.2 Existence verification — field-level diffs (added 2026-07-13, phase 2 of 4)

`lib/citations/verify.ts` replaces the single-query verify. Per reference entry:

1. **Deterministic queries** built from the parsed entry fields (no LLM query-generation step — the `citation-verify-queries` bind exists but is no longer called): exact-title phrase search, author + year + title keywords, author + entry text fallback. Each attacks a different failure mode — the exact-title search is what finds "title exists under a different author" (the Boyle/Humphries case).
2. Results merged across queries (dedupe by URL, best score wins, top 6).
3. **Field-diff assessment** via the `citation-verify` bind (prompt "Citation Verify — Assess (field diff)"): author / year / title / source each checked **independently** (`ok`/`wrong`/`unknown` + correct value), plus a **plausibility** sanity check for internal impossibilities (anachronistic dates etc.). Verdicts: `verified` / `wrong_details` / `fabricated` / `uncertain` (`unverified` is the legacy name for fabricated; both are handled everywhere). All-searches-failed → `uncertain`, zero results across queries → `fabricated` at 0.6 confidence without an LLM call.
4. `verificationFlags` jsonb now stores `fields`, `plausibilityNote`, `queriesUsed` alongside the verdict; the UI renders field chips (✓ Author / ✗ Year → 2005) and the plausibility warning.

**Batch execution (Vercel Hobby 60s cap):** `verify_batch` action verifies up to 4 entries per request (35s wall-clock guard; `reset: true` on the first call clears old verdicts). Both clients — the Citations page "Verify sources are real" button (with progress bar, verdicts streaming in per batch) and the scan-time citation phase in `app/w/page.tsx` — drive the loop until `remaining === 0`. The score is recomputed only when the loop finishes. `verify_all` is an alias for one batch (kept for stale clients). Verified live 2026-07-13: Jewkes 2015 → verified 95%; Gill "Gender and media futures" 2022 → wrong_details (year → 2007, real title "Gender and the Media"); Boyle 2019 → wrong_details (author → Drew Humphries (Ed.), year → 2009, publisher → Northeastern University Press) with exact corrected citation.

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
- **Execution:** `verify_quotes` batch action (3/request, same time guard and client loop as `verify_batch`); "Check quotes against sources (N)" button on the Citations page — a deliberately separate, user-triggered action since it's the most expensive check. Quote cards show the verdict badge, explanation, "Source actually says", faithful rewrite, and source link.
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
DATABASE_URL=                       # TRANSACTION-mode pooler (port 6543) — app runtime
DIRECT_DATABASE_URL=                # session-mode pooler (port 5432) — drizzle-kit migrations/seeds

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
| 18 | Scan config dialog | Removed entirely — every scan is all categories at comprehensive depth, one click | 2026-07-19 |
| 19 | Intake questionnaire | Replaced by the assignment brief: one optional card (doc type, citation style, word target, English variant, AI usage, collapsed extras) with "Save & run the full scan" primary | 2026-07-19 |
| 20 | Re-check flow | Scan button auto-saves a version then re-scans — the Save-Version-then-Scan ritual and the grayed-out Scan button are gone | 2026-07-19 |
| 21 | Model routing | Sonnet 4.6 only for rewrites (with Kimi K2.5 / DeepSeek V4 Flash A/B fallbacks); nano/flash tiers everywhere else; prompt caching on; see §24 | 2026-07-19 |
| 22 | Word-count target | Stored in `documents.intake.wordTarget` via the assignment brief; footer shows live progress; completion screen shows words vs target | 2026-07-19 |
| 23 | Detector-parity framing | Score displays carry "EzSay's own estimate — not your university's detector" (free-scan results + Auditor tooltip); landing no longer claims .pdf/.md export | 2026-07-19 |
| 24 | Docx formatting preservation | Originals stored at upload; export does XML surgery on the original file, all-or-nothing alignment, fallback = re-typeset. See §25 | 2026-07-19 |
| 25 | Email gate softened | Anonymous visitors see flag categories + explanations with redacted sentences (up to 5); email verification unmasks and saves. See §22 | 2026-07-20 |
| 26 | Legacy routes deleted | `/results/[docId]`, `/edit/[docId]/*`, `/dashboard` and the EditingShell/PaywallModal/useSubscription tree removed; `/upload` kept as a redirect stub to `/w` | 2026-07-20 |

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
- **DB connections use the transaction-mode pooler (2026-07-16).** Production went down with `EMAXCONNSESSION: max clients reached in session mode — pool_size: 15` in the auth-guard profile query: the session-mode pooler (`:5432`) caps *total* clients at 15, shared between Vercel and any local dev/test server (each holds up to `max: 10`), so a local testing session can starve production. `DATABASE_URL` now points at the transaction-mode pooler (`:6543`, multiplexed, `prepare: false` set in `db/index.ts`); `DIRECT_DATABASE_URL` (`:5432`) exists for drizzle-kit migrations and seed scripts (`drizzle.config.ts` prefers it). The Vercel `DATABASE_URL` (Production + Preview) was switched to `:6543` and redeployed the same day — production had gone down a second time from its own warm function instances exhausting the session pool during the day's repeated deploys. Both poolers verified healthy after the switch.
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

The `/scan` route is the public, no-signup entry point that proves the product works and captures email at the moment of highest interest. **Softened 2026-07-20:** anonymous visitors now see the flag preview immediately — category badge + explanation for up to 5 flags, with the flagged sentence REDACTED (first two words + word-shaped blocks, `maskPhrase` in `app/scan/page.tsx`). Verifying an email unmasks the sentences and saves the scan. The old all-or-nothing wall (nothing visible until a magic-link round trip, then only 2 samples) was the funnel's biggest bounce cliff.

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
6. Flag preview renders for EVERYONE (up to 5 flags): category + explanation
   visible; sentence text redacted while anonymous
7. Below the preview, the **email unlock** card (only if anonymous + flags exist):
   "Reveal the exact sentences — and keep your scan."
8. Submit email → supabase.auth.updateUser({ email },
                    { emailRedirectTo: /auth/callback?redirect=/scan?claimed=1 })
   → Supabase sends verification link → "Check your email" state
9. Visitor clicks link → /auth/callback → /scan?claimed=1
   → page restores the document and renders the same preview UNMASKED
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

---

## 24. Model routing & LLM cost (2026-07-19 pass)

All routing lives in the Activity Binds system (`activity_binds` + `model_library`), applied by `scripts/seed-model-reroute.ts` (idempotent; validates every model ID against OpenRouter's public /models list before writing; never overwrites an admin-customised bind — only replaces models still on the known stale seeded IDs). The legacy `model_configs`/`prompt_configs` path (`lib/routing/config-loader.ts`) is dead code, marked `@deprecated`.

### Current routing

| Activity | Primary | Fallbacks | Why |
|---|---|---|---|
| suggest-rewrite / suggest-academic | `anthropic/claude-sonnet-4.6` | `moonshotai/kimi-k2.5`, `deepseek/deepseek-v4-flash` | The one quality-critical prose task. Fallbacks double as the acceptance-rate A/B pool. |
| evaluate-rewrite | `openai/gpt-5-nano` | `anthropic/claude-haiku-4.5`, `google/gemini-3-flash-preview` | 512-token classification |
| detect-grammar / detect-spelling | `google/gemini-3-flash-preview` | `deepseek/deepseek-v4-flash`, `openai/gpt-5.4-nano` | Mechanical detection — was the biggest Sonnet overkill |
| tone-consistency (new bind) | `google/gemini-3-flash-preview` | `openai/gpt-5.4-mini`, `deepseek/deepseek-v4-flash` | Whole-doc JSON verdict; was hardcoded Sonnet (constraint-#7 debt, now fixed) |
| plagiarism-queries / plagiarism-assess (new binds) | `google/gemini-3-flash-preview` | mini/nano/deepseek | Was hardcoded (constraint-#7 debt, now fixed) |
| citation-verify / quote-check / find-source | `openai/gpt-5.4-mini` | `google/gemini-3-flash-preview`, `deepseek/deepseek-v4-flash` | Structured extraction with honesty-committee stakes — mid-tier, not nano |
| citation-convert | `openai/gpt-5.4-nano` | flash, mini | Format transform, 512 tokens |

Notes (pricing verified against openrouter.ai 2026-07-19):
- **Kimi K3 is $3/$15 — Sonnet-priced with no OpenRouter prompt caching. Not a savings play.** Kimi K2.5 ($0.375/$2.025) is the value Moonshot tier.
- **`x-ai/grok-4.1-fast` was delisted from OpenRouter** (checked live); the cheapest Grok (4.3, $1.25/$2.50) loses to Gemini 3 Flash for short-output analysis, so Grok is out of the lineup.
- **Prompt caching is ON** (`lib/routing/openrouter.ts` `withCacheControl`): system messages ≥4,000 chars get a `cache_control: ephemeral` breakpoint — the ~3k-token ContextLLM prefix repeated on every suggest/evaluate call was the largest fixed input cost. Cache-read tokens are logged (`prompt_tokens_details.cached_tokens`).
- **A/B plan:** `llm_call_log` already records model + outcome per call; when enough acceptance data accumulates, compare Sonnet 4.6 vs Kimi K2.5 vs DeepSeek V4 Flash acceptance rates on suggest activities before demoting Sonnet.
- **Retired binds** (never invoked by any route — scan is pure code): surface-scan, deep-scan, comprehensive-scan, suggest-tone, expand-prose — rows kept with `isActive=false`, removed from the admin auto-recreate list.
- Estimated full-workup cost for a 10k-word doc: ~$2.50–4.00 (old all-Sonnet, uncached) → ~$0.80–1.20 (this routing). Verify against `llm_call_log`, not the estimate.

---

## 25. Formatting-preserving .docx export (2026-07-19)

**Problem:** exports were always re-typeset from plain text — a student's uploaded .docx lost its styles, tables, images, and footnotes, which undermines "submit this file" trust.

**Design:** originals are now stored at upload (private Supabase Storage bucket `originals`, path `{userId}/{docId}.{ext}`, `documents.storagePath`; docx/pdf/txt — pasted has nothing to store). For .docx sources, export performs **surgery on the original file** (`lib/export/docx-surgery.ts`): unzip → walk `word/document.xml` paragraphs in the exact order mammoth read them at upload (verified against mammoth 1.12.0 source: mc:Choice skipped, DrawingML textboxes skipped, VML textboxes after their anchor, fldSimple dropped) → align 1:1 with `sections` rows → rewrite ONLY paragraphs where `currentText !== rawText` via a prefix/suffix run splice that keeps runs outside the edit window (bold spans, hyperlinks, footnote markers). Multi-paragraph rewrites clone the source paragraph's `pPr` (minus `sectPr`). All other zip entries pass through decompressed-byte-identical.

**Safety:** alignment is all-or-nothing — any mismatch, tracked changes (`w:ins`/`w:del`), OLE objects, or fields/content-controls in an edited paragraph → fall back to the generic re-typeset export (never a corrupted file, never worse than before). Headers report the outcome: `X-Export-Mode: preserved|retypeset`, `X-Export-Fallback-Reason: no-original|download-failed|malformed-docx|unsupported-construct|alignment-failed|edited-field-paragraph|surgery-error`.

**UX:** when preservation is available (`storagePath` set + docx source) the download menu offers "Save as .docx — original formatting" (default) and "— re-typeset to Style Rules" (`&mode=retypeset`; the only mode that applies Style-Rules typesetting). Docx downloads are fetch→blob so the client can toast when a preserved request silently fell back. Older/non-docx documents keep the single re-typeset entry, with a re-upload hint for docx sources without a stored original.

**Ops:** bucket created by `scripts/setup-storage.ts` (idempotent; run once per environment — done 2026-07-19 on the shared Supabase project). Service-role storage access via `lib/supabase/admin.ts` (`SUPABASE_SERVICE_ROLE_KEY`); document DELETE best-effort removes the stored original. Tests: `__tests__/docx-surgery.test.ts` (round-trip invariant: mammoth re-extraction of the output equals the edited sections; zip-entry identity; guard behaviors).
