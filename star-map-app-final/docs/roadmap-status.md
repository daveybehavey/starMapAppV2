# StarMapCo Roadmap Status

Updated: 2026-03-11

## Phase 0: Foundation (Done)

- Star map rendering pipeline and style presets are in production.
- Editor flow, preview flow, and download flow are operational.
- Core Stripe digital checkout (single / pack / subscription) is live.
- SEO baseline is in place (metadata, sitemap, indexing controls).

## Phase 1: Reliability and Safety (Done / In progress)

### Done

- Print pipeline safety gates added:
  - `PRINT_CHECKOUT_ENABLED`
  - `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED`
  - `PRINT_ORDER_SUBMISSION_ENABLED`
- Printful integration and validation tooling:
  - `scripts/printful-verify.mjs`
- Launch readiness tooling:
  - `scripts/qa-go-no-go.mjs`
  - `docs/print-launch-checklist.md`
- Print asset storage/retrieval APIs:
  - `POST /api/print/assets`
  - `GET /api/print/assets?id=...`
  - compatibility redirect `/api/print/assets/[assetId]`
- Measurement foundation hardening:
  - Added analytics consent manager and banner for app routes.
  - Mounted PostHog provider in layout (consent-gated).
  - Added GA4 bootstrap wiring (consent-gated) using `NEXT_PUBLIC_GA_ID`.
  - Funnel counters now run as essential telemetry (blocked only by DNT), independent of optional analytics consent.
  - Added server-side funnel recording on checkout create/redirect and Stripe payment verification.
  - Payment verification funnel step is now idempotent (webhook retries no longer inflate counts).
  - Added session-level dedupe for `payment_verified` across webhook and verify fallback paths.
  - Reduced success-page verification flakiness by honoring `Retry-After` on `/api/stripe/verify` 429 responses and relaxing verify endpoint rate-limit for legitimate polling.
- Static homepage instrumentation:
  - Added anonymous funnel tracking for landing views and top CTA clicks in `public/index.html`.
  - Added static cookie consent banner to persist analytics consent before editor transition.
  - Added delivery-option CTAs that deep-link into print-intent editor states.
  - Synced `public/landing.html` from `public/index.html`.
- Print checkout country consistency:
  - UI shipping-country dropdown now uses configured allowed countries instead of full shipping map defaults.
  - Checkout API country validation now matches `PRINT_ALLOWED_COUNTRIES` directly.
- Print fulfillment margin guard:
  - Stripe webhook now blocks automatic print submission when charged amount is below configured minimum (`PRINT_MIN_CHARGE_CENTS`, default 100 cents).
  - Admin retry endpoint applies the same guard to prevent accidental resubmission of zero/underpriced print sessions.
- Mobile reliability regression coverage:
  - Added Playwright smoke test for iOS-style date entry auto-formatting on homepage.
- Merchant feed quality hardening:
  - Shipping lines now normalize to feed currency when provider rates are in a different currency.
  - Product image links now use dedicated square examples for better Merchant compatibility.
- Mobile date-input resilience hardening:
  - iOS-safe date inputs now accept both `YYYYMMDD` and `MMDDYYYY` numeric typing and normalize to `YYYY-MM-DD`.
  - Static homepage date form now supports numeric-only keyboard entry without requiring manual `-` separators.
  - iOS-safe text fallback no longer uses native HTML pattern enforcement, preventing Safari "format required" lockups while still validating with custom logic.
- Print checkout country selector contrast hardening:
  - Added explicit select/option text color styling so shipping-country labels remain readable in native dropdowns.
- Print operations QA hardening:
  - `scripts/print-ops-report.mjs` now surfaces min-charge and negative-margin anomalies explicitly.
  - Added `--strict` and `--min-charge-cents` flags so ops can fail fast when risky sent orders are detected.

### In progress

- Complete manual QA matrix for all monetization flows before deploy.

## Phase 2: Monetization Expansion (Built, not launched)

- Print checkout payload and webhook wiring are implemented.
- Referral program backend and UI paths are implemented.
- Referral status endpoint and conversion stats UI are live on `/download` (visits, conversions, rewards).
- Referral visit tracking now records on `/editor?ref=...` landings for cleaner attribution.
- Referral attribution capture is now centralized at app layout level, so `?ref=` links are persisted and counted from any entry page.
- Referral attribution is now time-bounded client-side (30-day window) instead of indefinite local storage.
- Referral auto-offer can now be configured via `STRIPE_REFERRAL_PROMO_CODE_ID` with safe fallback when Stripe rejects discount application.
- Current mode is `SAFE_OFF` for print launch to prevent accidental live fulfillment.

## Phase 3: Launch Readiness (Current Priority)

Required pre-deploy gate:

```bash
npm run check:env
npm run lint
npx tsc --noEmit
npm run build
npm run qa:go-no-go
npm run qa:smoke
npm run qa:printful
npm run qa:sitemap-health -- --sitemap https://starmapco.com/sitemap.xml --concurrency 8 --timeout-ms 15000
```

One-command variant:

```bash
npm run qa:release-gate:live:smoke
```

Additional manual checks required:

1. Digital checkout success/cancel behavior.
2. Editor paywall behavior across desktop and mobile.
3. Download page access/entitlement behavior.
4. Success page behavior for digital and print order modes.
5. Referral link generation and reward credit flow.
6. Print internal matrix (unframed success, framed success, forced failure, admin retry).
7. Funnel reconciliation check (`npm run qa:funnel-reconcile -- --days 14`) vs Stripe paid sessions.

Post-deploy sanity:

```bash
npm run qa:live-smoke
```

Recent status:

- `qa:smoke` (25 tests) passes locally.
- `qa:release-gate` passes locally (env, static-home sync, lint, typecheck, build, go/no-go).
- `qa:smoke` (27 tests) passes locally after measurement + conversion updates.
- Smoke suite reliability tightened:
  - `qa:smoke` now runs with a single worker for stability.
  - `qa:release-gate --smoke` now calls `npm run qa:smoke` (same stable settings).
- `qa:live-smoke` passes against `https://starmapco.com`.
- `qa:sitemap-health` passes against live sitemap.
- Added print operations monitor script: `npm run qa:print-ops`.
- Added funnel reconciliation script: `npm run qa:funnel-reconcile`.
- `qa:release-gate --live` now includes funnel reconciliation when Stripe credentials are present.
- Added static homepage drift guard scripts:
  - `npm run sync:static-home`
  - `npm run check:static-home`
  - `npm run check:static-assets`
- Added Merchant feed health guard:
  - `npm run qa:merchant-feed`
  - integrated into `qa:release-gate --live`
- Fixed iOS-safe date handling in additional editor inputs:
  - `DateTimeControls`
  - `SimplifiedEditor`
- Fixed a production SEO blocker in code (blog OG-image SVG fallback) that should clear live sitemap 503s after next deploy.

## Phase 4: Growth and Conversion (Planned)

- Strengthen trust modules on money pages (reviews, quality guarantees, shipping clarity).
- Deepen content on top intent pages:
  - `/personalized-star-map`
  - `/star-map-gift`
  - one top occasion page.
- Build 2-3 authority assets for link earning.
- Start social publishing cadence and UGC loops.

### Immediate next execution batch (March 2026)

1. Conversion instrumentation sanity check on live:
   - confirm `landing_view -> preview_started -> checkout_started -> payment_verified` trend lines
   - reconcile `payment_verified` against Stripe paid sessions for last 7/14 days
2. Money-page conversion depth:
   - keep trust modules active on `/personalized-star-map`, `/star-map-gift`, `/wedding`
   - replace testimonial scaffolding with real customer-approved quotes/photos
3. Print launch staging:
   - keep `PRINT_ORDER_SUBMISSION_ENABLED=false` until internal matrix is rerun
   - rerun print matrix (framed success, unframed success, forced failure, admin retry)
4. Referral rollout hardening:
   - verify attribution and reward credit flow after the measurement updates
   - keep anti-abuse limits on before wider promotion

### Current Phase 4 Progress

- Added a reusable trust-depth section (`RevenueTrustModule`) with:
  - checkout confidence cards
  - print planning quick guide
  - pre-purchase checklist
  - direct links to print guide + returns
- Applied this module on the three highest-intent pages:
  - `/personalized-star-map`
  - `/star-map-gift`
  - `/wedding`
- Added a reusable deliverables section (`WhatYouReceiveModule`) on the same three pages for explicit post-checkout expectations.
- Added testimonial rendering scaffolding (`TestimonialHighlights` + `src/data/testimonials.ts`) that stays hidden until real, permissioned quotes are added.

## Phase 5: Print Scale (Planned)

- Expand print catalog (sizes/frames/regions).
- Improve upsell sequencing:
  - digital -> print add-on
  - print -> digital add-on
- Add operational visibility for print fulfillment errors/retries.

### Phase 5 progress now

- Operational visibility shipped via `qa:print-ops` (Stripe print sessions + KV order status correlation).
- Admin retry/status endpoints are already live and token-protected.

## No-Go Conditions

Do not deploy print launch if any are true:

- Flag mismatch between server/client print checkout flags.
- `PRINT_ORDER_SUBMISSION_ENABLED=true` without a fulfillment channel.
- `qa:printful` fails.
- build/lint/typecheck fail.
- checkout or entitlement regressions in manual QA.
