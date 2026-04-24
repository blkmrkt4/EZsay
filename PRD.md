# EzSay — Product Requirements Document

**Product name:** EzSay
**Version:** 1.0
**Status:** In development — core workspace, scan pipeline, and editing flow functional
**Owner:** Robin Hutchinson
**Last updated:** April 23, 2026

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
- **Status:** Stripe integration stubbed (paywall modal UI built, webhook skeleton in place). Full checkout flow not yet wired.

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
| Auth | Supabase Auth (@supabase/ssr) | 0.10.2 | Email/password + Google + Apple SSO |
| File storage | Supabase Storage | — | PDFs and .docx uploads |
| Payments | Stripe | 22.0.2 | Stubbed — modal UI + webhook skeleton |
| DB driver | postgres (postgres.js) | 3.4.9 | Supabase Postgres direct connection |
| Model routing | OpenRouter | — | Multi-model, hidden from users |
| PDF parsing | pdfjs-dist | 5.6.205 | Server-side text extraction |
| DOCX parsing | mammoth | 1.12.0 | Preserves headings and footnotes |
| Web search | DuckDuckGo (free) / Tavily (paid) | — | Used for plagiarism + citation verification |

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

---

## 10. Citations page

Collapsible style conversion section with 8 expandable style cards (full name, usage, in-text + reference examples). Citation list with clickable cards that expand to show full paragraph context. Doc panel highlights and scrolls to selected citation. Verification results show per-citation verdicts with source URLs.

---

## 11. Style Training

44 formatting artifacts, 7 categories, 3 preferences (Always Remove, Always Keep, Ask Me Each Time). Expandable rows showing what "Remove" does. Integrated with scan: kept items excluded from detection, removed items auto-processed, ask items appear in batch review.

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
| Auth (email + Google + Apple, dev bypass) | Done |
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
| Big Test (5-model debug) | Done |
| Phrase library (250 entries) | Done |
| Admin: Activity Binds, Libraries, Settings, Log | Done |
| Paywall modal UI | Done |
| Stripe webhook | Stubbed |

---

## 16. What's next

| Feature | Priority | Notes |
|---|---|---|
| Full Stripe integration | High | Checkout, subscription sync, access gating |
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
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Stripe (not yet wired)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_ANNUAL_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# OpenRouter
OPENROUTER_API_KEY=

# Tavily (optional, falls back to DuckDuckGo)
TAVILY_API_KEY=

# Dev mode
DEV_BYPASS_AUTH=true
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
