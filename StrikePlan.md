# Stripe Implementation Plan — EzSay

**Status:** Ready to start
**Estimated effort:** 5–7 working days end-to-end
**Author:** Claude Code (per the priority plan in `~/.claude/plans/if-i-were-to-vast-gem.md`)
**Last updated:** 2026-04-24

---

## 1. Context

EzSay's pricing page is shipped (`app/pricing/page.tsx`) with two tiers — **Individual** ($12/mo, $9.96/mo billed yearly) and **Professional Editor** ($60/mo, $49.80/mo billed yearly). Auth Phase 1 just completed (login/signup, password reset, email verification, Google SSO).

The next gate to revenue is hooking those pricing buttons to a real Stripe checkout, recording subscription state in the database via webhooks, and gating paywalled routes (`/edit`, `/upload`, etc.) on that state. Without this, the product cannot collect a dollar.

This plan covers everything from a clean-room start (no Stripe account configured yet) through a production-ready subscription system.

---

## 2. What's already in place

| Item | Where | Status |
|---|---|---|
| `stripe` npm package v22.0.2 | `package.json:29` | Installed |
| Schema fields | `db/schema.ts:134-136` (`stripeCustomerId`, `subscriptionStatus`, `subscriptionPlanId` on profiles) | Defined, never written to |
| Paywall modal UI | `components/ui/PaywallModal.tsx` | Designed, `handleSubscribe()` is an `alert()` stub at lines 16–22 |
| Webhook skeleton | `app/api/webhooks/stripe/route.ts` | Empty handler, no signature verification, no event branches |
| Pricing page CTAs | `app/pricing/page.tsx` | Currently `/signup?plan=...` placeholder hrefs |
| Subscription gate TODO | `app/results/[docId]/page.tsx:112` | `// TODO: Check subscription status` comment only |
| Env vars | `.env.example` | No `STRIPE_*` keys defined |

---

## 3. Architectural decisions (opinionated)

| Decision | Choice | Why |
|---|---|---|
| Checkout UI | **Stripe Checkout (hosted)** — not Stripe Elements | Drop-in, no PCI scope, ~10× less code than Elements. Industry standard for SaaS subscriptions. We can migrate to Elements later if branded checkout becomes a priority. |
| Subscription mgmt UI | **Stripe Customer Portal** (hosted) for cancel/upgrade/payment-method | Same reason — Stripe owns the page, we just redirect to it. |
| Plan structure | **One Stripe Product per tier, two Prices per Product** (monthly + yearly) → 2 products × 2 prices = 4 Price IDs | Cleaner than coupons. Each Price has its own ID we pass to Checkout. |
| Annual discount | Encoded as a separate yearly Price with the discounted amount baked in | No coupon logic in the codebase; Stripe shows the right number. |
| Trials | **No free trial in V1** (matches the pricing page — we already removed the "14-day trial" copy) | Reduces complexity. Easy to add later via `subscription_data.trial_period_days` on Checkout. |
| Source of truth for subscription state | **Postgres via webhooks** | Never read subscription state from the client; never trust `success_url` query params. Webhook events drive `profiles.subscriptionStatus`. |
| Webhook idempotency | Process events with explicit handlers per `event.type`; rely on Stripe's at-least-once delivery being safe because writes are idempotent (upserts on `stripeCustomerId`) | No need for an event-log table in V1. |
| Test mode | Use Stripe **test keys** locally and in staging; switch to live keys only at production launch | Standard Stripe pattern. |

---

## 4. Phased plan

### Phase 0 — Stripe dashboard setup (manual, ~1 hour)

**You do this in the Stripe dashboard, not in code.** Do it first; everything below depends on the IDs and keys generated here.

1. Create / sign in to a Stripe account in **test mode**.
2. **Settings → Branding** — upload `public/brand/ezsay-lockup-black.svg` and set brand colour.
3. **Products** → create two products:
   - **Individual** with two prices: $12.00/mo (recurring monthly) and $9.96/mo billed annually ($119.52/yr)
   - **Professional Editor** with two prices: $60.00/mo (recurring monthly) and $49.80/mo billed annually ($597.60/yr)
4. Copy the four **Price IDs** (`price_xxx…`).
5. **Developers → API keys** — copy the test publishable key (`pk_test_…`) and secret key (`sk_test_…`).
6. **Developers → Webhooks** — add endpoint `http://localhost:3000/api/webhooks/stripe` (for local), select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   Copy the **Signing secret** (`whsec_…`).
7. **Settings → Customer Portal** — enable cancellation, payment method updates, plan upgrades/downgrades. Allow "switch to" between the four prices created above.

**Output of Phase 0**: a sticky note (or 1Password entry) with 4 Price IDs, 1 publishable key, 1 secret key, 1 webhook signing secret.

---

### Phase 1 — Env vars + Stripe SDK clients (~half a day)

**Files to create:**

- `lib/stripe/server.ts` — server-side Stripe SDK instance
  ```ts
  import Stripe from "stripe";
  export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-09-30.acacia",
  });
  ```
- `lib/stripe/client.ts` — `loadStripe` wrapper for client-side redirect-to-Checkout
  ```ts
  import { loadStripe, type Stripe } from "@stripe/stripe-js";
  let stripePromise: Promise<Stripe | null>;
  export const getStripe = () => {
    if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
    return stripePromise;
  };
  ```
- `lib/stripe/prices.ts` — central map from plan + billing → Stripe Price ID
  ```ts
  export const PRICE_IDS = {
    individual: { monthly: "price_xxx", yearly: "price_xxx" },
    professional: { monthly: "price_xxx", yearly: "price_xxx" },
  } as const;
  ```

**Files to modify:**

- `package.json` — add `@stripe/stripe-js` (client-side SDK)
- `.env.example` — add:
  ```
  # Stripe
  STRIPE_SECRET_KEY=
  STRIPE_WEBHOOK_SECRET=
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
  STRIPE_PRICE_INDIVIDUAL_MONTHLY=
  STRIPE_PRICE_INDIVIDUAL_YEARLY=
  STRIPE_PRICE_PROFESSIONAL_MONTHLY=
  STRIPE_PRICE_PROFESSIONAL_YEARLY=
  ```
- `.env.local` (untracked) — fill in real values from Phase 0
- `db/schema.ts` — add three columns to the `profiles` table:
  - `stripeSubscriptionId: text` (nullable) — distinct from plan ID, lets us call Stripe API for this user
  - `subscriptionPriceId: text` (nullable) — which of the 4 prices they're on
  - `subscriptionPeriodEnd: timestamp` (nullable) — when current period ends; powers "renews on…" UI and access cutoff for canceled-but-still-paid users
- Generate + run migration via `npm run db:generate && npm run db:migrate`

**Verification:**
```bash
npm run db:generate  # confirms migration plan
npm run db:migrate   # applies to Supabase
node -e "import('@stripe/stripe-js').then(m => console.log(typeof m.loadStripe))"  # client SDK loads
```

---

### Phase 2 — Checkout endpoint (~half a day)

**File to create:** `app/api/stripe/checkout/route.ts`

**Behaviour:**
- POST endpoint, takes `{ priceId: string }` from body
- Auth via Supabase session (returns 401 if unauthed)
- Looks up the user's `stripeCustomerId`. If missing, creates a new Stripe Customer with the user's email and persists the ID to `profiles.stripeCustomerId`
- Creates a Checkout Session:
  ```ts
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/w?subscribed=1`,
    cancel_url: `${origin}/pricing`,
    allow_promotion_codes: false,
    billing_address_collection: "auto",
  });
  ```
- Returns `{ url: session.url }` for client-side redirect

**Frontend wiring:**

- `app/pricing/page.tsx` — replace the `<Link href={"/signup?plan=…"}>` CTAs with a button that:
  1. If unauthed → redirect to `/login?redirect=/pricing`
  2. If authed → POST to `/api/stripe/checkout` with the resolved Price ID for the selected billing → `window.location.href = url`
- `components/ui/PaywallModal.tsx:16-22` — replace the `alert()` stub with the same flow

**Verification:**
1. Log in as a test user
2. Click "Start Individual" with monthly billing
3. Land on Stripe Checkout (test mode shows test-card prompt)
4. Use card `4242 4242 4242 4242`, any future expiry, any CVC
5. Confirm payment → redirected to `/w?subscribed=1`
6. (Subscription state in DB still empty — webhook lands that in Phase 3)

---

### Phase 3 — Webhook handler (~1 day)

**File to refactor:** `app/api/webhooks/stripe/route.ts` (currently skeleton)

**Behaviour:**

```ts
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();           // RAW body required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":           // initial purchase
    case "customer.subscription.updated":        // plan changes, renewal
    case "customer.subscription.deleted":        // canceled at period end (deletion = canceled)
    case "invoice.payment_succeeded":            // renewal succeeded
    case "invoice.payment_failed":               // payment issue
      await syncSubscriptionToDb(event);
      break;
    default:
      // ignore — we don't care about most events
  }

  return new Response("ok", { status: 200 });
}
```

**`syncSubscriptionToDb` logic:**

- Resolve the Stripe Customer (`event.data.object.customer`) → look up `profiles` by `stripeCustomerId`
- For subscription events: read `subscription.status`, `subscription.items.data[0].price.id`, `subscription.current_period_end`
- Upsert into `profiles`:
  - `subscriptionStatus`: one of `active | trialing | past_due | canceled | incomplete | unpaid`
  - `subscriptionPriceId`: the active Price ID
  - `stripeSubscriptionId`: subscription ID
  - `subscriptionPeriodEnd`: `new Date(subscription.current_period_end * 1000)`

**Important Next.js detail:** for raw body access, the route needs `export const runtime = "nodejs"` and the body must be read with `await req.text()` (not `req.json()`). Stripe's signature is computed over the literal bytes — any JSON re-serialization breaks verification.

**Local testing setup:**

- Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
- `stripe login`
- In one terminal: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — this prints a `whsec_…` secret; use that as `STRIPE_WEBHOOK_SECRET` for local dev (the dashboard secret is for production)
- In another terminal: `stripe trigger checkout.session.completed` to test

**Verification:**
1. Run dev server + `stripe listen` together
2. Repeat the Phase 2 flow (real checkout in test mode)
3. Confirm webhook hits, signature verifies, DB row updates with `subscriptionStatus="active"` and the right Price ID
4. Trigger `stripe trigger customer.subscription.deleted` → confirm DB shifts to `canceled`

---

### Phase 4 — Access gate (~half a day)

**Helper:** `lib/subscription/check.ts`

```ts
export async function getSubscriptionStatus(userId: string) {
  const profile = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return {
    status: profile[0]?.subscriptionStatus ?? "none",
    isActive: profile[0]?.subscriptionStatus === "active" || profile[0]?.subscriptionStatus === "trialing",
    plan: profile[0]?.subscriptionPriceId,
    periodEnd: profile[0]?.subscriptionPeriodEnd,
  };
}
```

**Wire into routes:**

- `app/results/[docId]/page.tsx:112` (the TODO) — if not active, render the existing PaywallModal
- `app/edit/[docId]/page.tsx` (or wherever the editor route lives, may be inside `/w`) — server-side guard: if not active, redirect to `/pricing`
- `app/api/suggest/route.ts`, `app/api/evaluate/route.ts`, `app/api/citations/route.ts` (verify action), `app/api/rescore/route.ts` — return 402 if not active (per CLAUDE.md "API conventions")

**Important — match the PRD's existing constraint exactly:**

CLAUDE.md says:
> Paywalled routes (`edit`, `suggest`, `evaluate`, `citations/verify`, `rescore`) check Stripe subscription server-side — unsubscribed → 402

So the gate is server-only. Never trust the client to know if a user is subscribed.

**Verification:**
- As an unsubscribed user, hit `/edit/<docId>` → expect redirect or paywall
- As an unsubscribed user, POST to `/api/suggest` → expect 402
- As a subscribed user, both work

---

### Phase 5 — Customer Portal (~half a day)

**File to create:** `app/api/stripe/portal/route.ts`

```ts
const session = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${origin}/w`,
});
return Response.json({ url: session.url });
```

**Frontend:** add a "Manage subscription" link/button somewhere — likely a small section in the workspace nav rail's settings, or a `/account` page if that exists. POSTs to `/api/stripe/portal`, opens `session.url`.

**Verification:** click button → Stripe portal opens → cancel subscription → land back at `/w` → webhook fires → DB shows `canceled`. User retains access until `subscriptionPeriodEnd`.

---

### Phase 6 — End-to-end QA + production prep (~1 day)

**Test matrix (test mode):**

| Scenario | Expected |
|---|---|
| New user signs up → /pricing → checkout monthly Individual → success | DB: `active`, Individual monthly Price ID, `periodEnd` ~30 days out. `/edit` accessible. |
| Subscribed user clicks "Manage subscription" → cancels in portal | DB: `canceled` at period end. `/edit` still accessible until `periodEnd`. |
| Card declines (use test card `4000 0000 0000 0002`) | DB: stays empty or shifts to `incomplete`. Paywall stays up. |
| Renewal fails (test via `stripe trigger invoice.payment_failed`) | DB: `past_due`. Render banner. |
| User subscribed → upgrades plan in portal | DB: new `subscriptionPriceId`. |
| Webhook arrives for unknown customer (e.g., test event) | Handler logs and returns 200 (don't 500 on Stripe — they retry forever). |

**Production switch:**

1. In Stripe dashboard, **toggle to live mode**, repeat Phase 0 in live mode (Products, Prices, webhook endpoint pointing at production URL)
2. Update production env vars in Vercel: live `STRIPE_*` keys + live Price IDs
3. Redeploy
4. Smoke test: real card, $1 plan if you create one, confirm live webhook hits production DB

**Risk: do not commit live keys to the repo.** Live keys go in Vercel env vars only.

---

## 5. Critical files (recap)

**Create:**
- `lib/stripe/server.ts`
- `lib/stripe/client.ts`
- `lib/stripe/prices.ts`
- `lib/subscription/check.ts`
- `app/api/stripe/checkout/route.ts`
- `app/api/stripe/portal/route.ts`

**Modify:**
- `package.json` (add `@stripe/stripe-js`)
- `.env.example` (add `STRIPE_*`)
- `db/schema.ts` (3 new columns on `profiles`)
- `app/api/webhooks/stripe/route.ts` (real implementation)
- `app/pricing/page.tsx` (CTAs → checkout)
- `components/ui/PaywallModal.tsx` (`handleSubscribe` → checkout)
- `app/results/[docId]/page.tsx` (gate at line 112)
- `app/api/suggest/route.ts`, `app/api/evaluate/route.ts`, `app/api/citations/route.ts`, `app/api/rescore/route.ts` (402 if unsubscribed)
- `middleware.ts` — optional: server-side `/edit/*` redirect to `/pricing` if not active

**Update PRD:**
- `PRD.md` Section 16 ("What's next") — flip Stripe row from "High priority" to "Done"
- `PRD.md` Section 17 (env vars) — confirm all `STRIPE_*` are listed
- `PRD.md` add a new Section 20 if helpful: Subscription state machine + access matrix

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Webhook signature verification fails because Next.js parses body as JSON | Use `await req.text()` + `runtime: "nodejs"`; never parse before verifying |
| Race: user finishes Checkout → success_url redirect happens before webhook lands → user sees paywall on `/w` | Don't gate `/w` itself on subscription. The success_url query `?subscribed=1` lets us show a "subscription activating…" banner that polls the DB or refreshes after a few seconds. Webhook usually arrives within 1–2s. |
| Stripe Customer is created but checkout abandons | Harmless. The Customer just sits idle; no subscription = no charge = no DB write. Reused on next attempt. |
| User cancels → loses access immediately when they should keep it until period end | Gate on `subscriptionPeriodEnd > now()` instead of just `status === "active"`. `canceled` users with future `periodEnd` still get access. |
| Live keys leaked to repo | `.env.local` is in `.gitignore` (verify). Live keys live in Vercel env vars only. Pre-commit hook to grep for `sk_live_` is a future hardening. |
| Test webhook events from `stripe trigger` reference customers we don't have | Handler must `return 200` for unknown customers, not throw. Stripe retries 5xx for days. |
| Plan price changes mid-subscription (e.g., we raise the Individual price to $15) | Existing subscribers stay on their old Price. New subscribers get the new Price. Stripe handles this — we just create a new Price object and update `lib/stripe/prices.ts`. |

---

## 7. Verification — full happy path

```
# Pre-flight
npm run db:generate
npm run db:migrate
echo "STRIPE_*" >> .env.local  # filled with real test-mode values

# Local servers
npm run dev                                                  # terminal 1
stripe listen --forward-to localhost:3000/api/webhooks/stripe  # terminal 2

# Manual test in browser:
#  1. Sign up at /signup with a new email
#  2. Confirm email (Supabase) and log in
#  3. Visit /pricing → click "Start Individual" (monthly toggle)
#  4. Stripe Checkout opens → use 4242 4242 4242 4242
#  5. Land at /w?subscribed=1
#  6. In terminal 2, see the webhook fire — checkout.session.completed
#  7. Query Supabase: SELECT subscription_status, subscription_price_id FROM profiles WHERE email=...
#       expect: active, price_xxx (Individual monthly)
#  8. Visit /edit/<some-doc-id> — expect access (not paywall)
#  9. Click "Manage subscription" → cancel in portal
# 10. Webhook fires customer.subscription.deleted (or .updated with cancel_at_period_end)
# 11. DB shows canceled, subscriptionPeriodEnd = ~30 days out
# 12. /edit still accessible (still inside paid period)
# 13. (Optional) stripe trigger invoice.payment_failed → DB shifts to past_due → banner appears
```

If all 13 steps pass, ship to production with live keys.

---

## 8. Time budget summary

| Phase | Estimate |
|---|---|
| Phase 0 — Stripe dashboard setup | 1 hour |
| Phase 1 — Env + SDK + schema migration | 0.5 days |
| Phase 2 — Checkout endpoint + frontend wiring | 0.5 days |
| Phase 3 — Webhook handler | 1 day |
| Phase 4 — Access gate | 0.5 days |
| Phase 5 — Customer Portal | 0.5 days |
| Phase 6 — QA + production switch | 1 day |
| **Total** | **~4–5 working days of code + 1–2 days buffer** |

This is the path to revenue. Once shipped, EzSay can charge for the Individual and Professional Editor plans on the pricing page.
