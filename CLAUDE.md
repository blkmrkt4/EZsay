# CLAUDE.md — EzSay Project

This file is the persistent context for Claude Code working on the EzSay project. Read it fully at the start of every session before writing any code.

---

## Your two responsibilities in every session

**1. Build correctly.** Follow the architecture, constraints, and conventions in this file exactly.

**2. Keep PRD.md current.** The PRD is the living source of truth. Any time you make a decision not already documented — a library choice, a data model change, a flow adjustment, a constraint discovered during build — update PRD.md before ending the session. If the PRD and the code diverge, the PRD is wrong and you must fix it.

### When to update PRD.md

Update immediately when any of the following happen:

- You choose a specific library version — add it to the tech stack table
- You discover a build constraint — add it to the relevant feature spec
- A feature scope changes during implementation — update the feature table and note why
- You add a new environment variable — add it to the env vars list in both files
- You resolve one of the open questions in the PRD — replace the question with the decision and date
- A data model field changes name, type, or is added/removed — update the data models section
- The build order needs to change — update the build order in this file

Do not wait until the end of a session. Update inline as decisions are made.

---

## What EzSay is

EzSay is a web-based SaaS writing editor that helps users make AI-assisted writing sound authentically human. It is **edit-oriented, not generation-oriented**. Users upload their own documents. EzSay analyses them, identifies AI-pattern writing, and guides users through a section-by-section co-editing flow where they make every decision.

The full product specification is in `PRD.md`. Read that file for feature detail. This file covers architecture, conventions, and hard constraints only.

---

## Project name

**EzSay** — used in all user-facing copy, filenames, and package names.

---

## Hard constraints — never violate these

### 1. Citations are locked
Citations, footnotes, and reference lists must never be flagged in the editing panel, modified by the editing engine, or included in the AI-risk score. Identified at the parsing layer. Enforced in the parser, not the UI.

### 2. Score recalculation is user-triggered only
The AI-risk score updates only when the user explicitly presses "Re-evaluate". No live recalculation on any editing action.

### 3. No silent citation corrections
Every citation suggestion requires an explicit user action: accept / edit manually / mark as verified / dismiss.

### 4. Multi-model routing is invisible to users
OpenRouter model names and routing decisions never surface anywhere in the UI or API responses.

### 5. Manual rewrites are the highest-priority style signal
When a user writes their own replacement (ignoring all generated options), log it as weight 3 — the highest confidence style signal. Must be in the logging logic, not just the docs.

### 6. Style profiles are split by document type
Academic, professional, casual, and legal profiles stored and applied separately. Never merge signals across types.

### 7. Admin panel controls all prompt and model configuration
No model name or prompt string is hardcoded in application logic. All LLM configuration reads from the database at runtime via `lib/routing/config-loader.ts`. This is how the product gets better without code deploys.

### 8. The phrase library is the scan engine's source of truth
The analysis engine never uses a hardcoded list of banned words or patterns. It always loads active entries from the `library_entries` table at scan time. The seed data from `ContextLLM.md` populates this table on first deploy — after that, the library is live and managed via the admin panel.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Server components, streaming, route-level middleware |
| Language | TypeScript | Strict mode throughout |
| Hosting | Vercel | Zero-config Next.js deploys |
| Database | Supabase (PostgreSQL) | Hosted Postgres |
| ORM | Drizzle ORM | Type-safe SQL on Supabase Postgres |
| Auth | Supabase Auth | Email/password + Google SSO. No NextAuth. Apple SSO deferred to post-V1. |
| File storage | Supabase Storage | Uploaded PDFs and .docx files |
| Payments | Stripe | Monthly + annual subscriptions |
| Model routing | OpenRouter | Single API key, multi-model, hidden from users |
| PDF parsing | pdfjs-dist | Server-side text extraction |
| DOCX parsing | mammoth.js | Preserves headings and footnote markers |
| Citation verify | OpenRouter + web search | Citation strings only — no full document content |

*Update with specific library versions as confirmed during build.*

---

## Architecture overview

```
ezsay/
├── app/
│   ├── (auth)/                     # Login, signup, SSO flows
│   ├── (dashboard)/                # Library, account, subscription
│   ├── upload/                     # Upload + paste flow
│   ├── results/[docId]/            # Post-scan results — free, read-only
│   ├── edit/[docId]/               # Editing panel — paywalled
│   ├── admin/                      # Admin panel — role: admin only
│   │   ├── prompts/                # Prompt management UI
│   │   ├── models/                 # Model + fallback config UI
│   │   ├── library/                # Phrase library management UI
│   │   └── settings/               # API keys, activity log, test mode
│   └── api/
│       ├── scan/                   # Document analysis endpoint
│       ├── suggest/                # Option generation endpoint
│       ├── evaluate/               # Manual rewrite evaluation endpoint
│       ├── citations/              # Citation check + verify endpoints
│       ├── rescore/                # Re-evaluate endpoint
│       ├── style/                  # Style profile read/write
│       ├── library/                # Library entry CRUD + propose endpoint
│       ├── webhooks/stripe/        # Stripe webhook handler
│       └── admin/                  # Admin API routes (role-protected)
├── components/
│   ├── editor/                     # Editing panel components
│   ├── citations/                  # Citations tab components
│   ├── upload/                     # Upload + paste components
│   ├── results/                    # Results screen components
│   ├── admin/                      # Admin panel components
│   └── ui/                         # Shared UI primitives
├── lib/
│   ├── analysis/                   # Flag detection logic
│   │   ├── exact-matcher.ts        # String match against library exact_phrase entries
│   │   ├── regex-matcher.ts        # Regex match against library regex_pattern entries
│   │   └── semantic-analyzer.ts   # Analysis functions for semantic_pattern entries
│   ├── citations/                  # Citation parsing + verification
│   ├── routing/                    # OpenRouter call logic
│   │   └── config-loader.ts        # Reads active model + prompt config from DB
│   ├── prompts/                    # Prompt files and interpolation
│   │   ├── context.md              # ContextLLM.md — always prepended to every LLM call
│   │   ├── detection-pass.md       # scan_general
│   │   ├── faithful-rewrite.md     # suggest_rewrite, evaluate_rewrite
│   │   ├── tone-edit.md            # suggest_tone
│   │   ├── academic-rewrite.md     # suggest_academic
│   │   ├── academic-detection.md   # scan_academic
│   │   ├── expand-prose.md         # expand_prose
│   │   ├── interpolate-defaults.json  # Default [bracket] values per document type
│   │   └── interpolate.ts          # Fills [brackets] from style profile + doc type
│   ├── library/                    # Library loading + cache
│   │   └── loader.ts               # Loads active library_entries at scan time
│   ├── style/                      # Style profile management
│   └── parsers/                    # PDF, DOCX, TXT parsers
├── db/
│   └── schema.ts                   # Drizzle schema — single source of truth for all models
├── scripts/
│   └── seed-library.ts             # Seeds library_entries from ContextLLM.md on first deploy
├── PRD.md
└── CLAUDE.md
```

---

## The prompt system

### How every LLM call is built

```
system prompt = context.md (ContextLLM — always, no exceptions)
             + active prompt for this activityType (read from DB via config-loader.ts)

user message  = interpolated prompt template
              + document section or citation being processed
```

`context.md` is always prepended. It is never skipped. It is the global base layer that applies to every single LLM call regardless of activity type.

The active prompt per activity is set in the admin panel (`/admin/prompts`) and stored in `prompt_configs`. Claude Code never hardcodes which prompt to use — always call `config-loader.ts`.

### Activity types and default prompt files

| Activity type | Default prompt file | When triggered |
|---|---|---|
| `scan_general` | `detection-pass.md` | Non-academic document scan |
| `scan_academic` | `academic-detection.md` | Academic document scan |
| `suggest_rewrite` | `faithful-rewrite.md` | Generating options for content flags |
| `suggest_academic` | `academic-rewrite.md` | Options in academic documents |
| `suggest_tone` | `tone-edit.md` | Tone/voice flags |
| `evaluate_rewrite` | `faithful-rewrite.md` | Evaluating a manual rewrite submission |
| `citation_verify` | *(inline)* | Citation live verification |
| `expand_prose` | `expand-prose.md` | Expanding outline sections |

### Interpolation tokens

All `[BRACKET]` tokens in prompt files are filled at runtime by `lib/prompts/interpolate.ts`. Token sources:

- `[SECTION_TEXT]` — the document section being processed
- `[DOCUMENT_TYPE]` — from the document record
- `[PERSONA]`, `[VERBAL_TICS]` — from style profile if signals exist; from `interpolate-defaults.json` if not
- `[ACADEMIC_LEVEL]`, `[SUBJECT]`, `[WRITER_DESCRIPTION]` — academic defaults until profile has enough signal

---

## The phrase library

### What it is

The `library_entries` table is the single source of truth for everything the scan engine detects. On first deploy, `scripts/seed-library.ts` populates it from `ContextLLM.md`. After that, it grows through the admin panel.

### Three entry types — three detection code paths

| Entry type | Value field contains | Detection method |
|---|---|---|
| `exact_phrase` | A word or fixed phrase | String match in `lib/analysis/exact-matcher.ts` |
| `regex_pattern` | A regex string | Regex match in `lib/analysis/regex-matcher.ts` |
| `semantic_pattern` | A named pattern identifier | Named analysis function in `lib/analysis/semantic-analyzer.ts` |

### Semantic pattern identifiers (named functions required in semantic-analyzer.ts)

| Identifier | What it detects |
|---|---|
| `synonym_rotation` | Same concept described with different synonyms across the document |
| `uniform_paragraph_length` | All or most paragraphs in the same length range |
| `uniform_sentence_length` | Clusters of same-length sentences with no variation |
| `uniform_information_density` | Every sentence carries equal weight — no breathing room |
| `missing_contractions` | Contraction rate below 60% in casual/professional text |
| `transition_cycling` | Same transition words repeating in a predictable pattern |
| `absent_personal_voice` | No tangents, self-corrections, fragments, or opinion hedging across a section |

### Three sources — different trust levels

| Source | Status on creation | Trust |
|---|---|---|
| `manual` | Active immediately | Highest — admin added it directly |
| `user_derived` | Under review | Surfaced from flag acceptance data — admin must approve |
| `ai_proposed` | Under review | From AI-assisted discovery batch job — admin must approve |

### The `libraryEntryId` foreign key

The `flags` table has a `libraryEntryId` field linking each flag back to the library entry that triggered it. This is how acceptance rates are calculated and how user-derived patterns are surfaced. Do not omit this field.

---

## Key data models

Defined in `db/schema.ts`. If schema diverges from here, update this file to match the code.

### library_entries
```typescript
{
  id: uuid (pk)
  entryType: enum('exact_phrase', 'regex_pattern', 'semantic_pattern')
  value: text                    // phrase, regex string, or semantic pattern identifier
  category: enum('transition', 'corporate_fluff', 'hype_word', 'sentence_structure',
                 'density', 'burstiness', 'academic_pattern', 'emerging')
  severity: enum('high', 'medium', 'low')
  explanation: text              // one-line reason shown to users in the editing panel
  documentTypes: text[]          // ['all'] or subset of ['academic','professional','casual','legal']
  status: enum('active', 'under_review', 'retired')
  source: enum('manual', 'user_derived', 'ai_proposed')
  acceptanceRate: float          // updated async — % of flags of this type users resolved
  flagCount: integer             // total times triggered across all users
  notes: text (nullable)         // admin-only context
  addedBy: uuid (fk → auth.users)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### documents
```typescript
{
  id: uuid (pk)
  userId: uuid (fk → auth.users)
  title: text
  rawText: text
  documentType: enum('academic', 'professional', 'casual', 'legal')
  status: enum('uploaded', 'scanning', 'scanned', 'editing', 'complete')
  aiRiskScore: integer (nullable, 0–100)
  lastRescoreAt: timestamp (nullable)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### sections
```typescript
{
  id: uuid (pk)
  documentId: uuid (fk → documents)
  index: integer
  rawText: text
  currentText: text
  aiSignalLevel: enum('high', 'medium', 'low', 'none')
  flagCount: integer
  flagsResolved: integer
  isLocked: boolean
}
```

### flags
```typescript
{
  id: uuid (pk)
  sectionId: uuid (fk → sections)
  libraryEntryId: uuid (fk → library_entries)   // REQUIRED — links flag to its source entry
  phraseStart: integer
  phraseEnd: integer
  flaggedPhrase: text
  patternType: enum('banned_word', 'banned_structure', 'synonym_rotation',
                    'uniform_length', 'uniform_density', 'transition_pattern')
  explanation: text              // copied from library_entries.explanation at scan time
  status: enum('open', 'accepted', 'rejected', 'skipped', 'generation_failed')
  acceptedOptionId: uuid (nullable)
  manualReplacement: text (nullable)
}
```

### flag_options
```typescript
{
  id: uuid (pk)
  flagId: uuid (fk → flags)
  text: text
  modelId: text                  // never exposed to users
  isBlend: boolean
  accepted: boolean (nullable)
}
```

### citations
```typescript
{
  id: uuid (pk)
  documentId: uuid (fk → documents)
  rawText: text
  style: enum('apa', 'mla', 'chicago', 'harvard', 'oxford', 'bluebook', 'oscola', 'business')
  structuralFlags: jsonb
  verificationFlags: jsonb
  status: enum('open', 'resolved', 'dismissed')
  userAction: enum('accepted', 'edited', 'verified', 'dismissed') (nullable)
  correctedText: text (nullable)
}
```

### style_profiles
```typescript
{
  id: uuid (pk)
  userId: uuid (fk → auth.users)
  documentType: enum('academic', 'professional', 'casual', 'legal')
  signals: jsonb                 // array of StyleSignal objects
  updatedAt: timestamp
}
```

### StyleSignal (stored in style_profiles.signals jsonb)
```typescript
{
  patternType: string
  originalPhrase: string
  replacement: string
  signalWeight: 'manual_rewrite' | 'typed_replacement' | 'option_selected' | 'rejected'
  documentType: string
  createdAt: string
}
```

### Admin tables

```typescript
// prompt_configs — one row per activity type
{
  id: uuid (pk)
  activityType: text
  activeVersionId: uuid (fk → prompt_versions)
  modelConfigId: uuid (fk → model_configs)
  updatedAt: timestamp
  updatedBy: uuid (fk → auth.users)
}

// prompt_versions — full edit history
{
  id: uuid (pk)
  activityType: text
  name: text
  promptText: text
  createdAt: timestamp
  createdBy: uuid (fk → auth.users)
}

// context_versions — ContextLLM edit history
{
  id: uuid (pk)
  name: text
  contextText: text
  isActive: boolean
  createdAt: timestamp
  createdBy: uuid (fk → auth.users)
}

// model_configs
{
  id: uuid (pk)
  activityType: text
  primaryModel: text
  fallbackModel1: text
  fallbackModel2: text
  temperature: float
  maxTokens: integer
  updatedAt: timestamp
}

// llm_call_log
{
  id: uuid (pk)
  activityType: text
  modelUsed: text
  promptVersionId: uuid
  inputTokens: integer
  outputTokens: integer
  latencyMs: integer
  flagId: uuid (nullable)
  outcome: enum('accepted', 'rejected', 'skipped', 'pending')
  createdAt: timestamp
}
```

---

## API conventions

- All `/api/` routes use Next.js App Router route handlers
- Auth via Supabase session middleware — unauthenticated → 401
- Paywalled routes (`edit`, `suggest`, `evaluate`, `citations/verify`, `rescore`) check Stripe subscription server-side — unsubscribed → 402
- Admin routes check `role: 'admin'` on user record — non-admin → 403
- All responses: `{ success: boolean, data?: any, error?: string }`
- Scanning and citation verification use streaming responses
- Never include model names in API responses to users

---

## Auth & subscription logic

Use `@supabase/ssr` throughout. All OAuth via Supabase Auth.

```
/edit/[docId]     → session check (401) → subscription check (402) → render
/results/[docId]  → session check (401) → render (no subscription check)
/admin/*          → session check (401) → admin role check (403) → render
```

Stripe webhook at `/api/webhooks/stripe` syncs subscription status on every lifecycle event. Never trust client-side subscription state for access control.

---

## Document parsing rules

Citation locking happens before any other processing:

1. Extract raw text preserving paragraph structure
2. Identify and lock all citation content:
   - Inline: `(Author, Year)`, `[1]`, footnote markers
   - Reference sections: "References", "Bibliography", "Works Cited", "Notes", "Footnotes"
   - Footnote text
3. Set `isLocked: true` on citation sections
4. Split remaining text into sections by paragraph (or by heading if headings present)
5. Return to scan endpoint

Supported: `.pdf`, `.docx`, `.txt`, plain text paste.

---

## Style profile update logic

Fire-and-forget — never block the editing UI. Use `waitUntil` or background job.

| Action | Weight label | Value |
|---|---|---|
| Manual rewrite accepted | `manual_rewrite` | 3 |
| Typed custom replacement | `typed_replacement` | 2 |
| Selected generated option | `option_selected` | 1 |
| Rejected / skipped | `rejected` | -0.5 |

---

## UI conventions

- **Desktop-first.** Editing panel requires full screen width. Mobile shows "best on desktop" for editing only. All other screens mobile-responsive.
- **Silent saves.** No spinners. Progress via progress indicator only.
- **Flag severity colours:** High = amber, Medium = yellow, Low = light blue, Resolved = faded + strikethrough, Locked = grey no highlight.
- **Re-evaluate button:** persistent header, disabled during active scan, animates score on return.

---

## Editing panel — three panel layout

The editing panel is the core product UI. It has exactly three panels. Build it precisely as described here. Do not improvise the layout.

### Panel 1 — Doc Panel

- **Hidden by default.** Toggled open and closed via a "Show document" / "Hide document" button in the Edit Panel header.
- Contains the **full essay text**, scrollable, all sections visible.
- The section currently being reviewed is highlighted with a **green background** — like a green highlighter pen on paper. This is the only use of green in the editing UI.
- Sections already completed are **faded/dimmed** (reduced opacity).
- Sections not yet reached are displayed at full opacity but without highlight.
- Clicking any section in the Doc Panel **jumps the Edit Panel** to that section's first unresolved flag.
- When the user selects option "Edit myself", the Doc Panel **opens automatically** and the active paragraph is highlighted so they can edit it directly in context.
- Keyboard shortcut: **D** toggles the Doc Panel open/closed.

### Panel 2 — Edit Panel

- **Always visible.** Takes the majority of horizontal space. This is the primary panel.
- **Header:** current flag position (e.g. "Flag 3 of 14") and the "Show/Hide document" toggle button.
- **Top of content — the user's original text block.** This is the most important element on the screen. Style it prominently in a clearly bordered box. The flagged word or phrase is highlighted in amber with an underline. This text is the user's own writing — it must be **visually dominant** over everything else on the page.
- **Immediately below the original text:** one-line flag explanation in muted small text — why this was flagged (copied from `library_entries.explanation`).
- **Below that — numbered replacement options.** Each option shows:
  - The option number (1, 2, 3...)
  - The **full replacement text** — not a summary, the complete sentence or paragraph as it would appear
  - A one-line note in muted text explaining what changed
- **Options are always numbered. Never labelled A/B/C.**
- **The last option is always** "Edit this paragraph myself in the document" — selecting it opens the Doc Panel automatically.
- **Visual hierarchy rule:** the user's original text is the largest, most prominent text on screen. AI suggestions are clearly secondary — smaller font, muted colour, subordinate visual weight. AI commentary and notes must never compete visually with the user's own writing.

### Panel 3 — Choices Panel

- **Always visible.** Fixed width on the right side. Never hidden.
- **Header:** "Your choice"
- **Prompt text:** "Which version would you like to use?" — short, direct.
- **Numbered choice buttons** — compact, one per option, matching the numbered options in the Edit Panel exactly. Shows a short label for each (not the full text — just enough to distinguish the choices).
- **Selecting a choice in either panel keeps both in sync immediately.** Clicking option 2 in the Edit Panel selects button 2 in the Choices Panel and vice versa. They are always in sync.
- **Below the choices:**
  - **Confirm** button (primary) — confirms the selected choice and advances to the next flag
  - **Skip** button — skips this flag without resolving it
  - **Reject all** button — dismisses all options and marks flag as rejected
- **Footer:** current flag position ("3 of 14 flags") and keyboard shortcut hints.

### Keyboard shortcuts

| Key | Action |
|---|---|
| 1, 2, 3, 4... | Select the corresponding numbered option |
| Enter | Confirm the current selection |
| S | Skip the current flag |
| R | Reject all options for the current flag |
| D | Toggle the Doc Panel open/closed |

### Component files this maps to

```
components/editor/
├── EditingShell.tsx         # The three-panel layout wrapper
├── DocPanel.tsx             # Panel 1 — full essay, green highlight, toggle
├── EditPanel.tsx            # Panel 2 — original text block + numbered options
├── OriginalTextBlock.tsx    # The user's text — flagged phrase highlighted amber
├── FlagOption.tsx           # A single numbered option card
└── ChoicesPanel.tsx         # Panel 3 — compact numbered choices + confirm/skip/reject
```

---

## Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only — never expose to client

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_ANNUAL_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# OpenRouter
OPENROUTER_API_KEY=               # DB value from admin panel overrides this at runtime
```

---

## Not in scope for V1

- Plagiarism detection
- Standalone grammar checker
- Collaborative / shared editing
- Mobile app or browser extension
- Third-party API access
- Team accounts
- Drag-to-reorder sections
- Export citations as standalone reference list
- Style fingerprint summary shown to user
- Routing reweighting (log acceptance data, do not act on it yet)
- Version history / document restore
- Detector score simulation (GPTZero / Turnitin %)
- A/B testing in the phrase library

---

## Build order

Follow this sequence. Do not skip ahead.

1. Supabase project setup — database, auth providers, storage buckets
2. Drizzle schema (`db/schema.ts`) — all models including admin and library tables, run initial migration
3. Seed script (`scripts/seed-library.ts`) — populates `library_entries` from ContextLLM.md, seeds `prompt_versions` from `lib/prompts/*.md`, sets all active configs
4. Next.js scaffold — App Router, TypeScript strict, middleware skeleton
5. Supabase Auth — email/password, Google SSO, session middleware (Apple SSO post-V1)
6. Admin panel — prompts, models, library, API keys, activity log (build early — you need this for tuning from day one)
7. Stripe — products, prices, webhook handler, subscription status on user record
8. Document upload + parser — Supabase Storage, parsing, citation locking, section splitting
9. Scan endpoint + analysis engine — loads library entries, runs all three detection code paths
10. Results screen — read-only, score + flagged sections, paywall gate
11. Paywall modal — annual plan first, monthly secondary
12. Editing panel — section navigator, focus view, options panel, manual rewrite mode
13. Citations tab — structural check, live verification, per-citation choices
14. Style profile logging — async, all signal types
15. Re-evaluate endpoint — re-scan current document state, return updated score
16. Completion summary + export — score delta, PDF / .docx / clipboard
17. Document library — list view with scores, dates, document type
