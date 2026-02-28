# StarMapCo Roadmap Status

Updated: 2026-02-27

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

Post-deploy sanity:

```bash
npm run qa:live-smoke
```

## Phase 4: Growth and Conversion (Planned)

- Strengthen trust modules on money pages (reviews, quality guarantees, shipping clarity).
- Deepen content on top intent pages:
  - `/personalized-star-map`
  - `/star-map-gift`
  - one top occasion page.
- Build 2-3 authority assets for link earning.
- Start social publishing cadence and UGC loops.

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

## No-Go Conditions

Do not deploy print launch if any are true:

- Flag mismatch between server/client print checkout flags.
- `PRINT_ORDER_SUBMISSION_ENABLED=true` without a fulfillment channel.
- `qa:printful` fails.
- build/lint/typecheck fail.
- checkout or entitlement regressions in manual QA.
