# Acquisition Phase A — ranked path to qualified buyers (#196)

**Status:** read-only audit complete (2026-08-07)  
**Baseline SHA:** `f60f1002fe23d94146f1760eb673d569878c6bdb`  
**Scope:** repository + public production (`starmapco.com`) evidence only  
**Not in this lane:** #215 conversion/measurement; #212/#213 payment-drop diagnosis (reuse, do not re-litigate)

External provider aggregates (Resend/SendGrid delivery, Stripe recovered payments, GSC clicks, referral economics, KV subscriber counts) are **`unverified`** in this environment — no `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `PRINT_ADMIN_TOKEN`, or GSC credentials were available.

---

## 1. Usable today vs stale / broken / unverified

| System | Classification | Evidence | Owner / trigger / state / suppression / success / failure |
| --- | --- | --- | --- |
| SEO money + occasion + city landings → `/editor` | **Live and working** (surface) | Public `200` on `/`, `/wedding`, `/anniversary`, `/birthday`, `/personalized-star-map`, `/star-map-gift`, `/star-map-for/*`, `/star-map-in/*`; sitemap **87** URLs; robots allows landings, disallows `/editor` | Owner: storefront. Trigger: organic/direct visit. State: static routes + `seoIndexing` allowlists. Suppression: non-allowlisted city/occasion → `notFound()`. Success: `preview_started` / checkout with `source=*`. Failure: thin/competing pages, CTA without location (below). GSC demand: **unverified**. |
| Homepage promo capture (`PromotionSignup` → `/api/promotions/subscribe`) | **Built; live UI present; delivery unverified** | Home HTML includes `promotions/subscribe` + email field; KV/state/code in `promotionSubscriptions.ts` / `promotions.ts`; welcome Resend→SendGrid→webhook; 24h print-tips schedule | Owner: growth. Trigger: form POST. State: `promotions:email:<email>`. Suppression: honeypot, IP rate limit, unsubscribe HMAC. Success: subscribe + coupon send. Failure: provider none / schedule reject. Sends/clicks/purchases: **unverified**. |
| Checkout-expiry recovery | **Built; Resend-only; live outcomes unverified** | Code is **Resend-only** with success-only delivered marker + ~20h safe retry window (`checkoutRecoveryAlerts.ts`). Milestone-1 note about pre-send dedupe/SendGrid is **stale** vs current main. | Owner: commerce. Trigger: Stripe `checkout.session.expired`. State: session KV + `stripe:checkout_recovery:email_delivered:*`. Suppression: no email/recovery URL, past retry window, already delivered. Success: recovery click → paid. Failure: not_configured / terminal / retryable 503. Delivery & recovered pay: **unverified**. |
| Referral loop | **Built; economics unverified** | APIs, cookies, caps, ledger, success/download share UI present; friend promo IDs not in committed `wrangler.toml` vars | Owner: growth. Trigger: `?ref=` + paid webhook. State: `referral:*` KV. Suppression: self-ref, caps, ineligible order. Success: referred paid order − reward cost. Failure: inactive code / reverse on refund. Traffic & margin: **unverified**. |
| Bulk & event orders | **Live route; ops depth unverified** | Public `200` `/bulk-event-orders` with quote form; footer/sitemap include route; `BULK_EVENT_ORDERS_ENABLED=true` in `wrangler.toml`. Playbook “off by default” is **doc drift**. `ops:bulk-quotes` npm script **missing**. | Owner: assisted sales. Trigger: form → `/api/bulk-quotes`. State: `bulk:quote:<uuid>`. Suppression: flag off, honeypot, rate limit. Success: alert delivered + status progress. Failure: alert provider miss / no status CLI. Lead volume & SLA: **unverified**. |
| Proof / testimonials | **Partial / effectively empty live** | Mailto capture + runbooks exist; `testimonials.ts` has only `isSample: true` wedding quote; UI filters samples out → **no published proof** on money pages | Owner: ops/content. Trigger: post-purchase mailto. State: email inbox → manual file edit. Suppression: consent required. Success: non-sample publish. Failure: empty store. Published count = **0** (repo). |
| Google Merchant feed | **Feed live; Merchant Center status unverified** | `https://starmapco.com/merchant-feed.xml` returns **200** with 3 print SKUs linking to `/star-map-poster`; tooling/docs exist | Owner: shopping. Trigger: Merchant crawl. State: feed file + GMC. Success: approved listings → clicks → editor. Failure: limited/disapproved. Approval/clicks: **unverified**. |
| Stale / duplicated docs & UI | **Duplicated/stale** | `PROMO-SETUP-COMPLETE.md` / campaign docs contradict `FIRST50`; unused `PromotionForm.tsx`; bulk playbook vs wrangler flag; social playbooks prescribe high-volume TikTok/IG without production proof | Do not treat as live acquisition systems. |

**Boundary with #212/#213/#215:** production evidence already shows checkout sessions create reliably but payments are near-zero. Acquisition must not dump undifferentiated top-of-funnel traffic into that bottleneck. Prefer **already-intent visitors** and **recoverable abandoners**.

---

## 2. Three highest-confidence no/low-cost ways to bring qualified buyers

Ranked by `expected contribution impact × evidence confidence ÷ cost/risk` using only observed evidence (no invented volumes).

### A. Fix city SEO → editor location handoff (highest confidence)

**Why:** 26 indexable city pages are live and CTA-rich, but `PreviewStartForm` on `/star-map-in/[slug]` does **not** prefill the city. Sticky/bottom CTAs open `/editor` with `source=` only — **no `location=`**. Editor already hydrates `location` from the query string (`EditorExperience`). This is a proven intent leak on pages whose topic *is* the location.

**Cost/risk:** small UI change; no offers, providers, or ads.  
**Confidence:** high (code + live HTML).

### B. Verify/activate checkout recovery (highest intent, medium confidence)

**Why:** recovers people who already reached Stripe checkout — closest to a qualified buyer without new traffic. Code path is substantially more correct than the milestone-1 note (Resend idempotency + post-success delivered marker).

**Cost/risk:** ops read-only check first (`RESEND_API_KEY`, webhook coverage, aggregate recovered payments). No copy/offer change until evidence.  
**Confidence:** medium (implementation strong; production delivery **unverified**).

### C. Confirm Google Merchant Center approval on the existing feed (external, low cost)

**Why:** feed and product URLs already exist; Shopping is high-intent “buy custom print” demand adjacent to the funnel. Unlike TikTok/IG/Etsy, this reuses shipped assets.

**Cost/risk:** read-only GMC status check; no new listings invented here.  
**Confidence:** medium-low on revenue (feed live; approval **unverified**).

**Explicitly not in the top 3 right now**

- Paid ads / TikTok daily posting — high cost, no performance evidence; conflicts with payment bottleneck.  
- Referral offer changes — economics **unverified**.  
- Expanding thin city/occasion inventory — allowlists already limit indexation; expand only after GSC proof.  
- Proof/UGC automation — capture exists; empty store is an ops/content gap, not the first growth lever while payments fail.

---

## 3. SEO / landing / internal-link gaps (high-intent → editor)

Observed on production:

1. **City pages drop location intent** — form empty; sticky CTA `/editor?mode=quick&source=sticky-city-…` without `location=`; bottom framed CTA likewise. Editor supports `?location=` today.
2. **City ↔ money-page linking is thin** — NY page links a few occasions + `/wedding`/`/birthday`, but not a strong ladder into `/personalized-star-map` / framed proof paths beyond generic CTAs.
3. **Blog CTA inconsistency** — several gift posts use bare `/editor?mode=quick` (no `source=`), and multiple posts have **no in-body editor CTA** (only site-nav). High-intent gift posts under-attributed.
4. **Social proof absent on landings** — `TestimonialHighlights` hides samples; published verified quotes = 0.
5. **GSC demand unknown** — tooling exists (`seo:gsc-snapshot`); credentials unavailable → cannot rank which city/occasion/blog URLs earn clicks. Do not delete or mass-expand SEO surface without that read.
6. **Sitemap is intentionally constrained** — 26/79 locations and 12/44 occasions indexable (plus canonical `/wedding` `/anniversary` `/birthday`). That is good hygiene, not a missing-page emergency.

Money pages (`/wedding`, `/anniversary`, occasion templates) already have dense sourced editor CTAs including print variants — **not** the primary gap.

---

## 4. External high-intent / low-cost channels (comparison only)

| Channel | Fit to custom star-map gifts | Repo/production readiness | Cost/risk | Verdict vs on-site SEO/email/referral |
| --- | --- | --- | --- | --- |
| Google Merchant / Shopping | High (product intent) | Feed live (3 SKUs → `/star-map-poster`); GMC status **unverified** | Low if already configured | Best external candidate to **check**, not invent |
| Pinterest organic | High (visual gift discovery) | Playbook + pin copy exist; live performance **unverified** | Content time; posting is a mutation | Strong later; not first without baseline |
| Bulk/event assisted sales | High (B2B/events) | Route+form live | Operator time; alert config **unverified** | Keep as assisted path; not the first experiment |
| Wedding marketplace / planner partnerships | Medium-high | No implemented partner funnel | Outreach + brand risk | Out of scope until on-site leaks fixed |
| Etsy / Amazon handmade | Medium | No tooling | Policy, fees, creative duplication | Do not start now |
| TikTok / IG Reels | Medium (awareness) | Playbooks prescribe high volume | High content cost; low evidence | Defer while checkout→pay is broken |

---

## 5. First growth experiment (single)

### Experiment: City landing location prefill + location-bearing CTAs

**Hypothesis:** Visitors on `/star-map-in/{city}` already signaled location intent. Prefilling that city into `PreviewStartForm` and appending `location=` on city sticky/bottom editor links will raise city-sourced `preview_started` (and downstream editor engagement) without buying traffic.

**Smallest implementation scope**

- Add optional `defaultLocation` (and display string from `formatLocationDisplay`) to `PreviewStartForm`; set `defaultValue` on the location input for city pages only.
- Append `location=<encoded display>` to city-page sticky primary CTA and bottom framed CTA hrefs (editor already reads it).
- Keep date required (no invented dates).
- Do **not** change offers, pricing, ads, SEO allowlists, or non-city templates.

**Primary metric:** city-sourced `preview_started` count (sources matching `city-*` / `sticky-city-*` / `star-map-in-*-cta-*`) per week, vs prior 2-week baseline from existing funnel/analytics.

**Secondary:** city-landing → `/editor` clicks that arrive with non-empty `location` query (can be validated in QA; production aggregate may need existing `preview_start_submit.hasLocation` if emitted).

**Guardrails**

- No change to checkout, Stripe, promo codes, or referral offers.  
- Prefill is editable; user can clear/override.  
- Name-only location prefill must still require a real date before submit (existing validation).  
- If geocode/coords are required for render quality, follow-up is a separate issue — do not block this experiment on full geocode automation.  
- Do not expand indexable city list in the same change.

**Stop rule**

- Stop/iterate if after the observation window city-sourced `preview_started` is flat/down **and** QA shows prefill not reaching the editor, or if support reports wrong-city confusion (> anecdotal threshold: any confirmed wrong-city render from prefill).  
- Do not “fix” by adding more cities or ads.

**Observation window:** 14 days post-deploy (or 100 city-sourced preview starts, whichever first), read at day 3 for instrumentation sanity and day 14 for decision.

**Expected time-to-signal:** 3–14 days (depends on organic city traffic; volume **unverified** without GSC).

**Why this beats alternatives as #1**

- Evidence of the gap is direct (live pages + code), not assumed.  
- Touches visitors who already asked for a city star map.  
- Avoids fighting #215’s payment diagnosis with more cold traffic.  
- Smaller than recovery/Merchant work that still needs secret-backed verification.

---

## 6. Exact child issue (draft — create when implementing)

> **Title:** Prefill city SEO landing location into editor CTAs (#196 follow-on)  
> **Parent:** #196  
> **Risk:** Low–medium (customer-facing UI; no payments)  
> **Lane:** acquisition (not #215)

**Problem**  
Indexable `/star-map-in/[slug]` pages ask users to re-type the city they already chose. Sticky/bottom CTAs omit `location=`, discarding intent the editor can already hydrate.

**Scope**

1. `PreviewStartForm`: optional `defaultLocation` prop → location input `defaultValue`.  
2. City page passes `formatLocationDisplay(location)`.  
3. City sticky + bottom editor links include `location` query param.  
4. Focused unit/Playwright or component test: city href/form carries location.  
5. No allowlist expansion, no offer changes, no provider changes.

**Out of scope:** geocode lat/lng automation, blog CTA sweep, Merchant Center, recovery email, testimonials.

**Acceptance**

- On a sample city page, location field shows the city display string before interaction.  
- Sticky/bottom CTAs include `location=` matching that string.  
- Editor loads with location name populated from query when using those CTAs.  
- Date still required for PreviewStartForm submit.  
- CI: lint, typecheck, unit, build as required for UI change.

**Measurement:** compare city-sourced `preview_started` 14d before/after; document baseline SHA.

---

## 7. Cleanup notes (no deletions this phase)

| Path / item | Action |
| --- | --- |
| `PromotionSignup` + `/api/promotions/*` + KV | **Retain** |
| `checkoutRecoveryAlerts` Resend-only path | **Retain**; treat milestone-1 SendGrid/pre-send claim as outdated |
| Referral APIs + success share | **Retain**; no offer change until `qa:referral-loop` evidence |
| `/bulk-event-orders` + API | **Retain**; reconcile playbook vs `BULK_EVENT_ORDERS_ENABLED=true`; restore or remove claimed `ops:bulk-quotes` |
| `PromotionForm.tsx`, stale `PROMO-*.md` | **Deprecate/delete candidates** (later PR) |
| Sample-only testimonials | **Retain structure**; publish real quotes via existing runbook before building automation |
| SEO allowlists | **Retain**; do not mass-index remaining 53 cities / 32 occasions without GSC |

---

## 8. Blockers for deeper evidence

| Need | Why |
| --- | --- |
| Resend + Stripe read-only | Recovery send/recovered-payment aggregates |
| GSC credentials | Rank which landings earn impressions/clicks |
| `PRINT_ADMIN_TOKEN` / funnel admin | Subscriber + referral aggregate reads without raw PII |
| GitHub `issues:write` for this agent | Post this report as an issue comment on #196 (403 with current token) |
