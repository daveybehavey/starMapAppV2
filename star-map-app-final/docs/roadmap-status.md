# StarMapCo Roadmap Status

Updated: 2026-03-21

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
  - Shifted proof/mockup surfaces to calmer flat wall textures to reduce visual noise while keeping in-room context.
- Post-purchase download recovery hardening:
  - Added explicit mobile download-location guidance on `/download` with iPhone/Android-specific copy.
  - Added iPhone "Files > Downloads" reminder on `/success` before redirect.
  - Download page hero state now explains "create map first" vs "access not verified" to reduce false "missing files" confusion.
  - Success and download access-link panels now show the generated link inline and include an `Open link` action in addition to copy/email actions.
  - Added support lookup command `npm run support:order-lookup` to resolve receipt/session/email into verified recovery status and correct customer response templates.
  - Support lookup templates are now name-agnostic by default and support optional `--name` personalization to avoid hard-coded customer-name mistakes.
  - Added support courtesy replacement command `npm run support:courtesy-replacement` to issue one-time free replacement checkout access when an order was refunded or recovery is needed.
  - Added `My downloads` to app + static footer quick links so returning buyers can recover access faster without contacting support.
  - Success page access panel now includes a direct `My downloads` action alongside `Go to download now`.
  - Added support sender setup runbook for `support@starmapco.com` outbound sending via Gmail + SMTP (`docs/support-email-send-as-setup.md`).
  - HD export credits are now consumed only after file generation succeeds (prevents failed renders from burning credits).
  - Download filenames now include human-readable map/date slugs (`starmap-...png`) for easier file lookup on mobile.
  - Pack copy clarified from "3 files" to "3 export credits" across checkout/paywall surfaces.
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
- Referral v2 hardening is now in place:
  - optional anti-abuse cap: `REFERRAL_MAX_REWARDS_PER_REFERRER_30D`
  - referral conversion + reward reversal on refunds/disputes
  - referral event ledger now tracks `conversion_reversed` and `reward_reversed`
  - checkout metadata now records referral offer variant (`referral_auto_promo`, `manual_promo_override`, `referral_no_discount`)
- Success/download referral cards now support social-first sharing:
  - tracking-tagged share links per platform (`utm_*` + `ref_src`)
  - copy-ready post text button
  - top social traffic and top referral-sales source summaries in referral stats
- Current production wrangler mode is `LIVE_READY`; local `.env.local` remains `CHECKOUT_ONLY` for safer testing.
- Print operator alerting now covers both:
  - approval-needed draft orders
  - paid print failures that require manual intervention

## Phase 3: Launch Readiness (Current Priority)

Required pre-deploy gate:

```bash
npm run check:env
npm run qa:links
npm run lint
npx next typegen
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
npm run qa:content-consistency
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
- Added internal link integrity guard:
  - `npm run qa:links`
  - integrated into `qa:release-gate` and `qa:changed` for page/link regressions
- Expanded live content consistency sweep coverage:
  - now checks high-intent, gift, city, and policy pages in one pass
  - integrated into `qa:release-gate --live`
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
- Added proof-asset upgrade block across high-intent pages:
  - weak framed placeholder imagery replaced with current Printful mockups
  - dedicated physical-product gallery block added to homepage/gift surfaces
  - checkout defaults now fall back to framed print instead of unframed when no variant is specified
  - testimonial placement scaffolding expanded to anniversary and night-sky gift pages without publishing fake quotes
- CTA and copy consistency pass shipped across top-intent + lower-intent pages:
  - normalized framed CTA wording to `Preview framed print` and `Start with framed print preview`
  - aligned preview-first wording across homepage, gift pages, and blog CTAs
  - removed mixed labels like `Preview framed gift` / `Start now` where they conflicted with offer-ladder language
- Blog index coverage and freshness hardening:
  - `/blog` now includes all active post slugs from the canonical blog post set (including `meaningful-dates-star-map`)
  - corrected stale index date mismatch on `custom-star-maps-for-weddings`
  - added new gift-buying SEO post:
    - `/blog/best-personalized-gift-for-couples` (published `2026-03-21`)
- Payment method audit on live Stripe config (`pmc_1TBlq4LWqD0o98657GwX3SZM`):
  - `card`: on
  - `link`: on
  - `apple_pay`: on
  - `google_pay`: on
  - `paypal`: off/unavailable on current account config

## Phase 4: Growth and Conversion (Planned)

- Strengthen trust modules on money pages (reviews, quality guarantees, shipping clarity).
- Deepen content on top intent pages:
  - `/personalized-star-map`
  - `/star-map-gift`
  - one top occasion page.
- Build 2-3 authority assets for link earning.
- Start social publishing cadence and UGC loops.
- Formalize loop marketing operations:
  - referral share loop
  - proof/UGC trust loop
  - promo capture lifecycle loop
  - playbook: `docs/loop-marketing-playbook.md`

### Immediate next execution batch (March 2026)

1. Conversion instrumentation sanity check on live:
   - confirm `landing_view -> preview_started -> checkout_started -> payment_verified` trend lines
   - reconcile `payment_verified` against Stripe paid sessions for last 7/14 days
2. Money-page conversion depth:
   - keep trust modules active on `/personalized-star-map`, `/star-map-gift`, `/wedding`
   - replace testimonial scaffolding with real customer-approved quotes/photos
   - intake template now lives at `docs/testimonial-intake-template.md`
3. Print launch staging:
   - keep `PRINT_ORDER_SUBMISSION_ENABLED=false` until internal matrix is rerun
   - rerun print matrix (framed success, unframed success, forced failure, admin retry)
4. Referral rollout hardening:
   - verify attribution and reward credit flow after the measurement updates
   - keep anti-abuse limits on before wider promotion
5. Reveal experience polish:
   - make the transition from setup -> revealed sky feel intentional on desktop + mobile
   - reduce dead-click ambiguity with explicit “revealing” states while preview is initializing
6. Text-editor UX hardening:
   - keep the current normalized text model and export renderer as the source of truth
   - improve on-canvas text interaction first (selection state, clearer bounds, keyboard nudging, less clunky drag feedback)
   - add DOM-overlay editing for the active text box instead of moving text entry deeper into side panels
   - only evaluate `react-konva` if we need transform handles / richer on-canvas manipulation
   - only evaluate `Fabric.js` if we intentionally move toward a fuller design-tool editor
7. Checkout payment-method optimization:
   - move off hard-coded card-only Checkout sessions
   - keep Stripe Checkout as the single payment stack
   - prefer wallet-friendly dynamic methods (`Apple Pay`, `Google Pay`, `Link`) over adding a separate PayPal flow
   - keep async / BNPL / redirect methods off unless webhook and fulfillment flows are deliberately expanded
8. Loop marketing setup and instrumentation:
   - ship a weekly loop scorecard (referral, proof, promo-capture)
   - keep referral share surface active on `/success` + `/download`
   - operationalize proof publishing queue from permissioned submissions
   - launch first lifecycle email sequence for promo captures

### Current Phase 4 Progress

- Manual print-promo support is now wired into checkout safely:
  - valid manual promo codes can now be evaluated on print checkout, not just digital single
  - print margin guard now considers the estimated promotion discount before checkout is created
  - print-ineligible promo codes are rejected before Checkout instead of slipping through and failing later
- Added a repeatable Stripe wallet audit script:
  - `npm run qa:stripe-payment-methods`
  - current live payment-method configuration confirms `card`, `Apple Pay`, `Google Pay`, and `Link` are all on
- Expanded operator payment-method visibility:
  - `qa:commerce-digest` now reports paid payment-method mix across all paid sessions plus digital/print splits
  - `live-conversion-qa` discounted fallback now uses wallet-friendly payment method configuration (if configured) instead of forcing card-only
- Tightened referral anti-abuse controls:
  - added optional `REFERRAL_MAX_REWARDS_PER_REFERRER_24H` cap for rapid repeat rewards
  - webhook reward logic now checks 24-hour cap before 30-day cap
- Added post-purchase proof capture scaffolding on `/success` and `/download`:
  - asks buyers to email a real photo + short note
  - explicitly states nothing is published without permission
- Added loop marketing playbook:
  - `docs/loop-marketing-playbook.md`
  - defines active loops, KPIs, and 30-day execution plan
- Added weekly loop scorecard command:
  - `npm run qa:loop-scorecard -- --days 14`
  - summarizes referral-share, proof-request opportunity, promo-lifecycle, and funnel proxy metrics in one report
- Expanded referral offer experiment observability:
  - `qa:commerce-digest` now reports paid `referral_offer_variant` counts from Stripe session metadata
  - `qa:loop-scorecard` now surfaces the top paid referral offer variant
- Added referral friend-offer experiment plumbing:
  - optional `STRIPE_REFERRAL_PROMO_CODE_ID_ALT` can be enabled alongside `STRIPE_REFERRAL_PROMO_CODE_ID`
  - optional `REFERRAL_AUTO_OFFER_ALT_SPLIT_PERCENT` (0-100) deterministically splits referral auto-offers by referral code hash
  - checkout metadata now records `referral_offer_variant` as `referral_auto_primary` / `referral_auto_alt` for paid attribution analysis
- Added a stricter server-side checkout funnel milestone:
  - `checkout_session_created` now records successful Stripe session creation separately from generic checkout intent
  - this makes it easier to diagnose whether drop-off is happening before Stripe session creation or after handoff
- Tightened checkout intent semantics (March 18, 2026):
  - `checkout_started` now records on the client at real checkout initiation points (editor, simplified editor, success add-on, download print)
  - `/api/checkout` now records `checkout_request_received` + `checkout_session_created` without duplicating `checkout_started`
  - this makes `checkout_started -> checkout_request_received` a true pre-API handoff metric instead of a blended server proxy
- Hardened the promo signup system:
  - signed unsubscribe links are now included in promo emails
  - `/unsubscribe` now records opt-outs instead of only claiming unsubscribe support
  - promo capture now uses a hidden honeypot field to cut basic bot spam
  - added an admin-only subscriber list endpoint for operator visibility
- Added server-side checkout blocker diagnostics:
  - checkout API failures now record reason counts in KV
  - `/api/analytics/checkout-diagnostics` exposes read-only blocker totals behind admin auth
  - `qa:commerce-digest` now shows:
    - `checkout_started -> checkout_request_received`
    - `checkout_started -> checkout_session_created`
    - `checkout_request_received -> checkout_session_created`
    - `checkout_session_created -> payment_verified`
    - top checkout blocker reasons
    - promo signup totals
- Added client-side checkout blocker diagnostics for handoff debugging:
  - client now reports `checkout_client_blocked` diagnostics when checkout starts but no checkout API response is received
  - diagnostics are normalized into `client_*` reason buckets in the same checkout diagnostics store
  - `qa:commerce-digest` now splits blockers into client-side (`client_*`) vs server-side (`/api/checkout`) sections
- Added `checkout_request_received` as a second server-side checkout milestone so operator reporting can separate pre-API drop-off from failures during checkout preparation.
- Repositioned homepage digital plan messaging so one-time HD is the default mental model, while 3-pack and unlimited are framed as repeat-use options instead of the default recommendation.
- Improved post-purchase proof requests:
  - proof email drafts now include order reference and purchase details where available
  - this reduces operator cleanup when real customer proof starts coming in
- Added config-driven promo target messaging:
  - `PROMOTION_TARGET_SCOPE`
  - `PROMOTION_TARGET_LABEL`
  - `PROMOTION_OFFER_NAME`
  - `NEXT_PUBLIC_PROMOTION_TARGET_SCOPE`
  - `NEXT_PUBLIC_PROMOTION_TARGET_LABEL`
  - `NEXT_PUBLIC_PROMOTION_OFFER_NAME`
  - this makes a future framed-offer test possible without another sitewide copy sweep
- Fixed a paywall print upsell dead-end:
  - users on the digital tab are now pushed to the print tab to select shipping country before print checkout if shipping country is missing
  - this avoids sending print-intent users into a missing-country error
- Expanded the internal funnel page so it now shows:
  - checkout handoff rate
  - Stripe session creation rate
  - paid-after-Stripe rate
  - promo signup counts
  - top checkout blockers
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
- Reveal loader polish is now live on desktop and mobile:
  - clearer stage names (`Moment`, `Sky`, `Finish`)
  - explicit free-preview framing
  - progress glow / stage progress indicator
  - slower, less abrupt reveal timing
- Editor onboarding clarity pass shipped (desktop + mobile):
  - setup chips now show real progress (`Date + place`, optional title personalization, preview)
  - pre-reveal guidance now explains exactly what input is missing (date, place, or both)
  - desktop onboarding now surfaces a visible autosave timestamp hint after draft writes
- Added `docs/operator-quick-reference.md` so sales/analytics/print checks and promo updates are operationally consistent.
- Added a dedicated gift-format depth page (`/star-map-gift-formats`) and linked it from key conversion surfaces so we can expose broader options without bloating homepage checkout.
- Homepage delivery hierarchy is now stronger:
  - digital card uses the same proof-image treatment as print cards
  - clearer CTA split between digital / framed / unframed
  - direct links to full gift-format comparison and shipping details
- Physical proof presentation polish shipped:
  - homepage print proof cards now use real wall-photo textures instead of flat synthetic wall gradients
  - proof image selection now prefers latest Printful preview PNGs (transparent cutout) before JPG mockups
  - static homepage variants (`public/index.html`, `public/landing.html`) were synced to the same wall-stage treatment
  - reduced boxed card chrome in the static physical gallery and strengthened visible style/shape variety (classic framed, heart, diamond, noir)
- Expanded consistency automation coverage:
  - `qa:content-consistency` now also validates lower-intent/authority pages:
    - all current blog article routes
    - `/how-accurate-are-star-maps`
    - `/how-to-print-star-map`
- Completed top-intent messaging consistency pass:
  - `/personalized-star-map`
  - `/star-map-gift`
  - `/wedding`
  - `/star-map-gift-ideas`
  - normalized preview CTA language so framed/unframed/HD paths match across these pages
- Replaced weak blog media placeholders:
  - removed favicon-based large images from blog articles
  - switched to real StarMapCo example assets in wedding and birthday blog guides
- Added rollout guardrail docs for next expansion blocks:
  - `docs/referral-v2-rollout.md`
  - `docs/country-expansion-guardrails.md`
- Lower-intent copy consistency sweep completed:
  - normalized CTA language from "framed preview" to "framed print preview" across generator/poster/constellation/location/occasion/blog template surfaces
  - aligned `/how-to-print-star-map` CTA copy to current checkout reality (framed/unframed/HD)
- Static homepage analytics performance hardening:
  - deferred GA external script download until explicit analytics consent grant on `public/index.html`
  - synced static variant (`public/landing.html`) to the same behavior
  - removed Lighthouse unused-JS attribution from `gtag.js` on non-consented first loads
- Static homepage runtime/paint hardening:
  - deferred noncritical static-home setup work (`referral visit post`, image-fallback listener wiring, cookie banner reveal) into idle-time execution
  - switched static funnel click tracking to delegated document-level handling to reduce per-node listener registration overhead
  - simplified mobile background painting path and removed cookie banner backdrop blur to reduce first-load paint work
- Checkout handoff metric quality hardening:
  - editor flow now records `checkout_started` immediately before `/api/checkout` handoff (after map/print preflight work), reducing false pre-API starts in funnel reporting
- Referral copy consistency hardening:
  - success-page referral reward text now uses configured `NEXT_PUBLIC_REFERRAL_REWARD_CREDITS` instead of hard-coded `1` credit wording
- Static homepage readability polish:
  - improved contrast for section body copy and signup helper text
  - refined the `Perfect for ...` occasion block hierarchy (kicker + cleaner link styling) to reduce visual clutter
- Homepage main-thread hardening:
  - converted `HomeOfferStack` to server-rendered output to trim client hydration/runtime work on the home route
  - replaced interactive shipping-country selector in that block with a clear baseline estimate message (final shipping still shown before payment)
- Physical gallery visual refinement (app routes):
  - reduced boxed card chrome in `PhysicalProductGallerySection`
  - expanded visible style variation in gallery cards (heart + diamond layouts) for faster visual comparison
- Static homepage visual/readability refinement:
  - replaced flat JPEG proof cards with transparent cutout variants where available for more realistic wall-stage composition
  - reduced boxed chrome in the static physical gallery by moving captions off the dark card strip
  - improved text contrast in the static signup and occasion sections for easier scanning
- Account-lite backend foundation:
  - paid sessions are now indexed in KV by normalized customer email hash for future cross-device history/recovery
  - added admin-only session snapshot endpoint:
    - `GET /api/account/sessions?email=customer@example.com&limit=20`
  - guest-first checkout is unchanged; this is groundwork for optional account flows
  - added self-serve recovery request endpoint:
    - `POST /api/account/recover` with customer email
    - returns generic response (no account enumeration)
    - emails fresh secure `/download?token=...` links for recent paid sessions when found
  - wired `/download` with an `Email recovery links` form so customers can restore access without support intervention
  - added passwordless `My Downloads` surface:
    - `/my-downloads` (noindex) with email magic-link sign-in
    - `POST /api/account/magic/request` to send short-lived sign-in links
    - `POST /api/account/magic/claim` to establish an account-lite cookie session
    - `GET /api/account/my-sessions` to list recent paid sessions and launch `/download?token=...` links
  - added one-click resend endpoint for active buyers:
    - `POST /api/account/access-email`
    - wired into success/download UI as `Email me link`
  - added automatic first-payment access email:
    - webhook now auto-sends a secure `/download?token=...` link when digital entitlement becomes paid
    - includes delivery metadata on the session record for operator debugging

### Most recent verified ops snapshot

- `qa:live-smoke` passes against live after the reveal/homepage updates.
- `qa:billing` passes locally:
  - commerce smoke: pass
  - funnel reconcile: pass (`payment_verified=1`, Stripe paid sessions `=1` over last 14 days)
  - print ops: no sent/pending/failed anomalies in last 168 hours; 2 unpaid print sessions observed
- `qa:commerce-digest -- --days 7` snapshot:
  - landing views: 155
  - preview started: 75
  - checkout started: 47
  - payment verified: 1
  - paid sessions: 1

## Phase 5: Print Scale (Planned)

- Expand print catalog (sizes/frames/regions).
- Improve upsell sequencing:
  - digital -> print add-on
  - print -> digital add-on
- Add operational visibility for print fulfillment errors/retries.

### Phase 5 progress now

- Operational visibility shipped via `qa:print-ops` (Stripe print sessions + KV order status correlation).
- Admin retry/status endpoints are already live and token-protected.
- Operator email alerting now covers both:
  - sent/draft print orders ready for manual approval
  - failed fulfillment attempts that need operator attention
- Added unified commerce operator digest:
  - `npm run qa:commerce-digest -- --days 7`
  - combines funnel totals, Stripe revenue mix, print order states, and paid referral sources
- Download upsell now uses the same selected-country shipping logic as homepage/editor/paywall:
  - shipping country selector is visible before starting print checkout
  - framed and unframed buttons show the live shipping estimate instead of generic `+ shipping`
- Added a dedicated authority asset page at `/how-accurate-are-star-maps` and linked it from key money pages.
- Corrected public-facing astronomy claims so copy now matches the actual rendering stack more closely.
- Added SKU expansion gate tooling:
  - Candidate list in `data/upsell-candidates.json`
  - Margin scoring command `npm run qa:upsell-matrix`
  - Generated matrix at `docs/upsell-rollout-matrix.md`
  - Policy guardrails in `docs/upsell-rollout-policy.md`

## Priority Queue (Next 10)

1. Replace testimonial placeholders with real approved customer quotes/photos on the 3 money pages.
2. Run and document a full print matrix in live mode (framed success, unframed success, forced failure, admin retry).
3. Add operator email alerting for new paid print sessions and failed fulfillment attempts.
4. Add event-level dashboard check (GA4/PostHog) for `landing -> preview -> checkout -> paid` and weekly reconcile.
5. Improve success/download upsell cards with real framed/unframed product photography from fulfilled samples.
6. Add low-friction post-purchase add-on flow (`digital -> print` and `print -> digital`) with explicit margin guard.
7. Ship a refined reveal animation pass (faster perceived load + deterministic loading copy).
8. Launch first social referral campaign (tracked links + source performance review cadence).
9. Create one authority asset page (`How accurate are star maps?`) and link it from money pages.
10. Add per-country shipping ETA language to key print CTA surfaces (homepage, paywall, download upsell).
11. Start weekly loop-marketing scorecard and review cadence from `docs/loop-marketing-playbook.md`.

## Extended Backlog (Next 20)

11. Implement referral friend-offer variant testing (free HD vs 50% off single) with abuse controls.
12. Build automated weekly commerce digest (paid sessions, print submissions, failure rates, referral sales).
13. Add lightweight save-and-resume map links before full account system rollout.
14. Expand print catalog from approved high-margin candidates (pilot one SKU at a time).
15. Add a dedicated product comparison block for digital vs unframed vs framed on `/star-map-gift-formats`.
16. Add conversion-focused FAQ refresh with shipping, refund, and print quality objections.
17. Add per-market digital pricing experiment framework for selected lower-ARPU countries.
18. Build a simple operator screen for print order states (pending/sent/failed) and retry actions.
19. Add post-purchase review capture flow for social proof acquisition.
20. Publish a print quality explainer page (materials, dimensions, processing, damage handling).
21. Add campaign-level attribution tags to all social profile links and pinned posts.
22. Expand intent pages only where unique proof assets exist (avoid thin programmatic expansion).
23. Add a rollout checklist command that validates env flags + QA scripts + print ops snapshot in one run.
24. Add style QA snapshots for homepage/editor/checkout-critical sections.
25. Add an ops runbook for manual order review and expected response SLAs.
26. Pilot one lifecycle email sequence focused on print hesitation removal.
27. Add controlled A/B tests for homepage product hierarchy (framed-default vs balanced layout).
28. Add weekly SEO health report (sitemap, canonicals, noindex exclusions, merchant feed sanity).
29. Build a periodic merchant-feed currency/shipping cross-check to avoid country drift regressions.
30. Add CMYK-safe export experimentation behind a feature flag for higher-end print workflows.
31. Add a formal text-canvas migration checkpoint:
   - stay on the custom renderer if the need is limited to drag/edit/style
   - evaluate `react-konva` for richer interaction without replacing the final render pipeline
   - reserve `Fabric.js` for a deliberate “mini design editor” scope, not as a casual dependency swap
32. Build a lightweight proof-submission queue screen for faster UGC throughput.
33. Add loop-level dashboard endpoint (referral/proof/promo) for weekly executive snapshot.

## Execution Board (Now / Next / Later)

### Now (0-2 weeks)

1. Run conversion-first operator cadence daily:
   - `npm run qa:commerce-digest -- --days 14`
   - `npm run qa:live-smoke`
   - `npm run qa:merchant-feed:live`
   - `npm run qa:stripe-payment-methods -- --json`
2. Keep merchant configuration stable while approved:
   - no country/feed/policy churn unless diagnostics break
3. Complete Referral v2 foundation:
   - add offer variant metadata to referral conversion events
   - add stricter anti-abuse caps for rapid repeat rewards
   - keep existing self-referral and idempotency guards
4. Launch one controlled offer test:
   - framed-focused friend/checkout offer with explicit margin protection
   - compare against current HD-starter baseline
5. Keep paywall/editor handoff cleanup tied to diagnostics:
   - prioritize fixes where `checkout_started` does not become `checkout_request_received`
6. Build proof intake operations:
   - process incoming proof requests from success/download flows
   - keep a permission checklist and publishing queue

### Next (2-6 weeks)

1. Country expansion in controlled batches:
   - batch 1: add `SG`
   - batch 2: add `ZA`
   - after each batch: run feed/shipping checks and monitor diagnostics for 48-72h
2. Referral v2 completion:
   - refund/dispute reward reversal handling
   - richer referral dashboard metrics (qualified, skipped, reversed)
3. Add Google Customer Reviews integration on order confirmation surfaces.
4. Convert promo capture into a true lifecycle channel:
   - list hygiene
   - suppression handling
   - first lifecycle sequence for checkout hesitation
5. Add one A/B test for homepage offer hierarchy:
   - framed-default vs balanced format selection

### Later (6+ weeks)

1. Save-and-resume links with lightweight project history.
2. Expand print catalog from matrix-approved, margin-safe candidates.
3. Add structured operator surface for print status/retries.
4. Evaluate text-editor migration checkpoint:
   - continue current custom model by default
   - escalate to `react-konva` only if interaction requirements exceed current architecture
   - use `Fabric.js` only for deliberate full design-tool scope
5. Reassess broader international and localization strategy after stable conversion trend.

### Execution Gates

1. Do not expand countries unless:
   - live merchant feed health is green
   - shipping settings are aligned for the new countries
   - no active account-level GMC issue
2. Do not scale referral incentives unless:
   - anti-abuse checks are enforced
   - reward reversals are in place for refunds/disputes
3. Do not launch new catalog SKUs unless:
   - margin matrix is green in target markets
   - print ops error/retry rates are stable

## No-Go Conditions

Do not deploy print launch if any are true:

- Flag mismatch between server/client print checkout flags.
- `PRINT_ORDER_SUBMISSION_ENABLED=true` without a fulfillment channel.
- `qa:printful` fails.
- build/lint/typecheck fail.
- checkout or entitlement regressions in manual QA.
