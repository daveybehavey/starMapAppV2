# StarMapCo Roadmap Status

Updated: 2026-03-12

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
  - Merchant feed image links now use stable PNG/JPG assets (instead of WebP-only references) for broader crawler compatibility.
  - Merchant feed health script now supports `--file` for fast local validation before deploy.
  - Merchant feed now supports restricted-country exclusions via env:
    - `MERCHANT_FEED_EXCLUDED_COUNTRIES` (default includes `KR`)
    - `MERCHANT_FEED_INCLUDE_RESTRICTED=false` (default)
  - Feed generation and feed-health checks now use the same exclusion logic to avoid GMC-country drift.
- Mobile date-input resilience hardening:
  - iOS-safe date inputs now accept both `YYYYMMDD` and `MMDDYYYY` numeric typing and normalize to `YYYY-MM-DD`.
  - Static homepage date form now supports numeric-only keyboard entry without requiring manual `-` separators.
  - iOS-safe text fallback no longer uses native HTML pattern enforcement, preventing Safari "format required" lockups while still validating with custom logic.
- Print checkout asset reliability hardening:
  - Editor print asset generation now detects likely low-memory devices and uses a safer high-res export ladder.
  - Added explicit `print_asset_generation_failed` analytics event with failure reason, variant, and shipping country for faster diagnosis.
  - Added clearer user messaging when high-res print rendering fails on-device (desktop retry guidance).
- Print checkout country selector contrast hardening:
  - Added explicit select/option text color styling so shipping-country labels remain readable in native dropdowns.
  - Added `color-scheme: light` and explicit option foreground/background styles in editor, mobile preview, and paywall selectors.
- Print checkout pricing clarity hardening:
  - Print CTAs in editor, mobile, and paywall now show estimated shipping cost for the currently selected country.
  - Added inline shipping estimate hint (`framed` vs `unframed`) beside country selection to reduce checkout surprises.
  - Added in-flight button state text (`Opening secure checkout...`) on print CTAs to reduce dead-click ambiguity.
  - Homepage offer stack now includes a shipping-country selector with live framed/unframed shipping estimates and carries selected country into print-intent editor links.
  - Added `PRINT_DYNAMIC_SHIPPING=true` runtime switch so checkout can use country-level shipping from Printful estimates even when a fixed Stripe shipping rate is configured.
- Homepage visual polish hardening:
  - Reduced aggressive hover/glow intensity on showcase cards for a cleaner premium look.
  - Tightened delivery-option card hierarchy and spacing for easier scanning.
  - Simplified homepage hero and offer copy for better readability on first visit.
  - Added static-home gallery image fallback handling and smoother card hover polish for more stable premium presentation.
- Global print-market expansion (configured):
  - Production `PRINT_ALLOWED_COUNTRIES` now covers the full Printful-supported country set from `data/printful-shipping.json`.
  - Checkout country selector, API validation, and Merchant feed shipping lines now align to the same country list.
  - Shipping map refreshed from live Printful API for both framed and unframed variants; current supported set is 74 countries.
  - Wrangler country vars are now intentionally blank so production reads directly from the shipping map (single source of truth).
  - Margin-protective defaults are now explicit in production config:
    - `PRINT_DYNAMIC_SHIPPING=true`
    - `PRINT_MARGIN_GUARD_ENABLED=true`
    - `PRINT_MIN_MARGIN_CENTS=3000`
    - `PRINT_MARGIN_STRIPE_PERCENT=0.029`
    - `PRINT_MARGIN_STRIPE_FIXED_CENTS=30`
- Shipping policy clarity and compliance:
  - Added `/shipping` page with per-country print shipping rate and delivery estimate table.
  - Added shipping policy links in app footer and static homepage footer.
  - Added `/shipping` to sitemap so policy is discoverable by users and crawlers.
- Print operations QA hardening:
  - `scripts/print-ops-report.mjs` now surfaces min-charge and negative-margin anomalies explicitly.
  - Added `--strict` and `--min-charge-cents` flags so ops can fail fast when risky sent orders are detected.
  - Live release gate now includes `qa:print-ops -- --hours 72 --strict` to catch new fulfillment anomalies before sign-off.
  - Added a convenience billing health command: `npm run qa:billing` (commerce smoke + funnel reconcile + print ops snapshot).

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
- Referrer reward quantity is now configurable via `REFERRAL_REWARD_CREDITS` (default `1` HD credit per qualified referral conversion).
- Current production wrangler mode is `LIVE_READY`; local `.env.local` remains `CHECKOUT_ONLY` for safer testing.

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
  - Added targeted smoke commands to reduce dev-cycle time:
    - `qa:smoke:ui`
    - `qa:smoke:render`
    - `qa:smoke:commerce`
  - Added `qa:changed` helper to run only mapped QA checks for current local file edits.
  - Refined `qa:changed` mapping so merchant-feed-only edits skip unrelated UI smoke runs.
  - Playwright now runs against an isolated Next dist directory (`.next-playwright`) to avoid lock conflicts with local `next dev`.
  - Preview wait helper now tolerates aria-label fallback states while the editor transitions.
  - Homepage gallery smoke check now pre-seeds consent, targets exact showcase images, and validates static asset responses directly.
- `qa:live-smoke` passes against `https://starmapco.com`.
- `qa:sitemap-health` passes against live sitemap.
- `qa:live-conversion` passes against live (digital end-to-end flow through Stripe -> success -> download).
- `qa:funnel-reconcile --days 14` currently reports zero variance (`payment_verified=3`, Stripe paid sessions `=3`).
- `qa:ga4-smoke` passes (`page_view` + `funnel_step` events visible in dataLayer with consent update flow).
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
- Extended live smoke coverage:
  - validates homepage footer link to `/shipping`
  - validates `/shipping` page presence and key shipping table content
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
5. Reveal experience polish:
   - make the transition from setup -> revealed sky feel intentional on desktop + mobile
   - reduce dead-click ambiguity with explicit “revealing” states while preview is initializing

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
- Added staged reveal state on desktop and mobile editor flows so “Generate preview” now transitions through a short “Revealing your sky...” moment before showing the final map state.
- Added `docs/operator-quick-reference.md` so sales/analytics/print checks and promo updates are operationally consistent.
- Added a dedicated gift-format depth page (`/star-map-gift-formats`) and linked it from key conversion surfaces so we can expose broader options without bloating homepage checkout.

## Phase 5: Print Scale (Planned)

- Expand print catalog (sizes/frames/regions).
- Improve upsell sequencing:
  - digital -> print add-on
  - print -> digital add-on
- Add operational visibility for print fulfillment errors/retries.

### Phase 5 progress now

- Operational visibility shipped via `qa:print-ops` (Stripe print sessions + KV order status correlation).
- Admin retry/status endpoints are already live and token-protected.
- Added SKU expansion gate tooling:
  - Candidate list in `data/upsell-candidates.json`
  - Margin scoring command `npm run qa:upsell-matrix`
  - Generated matrix at `docs/upsell-rollout-matrix.md`
  - Policy guardrails in `docs/upsell-rollout-policy.md`

## No-Go Conditions

Do not deploy print launch if any are true:

- Flag mismatch between server/client print checkout flags.
- `PRINT_ORDER_SUBMISSION_ENABLED=true` without a fulfillment channel.
- `qa:printful` fails.
- build/lint/typecheck fail.
- checkout or entitlement regressions in manual QA.
