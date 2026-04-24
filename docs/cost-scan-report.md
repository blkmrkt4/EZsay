# EzSay — Cost Awareness Scan Report (Full PRD Implementation)

**Date:** April 19, 2026
**Scope:** Full PRD implementation — OpenRouter connected, Tavily web search enabled, Vercel deployed, Stripe live
**Pricing:** $15/mo monthly, $9/mo ($108/yr) annual
**Hosting:** Vercel v0 subscription ($20/month — includes Pro features and deployment credits)

---

## 1. Summary

With the full PRD implemented and all services live, EzSay's dominant cost is OpenRouter LLM calls at an estimated $0.30–$1.50 per user per month depending on usage profile. Total cost to serve a typical user is ~$1.80/month against $15/month revenue (88% gross margin) or $9/month annual revenue (80% margin). The product is comfortably profitable at all usage levels.

The three biggest cost risks are: (1) suggest-rewrite calls — they're the highest-volume LLM activity and use the most expensive model, (2) plagiarism detection if implemented without search result caching, and (3) absence of per-user rate limiting. All are manageable.

Vercel v0 at $20/month covers deployment and hosting generously — EzSay's serverless architecture means you pay essentially nothing beyond the subscription until you hit serious scale (~50K+ monthly requests).

---

## 2. Per-user cost by usage profile

### Usage assumptions

| Profile | Docs/mo | Words/doc | Flags/doc | Scans/doc | Citations | Plagiarism checks | Edit sessions |
|---|---|---|---|---|---|---|---|
| Light | 4 | 1,500 | 8 | 1 | 5 | 2 | 4 |
| Typical | 10 | 2,500 | 15 | 2 | 15 | 5 | 10 |
| Heavy | 30 | 4,000 | 30 | 3 | 40 | 15 | 25 |

### Monthly cost per user

| Cost item | Type | Light | Typical | Heavy |
|---|---|---|---|---|
| **Supabase DB + Auth** (Pro, shared) | Fixed | $0.03 | $0.03 | $0.03 |
| **Vercel hosting** (v0, shared) | Fixed | $0.02 | $0.02 | $0.02 |
| **OpenRouter — scan explanations** | Variable | $0.01 | $0.04 | $0.15 |
| **OpenRouter — suggest options** (3 opts × flags) | Variable | $0.07 | $0.27 | $0.81 |
| **OpenRouter — evaluate rewrites** (~30% of flags) | Variable | $0.01 | $0.02 | $0.05 |
| **OpenRouter — tone edits** (~10% of flags) | Variable | $0.003 | $0.01 | $0.03 |
| **OpenRouter — citation verify** (Gemini Flash) | Variable | $0.001 | $0.003 | $0.008 |
| **OpenRouter — plagiarism assess** | Variable | $0.01 | $0.03 | $0.08 |
| **OpenRouter — expand prose** (~2 per doc) | Variable | $0.02 | $0.06 | $0.17 |
| **Tavily web search** (citations + plagiarism) | Variable | $0.07 | $0.20 | $0.55 |
| **Stripe processing** (2.9% + $0.30) | Variable | $0.74 | $0.74 | $0.74 |
| | | | | |
| **Total cost to serve** | | **$0.99** | **$1.42** | **$2.63** |
| **Revenue (monthly sub)** | | $15.00 | $15.00 | $15.00 |
| **Gross margin (monthly)** | | **$14.01 (93%)** | **$13.58 (91%)** | **$12.37 (82%)** |
| **Revenue (annual sub)** | | $9.00 | $9.00 | $9.00 |
| **Gross margin (annual)** | | **$8.01 (89%)** | **$7.58 (84%)** | **$6.37 (71%)** |

### Cost assumptions

**OpenRouter token pricing (via OpenRouter, includes ~15% markup):**
- Claude Sonnet 4: ~$3.50/$10.50 per 1M in/out tokens
- Gemini 2.5 Flash: ~$0.09/$0.36 per 1M in/out tokens
- GPT-4o (fallback only): ~$3.00/$12.00 per 1M in/out tokens

**Per-call estimates:**
- Scan explanation: ~500 in + 256 out tokens = ~$0.004
- Suggest options: ~1,200 in + 2,048 out tokens = ~$0.026
- Evaluate rewrite: ~800 in + 512 out tokens = ~$0.007
- Citation verify (Gemini): ~300 in + 512 out tokens = ~$0.0002
- Plagiarism assess: ~1,000 in + 1,024 out tokens = ~$0.013
- Expand prose: ~800 in + 2,048 out tokens = ~$0.025

**Tavily:** $0.01/search. Typical doc: 15 citation searches + 5 plagiarism searches = $0.20.

**Stripe:** 2.9% + $0.30 per successful charge. Monthly: $0.74. Annual: $0.30/month amortized ($3.43 on $108 charge / 12 months = $0.29).

*Note: Annual subscribers have better margin because Stripe's fixed $0.30 fee is amortized across 12 months instead of charged monthly.*

---

## 3. Breakeven analysis

### Per-tier breakeven

| Metric | Monthly ($15/mo) | Annual ($9/mo) |
|---|---|---|
| Revenue/user/month | $15.00 | $9.00 |
| Cost to serve (typical) | $1.42 | $1.13* |
| Gross margin | $13.58 (91%) | $7.87 (87%) |
| Breakeven documents/month | ~160 | ~85 |

*Annual subscribers save $0.29/month on Stripe fees (one charge instead of twelve).*

**Breakeven is extremely comfortable.** A user would need to process 85-160 documents per month to become unprofitable. No realistic user approaches this.

### Feature cost ranking (what costs the most per use)

| Feature | Cost per use | Frequency | Monthly impact (typical) |
|---|---|---|---|
| Suggest rewrite (3 options) | $0.078 | 150/month (15 flags × 10 docs) | $0.27 |
| Tavily search (citations + plagiarism) | $0.01/search | 20/doc × 10 docs = 200 | $0.20 |
| Expand prose | $0.025 | 20/month | $0.06 |
| Scan explanations | $0.004 | 10/month | $0.04 |
| Plagiarism assessment | $0.013 | 50/month | $0.03 |
| Evaluate rewrite | $0.007 | 5/month | $0.02 |
| Citation verify (Gemini) | $0.0002 | 150/month | $0.003 |

**Suggest-rewrite is the #1 cost driver** because it runs on every flag with the most expensive model and highest output tokens. This is also the core product value, so it's worth the cost.

### Should any features be tier-gated?

**At current pricing, no.** Even a heavy user costs $2.63/month. However, if a free tier is ever added:

- **Free tier (scan only, no editing):** Cost: ~$0.04/user/month. Give users the AI risk score and flag list. Gate everything below behind the paywall.
- **Paywall gate these:** Suggest options, evaluate rewrites, citation verification, plagiarism, expand prose, Style Training preferences.

---

## 4. Top risks

### Risk 1: No rate limiting on LLM calls — CRITICAL

- **What:** Any authenticated user can trigger unlimited `/api/suggest`, `/api/scan`, `/api/rescore` calls.
- **Best-in-class:** Upstash rate limiter (free tier: 10K requests/day). Sliding window per user: 200 LLM calls/day, 20 calls/minute. ~5 minutes to implement.
- **Cheapest viable:** In-memory counter per user ID. Free, works for single-instance Vercel.
- **Tradeoff:** Upstash persists across function invocations. In-memory resets on cold starts (Vercel serverless functions restart frequently). Upstash is better.
- **Runaway scenario:** A script looping on `/api/suggest` at 10 req/sec for 1 hour = 36,000 calls × $0.026 = **$936 in one hour**.
- **Lock-in:** None — rate limiting is middleware.
- **Action required:** Must implement before production launch.

### Risk 2: No per-user monthly token budget

- **What:** No cap on cumulative tokens consumed per user.
- **Best-in-class:** Query `llm_call_log` for user's monthly total before each call. Soft warn at 80% of budget, hard stop at 100%. Budget: 1M output tokens/month (~$10.50 in Claude Sonnet cost — well above typical usage of ~150K tokens).
- **Cheapest viable:** Same approach — the `llm_call_log` table already exists.
- **Runaway scenario:** A user processing a 50,000-word document with comprehensive scan + full edit pass could use 500K tokens in one session (~$5.25). Not catastrophic but notable.
- **Action required:** Implement before production.

### Risk 3: Suggest-rewrite volume at scale

- **What:** Suggest-rewrite is the highest-cost call ($0.026 each) and runs 3x per flag. At 1,000 users × 15 flags × 10 docs × 3 options = 450,000 calls/month = ~$11,700/month in OpenRouter costs.
- **Best-in-class:** Cache options per (flaggedPhrase, patternType) pair. If the same phrase has been flagged before, reuse the cached options instead of calling OpenRouter again. "Furthermore" flagged in a professional doc should generate the same suggestions every time.
- **Cheapest viable:** Same — add a cache table keyed by (phrase, patternType, documentType).
- **Savings:** At 1,000 users, the phrase library has 242 entries. Most flags will hit the same entries repeatedly. Caching could reduce LLM calls by 60-80%, saving $7,000-9,000/month at scale.
- **Action required:** Implement before scaling past ~100 users.

### Risk 4: Tavily search costs at scale (if caching is skipped)

- **What:** Each citation check = 1 search ($0.01). Each plagiarism passage = 1 search. Without caching, the same citation checked across different users costs multiple times.
- **Best-in-class:** Cache search results by query hash for 7 days. "(Smith, 2023) Media and crime" searched by one user doesn't need re-searching when another user has the same citation.
- **Savings:** Heavy caching could reduce search volume by 50%+ for academic papers in the same subject area.
- **Cost without caching at 1,000 users:** ~$2,000/month. With caching: ~$800/month.

### Risk 5: Vercel serverless function timeout

- **What:** Comprehensive scan on a large document could exceed Vercel's function timeout (10 seconds on Hobby, 60 seconds on Pro). OpenRouter calls add latency.
- **Best-in-class:** Vercel Pro (included in your v0 subscription) gives 60-second timeout. Stream responses for long operations.
- **Current state:** Your v0 subscription should cover this. Verify the timeout setting in your Vercel dashboard.

---

## 5. Category-by-category review

### 1. LLM and AI Model Costs

**Status:** OpenRouter connected, 9 activity binds configured.

**Monthly cost at scale:**

| Users | LLM calls/month | OpenRouter cost | Per-user |
|---|---|---|---|
| 10 | ~4,500 | ~$50 | $5.00 |
| 100 | ~45,000 | ~$350* | $3.50 |
| 1,000 | ~450,000 | ~$2,500* | $2.50 |
| 10,000 | ~4,500,000 | ~$18,000* | $1.80 |

*With phrase-level caching reducing redundant calls by ~30% at 100 users, ~60% at 1,000, ~75% at 10,000.*

**Optimization opportunities:**
1. **Prompt caching** — ContextLLM system prompt (~4K tokens) is identical on every call. OpenRouter supports Anthropic prompt caching. Saves ~$1.75 per 1M cached input tokens. At 1,000 users: ~$800/month savings.
2. **Gemini Flash for simple tasks** — Surface scan explanations and flag classification don't need Claude Sonnet. Switching to Gemini Flash saves 95% on those calls.
3. **Phrase-level option caching** — Same flagged phrase + same document type = same suggestions. Cache and reuse.

**Verdict:** LLM costs are the #1 variable cost but well within margin. The three optimizations above would cut costs by 40-60% at scale.

### 2. Hosting and Deployment Costs

**Status:** Vercel v0 subscription at $20/month.

**What v0 includes:**
- v0 is primarily the AI code generation tool, but it includes Vercel Pro features
- Vercel Pro: 1TB bandwidth, 100GB-hours serverless compute, 60s function timeout, team features
- Unlimited deployments (preview + production)
- Custom domains

**Cost at scale:**

| Users | Monthly requests | Bandwidth | Vercel cost |
|---|---|---|---|
| 10 | ~5,000 | ~1 GB | $20 (subscription) |
| 100 | ~50,000 | ~10 GB | $20 |
| 1,000 | ~500,000 | ~100 GB | $20 |
| 10,000 | ~5,000,000 | ~500 GB | $20-40 (may need bandwidth addon) |

**Verdict:** Your v0 subscription covers hosting comfortably through at least 10,000 users. The serverless model means you pay nothing for idle time. The $20/month is essentially fixed infrastructure cost.

### 3. Browser and Scraping Costs

**Not applicable.** All web lookups go through Tavily search API, not browser automation. This is the right approach.

### 4. Search and Data APIs (Tavily)

**Status:** Planned, not yet implemented.

**Pricing:**
- Free tier: 1,000 searches/month
- Starter: $50/month for 10,000 searches
- Growth: $150/month for 50,000 searches
- Pay-as-you-go: $0.01/search on all tiers

**Cost at scale:**

| Users | Searches/month | Tavily cost | Per-user |
|---|---|---|---|
| 10 | ~2,000 | $0 (free tier + $10 overage) | $1.00 |
| 100 | ~20,000 | $50 (Starter) | $0.50 |
| 1,000 | ~100,000* | $150 (Growth) | $0.15 |
| 10,000 | ~500,000* | ~$2,500 | $0.25 |

*With search result caching reducing volume by 50%+*

**Split model approach (recommended):**
- **Gemini Flash** ($0.0002/call) formulates search queries and parses results
- **Claude Sonnet** ($0.013/call) only interprets results requiring judgment
- This means 80% of the search workflow runs on the cheap model

**Verdict:** Tavily is very cost-effective. Start on free tier, move to Starter at ~70 users. The search-result caching is the key optimization — same citation searched by multiple users should be cached.

### 5. Text-to-Speech and Speech-to-Text

**Not applicable.** No audio features.

### 6. Email, SMS, and Telephony

**Not applicable.** Supabase Auth handles transactional emails (signup, password reset) within its plan. No SMS or telephony.

### 7. Databases, Storage, and Data Transfer

**Status:** Supabase Pro at $25/month.

**Storage growth estimate:**

| Users | Documents | DB size | Supabase cost |
|---|---|---|---|
| 10 | ~100 | ~5 MB | $25 |
| 100 | ~1,000 | ~50 MB | $25 |
| 1,000 | ~10,000 | ~500 MB | $25 |
| 10,000 | ~100,000 | ~5 GB | $25 (within 8GB Pro limit) |

**Key tables by growth rate:**
1. `llm_call_log` — fastest growing. ~150 rows/user/month. At 1,000 users: 150K rows/month, 1.8M rows/year. **Add 90-day retention policy.**
2. `documents` + `sections` + `flags` — moderate. ~30KB per document.
3. `document_versions` — moderate. ~30KB per version, user-triggered.
4. `flag_options` — moderate. ~500 bytes per option.

**Verdict:** Supabase Pro ($25/month) covers the database through 10,000 users easily. No file storage is used (PDFs parsed server-side, only text stored). The only concern is `llm_call_log` growth — add retention.

### 8. Authentication and User Management

**Status:** Supabase Auth (included in Supabase Pro).

- **Pro tier limit:** 100,000 MAU
- **SSO providers:** Google + Apple (no additional cost)
- **Cost to scale:** $0 additional through 100K users

**Verdict:** No concerns. Supabase Auth is included and generous.

### 9. Monitoring, Logging, and Analytics

**Status:** No external monitoring. Internal `llm_call_log` table for LLM analytics.

**Recommendation for production:**
- **Sentry** ($26/month) for error tracking — worth it for a paid product
- **PostHog** (free tier, 1M events/month) for product analytics
- Total: ~$26/month fixed

### 10. Background Jobs, Queues, and Scheduled Tasks

**Not applicable.** All processing is request-driven. No always-on workers.

---

## 6. Quick wins (ordered by savings-to-effort ratio)

| # | Change | Monthly savings at 1,000 users | Effort |
|---|---|---|---|
| 1 | **Enable OpenRouter prompt caching** for ContextLLM system prompt | ~$800/month | Low — add `cache_control` to system message |
| 2 | **Cache suggest options** by (flaggedPhrase, patternType, docType) | ~$4,000-7,000/month | Medium — new cache table + lookup before calling OpenRouter |
| 3 | **Use Gemini Flash for surface scan explanations** | ~$400/month | Low — change one model binding in admin |
| 4 | **Cache Tavily search results** by query hash (7-day TTL) | ~$500-1,000/month | Medium — new cache table |
| 5 | **Add per-user daily rate limit** (200 LLM calls/day) | Prevents $1,000+ abuse incidents | Medium — Upstash or in-memory limiter |
| 6 | **Add llm_call_log retention** (90 days) | Prevents DB growth (~$0 savings but operational health) | Low — scheduled DELETE query |

---

## 7. Fixed costs summary (monthly)

| Service | Cost | What it covers |
|---|---|---|
| Vercel v0 | $20 | Hosting, deployments, Pro features |
| Supabase Pro | $25 | PostgreSQL, Auth, 8GB database |
| Sentry (recommended) | $26 | Error tracking |
| Tavily (at 100+ users) | $50-150 | Web search for citations + plagiarism |
| **Total fixed** | **$71-221** | |

**Breakeven on fixed costs:** At $15/month per user with 91% gross margin: need **5-16 paying users** to cover all fixed costs. At $9/month annual: need **8-25 users**.

---

## 8. Cost at scale — the big picture

| Users | OpenRouter | Tavily | Stripe fees | Supabase | Vercel | Sentry | Total cost | Total revenue (mixed) | Margin |
|---|---|---|---|---|---|---|---|---|---|
| 10 | $50 | $10 | $74 | $25 | $20 | $26 | **$205** | $1,200 | 83% |
| 100 | $350 | $50 | $740 | $25 | $20 | $26 | **$1,211** | $12,000 | 90% |
| 1,000 | $2,500 | $150 | $7,400 | $25 | $20 | $26 | **$10,121** | $120,000 | 92% |
| 10,000 | $18,000 | $2,500 | $74,000 | $75 | $40 | $26 | **$94,641** | $1,200,000 | 92% |

*Revenue assumes 70% monthly ($15) / 30% annual ($9) mix. Stripe fees are the largest "cost" at scale but they're unavoidable payment processing.*

**Without Stripe fees:**

| Users | All costs except Stripe | Revenue | Margin |
|---|---|---|---|
| 1,000 | $2,721 | $120,000 | **98%** |
| 10,000 | $20,641 | $1,200,000 | **98%** |

The product has exceptional unit economics. LLM costs are the only meaningful variable cost, and they scale sub-linearly with caching.

---

## 9. Runaway risk audit

| # | Risk | Severity | Current protection | Needed |
|---|---|---|---|---|
| 1 | **Unbounded LLM calls** — no rate limit | CRITICAL | None | Per-user: 200/day, 20/minute |
| 2 | **No monthly token budget** | HIGH | None | Cap at 1M output tokens/user/month via llm_call_log check |
| 3 | **Fallback chain retry** | HIGH | Each model tried once (correct) | Verify no retry wrapper is added around executeActivity() |
| 4 | **Large document upload** | MEDIUM | Min 50 chars check only | Add max: 100K chars (~20K words). Prevents token budget exhaustion |
| 5 | **Tavily search loop** | MEDIUM | Not yet implemented | Cap at 50 searches per document when implemented |
| 6 | **OpenRouter spend cap** | MEDIUM | None | Set a monthly spend cap in OpenRouter dashboard ($100 to start, raise as you scale) |
| 7 | **Vercel function timeout** | LOW | 60s on Pro (your v0 plan) | Monitor — comprehensive scans on 10K+ word docs could be slow |
| 8 | **Supabase connection pool** | LOW | No limit set | Add `max: 10` to postgres connection in db/index.ts |

**Most important action before going live:** Set an OpenRouter spend cap in their dashboard. This is the single most effective protection against runaway costs — it hard-stops all API calls when the cap is hit, regardless of what bugs exist in the code.

---

*Pricing referenced in this report is approximate as of April 2026. OpenRouter, Tavily, Supabase, Vercel, and Stripe pricing changes frequently — verify before making cost-sensitive decisions.*
