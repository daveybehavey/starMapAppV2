# STAR-001 Live Revenue Readiness Audit

Date: 2026-06-25

Repo: `C:\Users\david\Desktop\starMapAppV2\star-map-app-final`

## 1. Executive Summary

**Confirmed:** StarMapCo has meaningful live revenue infrastructure in place: Stripe checkout, Printful verification, merchant feed validation, sitemap/canonical checks, funnel counters, checkout diagnostics, print ops reporting, and payment-method audit scripts.

**Passed:** The read-only checks that were safe to run mostly passed:

- Live sitemap health passed.
- Live Merchant feed health passed.
- Stripe account/payment-method audit passed.
- Printful store and variant verification passed.
- Stripe paid sessions reconciled exactly with `payment_verified`.
- Sampled live public pages showed no mojibake in served HTML.

**Needs manual check:** Paid ads should remain **no-go for scaling** until the checkout/funnel interpretation issue is resolved and a full print customer experience matrix is manually verified.

Main concern: the 14-day commerce digest shows `checkout_started=3` but `checkout_request_received=151` and `checkout_session_created=151`. That makes intent-to-checkout rates unusable as-is. A separate valid checkout-ratio sanity command showed 70 previews, 52 checkout sessions, and 0 payments in the last 7 days. This may be event semantics, stale windows, bot/automated checkout-session creation, or a tracking/data-window mismatch. It needs investigation before paid ads.

## 2. Commands Discovered

### Commerce Digest

- `npm run qa:commerce-digest`
- Script: `scripts/commerce-digest.mjs`
- Purpose: funnel totals, checkout blockers, Stripe revenue split, print order states, referral-attributed paid sessions, promo signup totals.
- Required env: `STRIPE_SECRET_KEY`
- Optional env: `FUNNEL_DASHBOARD_TOKEN`, `PRINT_ADMIN_TOKEN`

### Funnel Reconcile

- `npm run qa:funnel-reconcile`
- Script: `scripts/funnel-reconcile.mjs`
- Purpose: compare funnel `payment_verified` against Stripe paid sessions.
- Required env: `STRIPE_SECRET_KEY`
- Optional/conditional env: `FUNNEL_DASHBOARD_TOKEN`, `PRINT_ADMIN_TOKEN` for repair mode.

### Live Smoke Test

- `npm run qa:live-smoke`
- Script: `scripts/live-smoke.mjs`
- Purpose: live UX/API smoke checks.
- Audit decision: not run because the script performs production POST checks and can create checkout/API activity.

### Sitemap / Canonical / SEO Health

- `npm run qa:sitemap-health`
- Script: `scripts/sitemap-health.mjs`
- Purpose: fetch sitemap URLs, verify response status, canonical, robots/noindex, and redirects.

### Merchant Feed Check

- `npm run qa:merchant-feed:live`
- Script: `scripts/merchant-feed-health.mjs --feed https://starmapco.com/merchant-feed.xml`
- Purpose: validate live Merchant feed items, shipping countries, exclusions, and image URLs.

### Stripe / Payment-Method Audit

- `npm run qa:stripe-payment-methods`
- Script: `scripts/stripe-payment-method-audit.mjs`
- Purpose: retrieve Stripe account/payment-method configuration.
- Required env: `STRIPE_SECRET_KEY`, `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID`

### Printful / Print Fulfillment Readiness

- `npm run qa:printful`
- Script: `scripts/printful-verify.mjs`
- Purpose: verify Printful store and configured poster/framed variants.
- Required env: `PRINTFUL_API_TOKEN`, `PRINTFUL_STORE_ID`, `PRINTFUL_VARIANT_ID_POSTER_UNFRAMED`, `PRINTFUL_VARIANT_ID_POSTER_FRAMED`

- `npm run qa:print-ops`
- Script: `scripts/print-ops-report.mjs`
- Purpose: report recent print checkout sessions from Stripe and cross-check print order status through admin API.
- Required env: `STRIPE_SECRET_KEY`, `PRINT_ADMIN_TOKEN`

### Checkout Diagnostics

- No standalone npm command was found for checkout diagnostics only.
- `npm run qa:commerce-digest` includes checkout blocker totals from `/api/analytics/checkout-diagnostics`.
- `npm run qa:checkout-ratio-sanity` is available for funnel ratio sanity.

### Additional Existing QA Commands

- `npm run qa:ga4-smoke`
- `npm run qa:live-conversion`
- `npm run qa:content-consistency`
- `npm run qa:policy-smoke`
- `npm run qa:merchant-center`
- `npm run seo:gsc:query`
- `npm run qa:billing`
- `npm run qa:release-gate:live:smoke`

## 3. Commands Run

### Passed

```bash
npm.cmd run qa:sitemap-health -- --sitemap https://starmapco.com/sitemap.xml --concurrency 8 --timeout-ms 15000
npm.cmd run qa:merchant-feed:live
npm.cmd run qa:stripe-payment-methods -- --json
npm.cmd run qa:printful
npm.cmd run qa:print-ops -- --hours 168 --limit 40
npm.cmd run qa:commerce-digest -- --days 14
npm.cmd run qa:funnel-reconcile -- --days 14
npm.cmd run qa:checkout-ratio-sanity
```

### Failed Due To Wrong Argument, Then Corrected

```bash
npm.cmd run qa:checkout-ratio-sanity -- --days 14
```

**Failed:** `Unknown arg: --days`

The command usage was inspected, then rerun successfully without `--days`.

### Read-Only Live HTML Mojibake Check

Sampled pages:

- `/`
- `/shipping`
- `/support`
- `/returns`
- `/star-map-gift`
- `/personalized-star-map`
- `/wedding`

## 4. Commands Not Run And Why

### `npm run qa:live-smoke`

**Blocked:** not run in this audit because `scripts/live-smoke.mjs` performs production POST checks and checkout-related API probes. That could create production activity and possibly Stripe checkout sessions, conflicting with the instruction not to modify Stripe, tracking, production settings, or live systems.

### `npm run qa:live-conversion`

**Blocked:** not run because it is an end-to-end live conversion QA path and can interact with live Stripe checkout/payment flows.

### `npm run qa:ga4-smoke`

**Blocked:** not run because it intentionally tests GA4 event behavior and may emit tracking activity. This audit was instructed not to modify tracking.

### `npm run qa:release-gate:live:smoke`

**Blocked:** not run because it aggregates live smoke behavior and can include commands that perform live POST/API activity.

### `npm run seo:gsc:query`

**Blocked:** not run because Search Console query requires Google service-account credentials. Also, the script writes `reports/search-console.query.json`; this audit focused on the requested audit report only.

### `npm run qa:merchant-center`

**Blocked:** not run because Merchant Center API checks generally require external credentials/API access and may depend on account configuration outside this repo.

### `npm run qa:billing`

**Blocked:** not run because it includes smoke/commerce checks; the safer components were run individually.

## 5. Results

### Sitemap Health

**Passed**

- Total URLs: 87
- `2xx`: 86
- `3xx`: 1
- `4xx/5xx/errors`: 0
- On-page issues: 0
- Redirect: `308 https://starmapco.com/best-personalized-star-map-gift -> /personalized-star-map`

### Merchant Feed

**Passed**

- Feed: `https://starmapco.com/merchant-feed.xml`
- Expected shipping countries: `US`, `CA`, `GB`, `IE`, `AU`, `NZ`
- Excluded countries: `KR`
- 3 items validated
- 9 image URLs healthy

### Stripe Payment Methods

**Passed**

- Account country: CA
- Charges enabled: true
- Details submitted: true
- Payment method configuration active: true
- `card`: available, on
- `link`: available, on
- `apple_pay`: available, on
- `google_pay`: available, on
- `paypal`: unavailable/off

### Printful Verification

**Passed**

- Store: StarMapCo
- Store type: native
- Unframed variant: Enhanced Matte Paper Poster 18x18
- Framed variant: Enhanced Matte Paper Framed Poster, black, 14x14

### Print Ops

**Passed with limited window**

Window: last 168 hours

- Scanned print sessions: 1
- Status counts: `sent=0 pending=0 failed=0 missing=0 error=0 unpaid=1`
- Anomalies: `sentBelowMinCharge=0 sentNegativeMargin=0`
- One unpaid live print session was found.

### Commerce Digest

**Passed with tracking concern**

Window: last 14 days

- Paid sessions: 2
- Real paid sessions: 2
- Revenue: `$116.95`
- Digital revenue: `$0.00`
- Print revenue: `$116.95`
- Mix: `digital=0`, `print=2`
- Top print variant: `poster_framed: 2`
- Paid payment methods: `apple_pay: 1`, `link: 1`
- Paid referral sources: none
- Promo signups: `active=16`, `unsubscribed=0`, `total=16`
- Print ops in 14-day digest: `sent=2 pending=0 failed=0 missing=0 error=0`
- Missing approval alerts: 1

Funnel:

- `landing_view=147`
- `preview_started=114`
- `checkout_started=3`
- `checkout_request_received=151`
- `checkout_session_created=151`
- `payment_verified=2`

Conversion:

- `api request -> session created: 100.00%`
- `session created -> paid: 1.32%`
- `intent -> api request: 5033.33%`
- `intent -> session created: 5033.33%`

**Needs manual check:** The `checkout_started` count is too low relative to checkout API/session counts, making intent-based rates unusable.

Checkout blockers:

- Client-side blockers: none
- Server-side blockers, last 14 days: all 0
- Historical totals:
  - `unknown_error=22`
  - `checkout_intent_used=10`
  - `map_required=6`
  - `checkout_intent_missing=4`
  - `checkout_intent_invalid=1`

### Funnel Reconcile

**Passed**

Window: last 14 days

- Funnel `payment_verified`: 2
- Stripe paid sessions: 2
- Digital paid: 0
- Print paid: 2
- Stripe sessions scanned: 160
- Delta: 0
- Absolute variance: 0%

### Checkout Ratio Sanity

**Passed with conversion concern**

Last 1 day:

- `preview_started=7`
- `checkout_session_created=3`
- `payment_verified=0`
- `preview -> session=42.86%`
- `session -> paid=0.00%`
- Site probe: HTTP 200

Last 7 days:

- `preview_started=70`
- `checkout_session_created=52`
- `payment_verified=0`
- `preview -> session=74.29%`
- `session -> paid=0.00%`
- `preview -> paid=0.00%`

## 6. Tracking Status

**Confirmed:** The system records live funnel data and checkout diagnostics.

**Passed:** `payment_verified` reconciles with Stripe paid sessions over 14 days.

**Needs manual check:** Funnel step interpretation is not ad-ready. `checkout_started=3` while `checkout_request_received=151` and `checkout_session_created=151` indicates a tracking semantics, event-source, or reporting-window mismatch.

**Unknown:** Whether GA4 and PostHog are receiving the same business-critical events consistently. `qa:ga4-smoke` was not run because it may emit tracking events.

## 7. Checkout / Payment Status

**Confirmed:** Stripe account is enabled and payment method configuration is active.

**Passed:** Stripe paid sessions reconcile exactly to `payment_verified` for the last 14 days.

**Confirmed:** Wallet methods are available:

- Card
- Link
- Apple Pay
- Google Pay

**Needs manual check:** Checkout cancel/recovery experience was not tested in this audit.

## 8. Funnel / Reconciliation Status

**Passed:** `payment_verified=2` equals `Stripe paid sessions=2`.

**Needs manual check:** Last 7 days show 52 checkout sessions and 0 payments. This may be normal for current traffic, but it is not good enough for paid ad scaling without understanding visitor quality and checkout intent quality.

**Confirmed blocker:** Commerce digest has unusable intent-to-session math due `checkout_started` being lower than checkout API/session counts.

## 9. Printful / Fulfillment Status

**Passed:** Printful store and two configured variants verified.

**Passed:** 168-hour print ops scan found no sent/pending/failed anomalies.

**Needs manual check:** Full print matrix was not run:

- Framed success
- Unframed success
- Forced failure
- Admin retry

**Needs manual check:** Customer-facing print confirmation and manual approval messaging after payment were not tested.

## 10. SEO / Sitemap / Canonical Status

**Passed:** Live sitemap health checked 87 URLs with zero on-page issues and zero 4xx/5xx errors.

**Needs manual check:** One sitemap URL redirects:

- `/best-personalized-star-map-gift -> /personalized-star-map`

This did not fail the script, but the sitemap should ideally avoid known redirecting URLs before SEO scaling.

**Unknown:** Current Search Console impressions/clicks/queries were not collected because Search Console credentials were not used.

## 11. Merchant Feed Status

**Passed:** Live merchant feed validated.

**Confirmed:** 3 items and 9 image URLs were healthy.

**Needs manual check:** Merchant Center account status, disapprovals, and diagnostics were not checked because that requires Merchant Center access/API credentials.

## 12. Mojibake / Browser-Check Status

**Passed for sampled served HTML:** No mojibake-like matches were found in live HTML for:

- `/`
- `/shipping`
- `/support`
- `/returns`
- `/star-map-gift`
- `/personalized-star-map`
- `/wedding`

**Needs manual check:** This was not a full browser visual inspection. It does not prove every dynamic UI state is clean.

## 13. Current Paid Ads Recommendation

**No-go for scaling paid ads.**

Reason:

- Payment reconciliation is good, but checkout/funnel interpretation is not yet clean enough.
- Last 7 days show checkout sessions but zero payments.
- Print fulfillment is technically configured, but full matrix/customer-confirmation proof was not run in this audit.
- Trust/social proof remains a known opportunity before cold traffic scaling.

**Allowed next step:** small manual/organic traffic review and SEO/content improvements tied to evidence. Avoid meaningful paid ad spend until STAR-002/STAR-003 are resolved.

## 14. Confirmed Blockers

### Confirmed

- `checkout_started` does not line up with checkout request/session counts in the 14-day commerce digest.
- Full print fulfillment matrix has not been freshly documented in this audit.
- One sitemap URL redirects.
- No Search Console live opportunity data was collected.

### Needs Manual Check

- GA4/PostHog live event parity.
- Customer-facing print confirmation journey.
- Checkout cancel/recovery experience.
- Real customer proof/testimonial readiness.
- Merchant Center account diagnostics.

## 15. Assumptions Or Unknowns

### Unknown

- Whether `checkout_request_received=151` includes non-user/API/probe/session-recovery activity.
- Whether `checkout_started=3` is expected after a recent event semantics change or a tracking bug.
- Whether the last 7-day zero-payment window is traffic-quality, pricing/trust, checkout friction, or normal low volume.
- Whether Printful manual approval is operationally staffed daily.
- Whether production GA4 is configured as the ad conversion source.

### Assumption

- The read-only scripts reflect production because they default to `https://starmapco.com` and used local credentials where required.

## 16. Recommended Next Tickets In Priority Order

1. **STAR-002: Fix/clarify checkout funnel semantics**
   - Goal: explain why `checkout_started` is lower than `checkout_request_received` and `checkout_session_created`.
   - Success: dashboard rates become trustworthy for paid traffic decisions.

2. **STAR-003: Run full print fulfillment/customer-confirmation matrix**
   - Goal: verify framed success, unframed success, forced failure, retry, customer email/status, and manual approval flow.
   - Success: print buyers can pay without operator/customer ambiguity.

3. **STAR-004: Add or verify GA4/PostHog event parity without polluting production data**
   - Goal: confirm ad-relevant conversion events are reliable.
   - Success: paid campaign conversion source is known and documented.

4. **STAR-005: Remove redirecting URL from sitemap or confirm redirect is intentional**
   - Goal: clean sitemap before SEO scaling.
   - Success: sitemap has no known redirect URLs.

5. **STAR-006: Review checkout cancel/recovery UX**
   - Goal: reduce lost purchase intent after Stripe cancellation.
   - Success: canceled checkout returns buyers to the right map/order context.

6. **STAR-007: Merchant Center manual/account diagnostic check**
   - Goal: verify feed eligibility and account-level issues outside repo.
   - Success: Merchant Center is clean before Shopping/Performance Max tests.

7. **STAR-008: Real trust proof review**
   - Goal: identify approved testimonials/photos/proof assets for cold traffic.
   - Success: money pages show real trust signals before ad scaling.
