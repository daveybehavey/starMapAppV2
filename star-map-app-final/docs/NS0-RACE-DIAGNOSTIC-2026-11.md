# NS-0 RACE diagnostic — StarMapCo + OurImprint

## 1. Scope, evidence and limits

Prepared 2026-11-12 from freshly fetched origin/main at `a7e09630`. This is source inspection plus public-page fetching, not proof that this revision is deployed. Only this file is added. No production changes, purchases, form submissions, accounts, sends, spend or other repository clones. The explicit bridge job authorizes a local docs branch and bundle instead of the usual issue/PR workflow.

**Accepted operator baseline:** David adopted Reach → Act → Convert → Earn on 2026-11-12; NS-0 precedes NS-1/NS-2. Jack verified zero Stripe orders since 2026-10-22 across both shops, StarMapCo GA4 ingestion broken with zero hits ever (runtime fault, day 11+), and small but real GSC impressions. Evidence: trusted bridge-job instruction, transcribed here as the record. These are supplied facts, not independently remeasured numbers. No traffic or revenue is inferred from them.

Evidence labels: **Code** means an emitting path exists, conditional on execution/configuration; **Fetched** means returned page text, not an interactive browser test; **Inference/judgment** means interpretation, not observed abandonment. Successful fetches were labelled crawled five days ago (OurImprint), last week (StarMapCo shop), and last month (gift ideas). Their freshness differs. Failed fetches were not retried and do not establish shopper-facing outages.

Paths below are repository-relative. In tables, `src/` abbreviates `star-map-app-final/src/`. Governance read: worktree `AGENTS.md`; anchor-checkout `ASTRA_BRIEF.md` and `ASTRA_PROGRAMME.md` (absent from fresh main). `rg` was unavailable, so inspection used `git grep`. `gh issue view 629 --json title,body,url` and its 635 counterpart could not authenticate. Public PR fetches also failed; local git history supplies only the commit/title evidence cited below. No issue-body claim is made.

## 2. Instrumentation map

**Measured** requires an observed production measurement in this job. **Partial** means concrete coverage or accepted external evidence exists but stage denominators/outcomes are unavailable. **Dark** means no usable measurement is established. No stage is fully Measured. Earn means post-purchase value, repeat use and advocacy; payment belongs to Convert.

| Stage | Status | Evidence and limit |
| --- | --- | --- |
| Reach | Partial; GA4 dark | Accepted GSC presence (§1); `src/components/AnalyticsConsentManager.tsx` dispatches page views, but no usable GA4 visitor denominator exists. |
| Act | Partial | `src/components/analytics/LandingViewTracker.tsx`, `src/components/EditorExperience.tsx`, `src/app/MobileCreate.tsx` implement entry/reveal counters; no production counts retrieved. |
| Convert | Partial | `src/app/api/checkout/route.ts`, `src/lib/funnel.ts`, Stripe verify/webhook routes implement request/session/payment counters. Accepted zero orders lacks a visitor denominator. |
| Earn | Partial implementation; observed behavior dark | Download/recovery/referral/proof events exist (inventory below); no repeat, referral-conversion or retention measurement retrieved. |

### Destinations and gates

- **G:** generic `track` in `star-map-app-final/src/lib/analytics.ts`: consent granted and Do Not Track off → GA4 gtag event if available plus PostHog capture. No explicit GTM event-object push by this helper. Actual collection unverified; GA4 known broken.
- **F:** `trackFunnelStep` in the same file: `funnel_step` with a `step` parameter through G, plus an independent beacon/fetch to `/api/analytics/funnel` unless DNT is on. `star-map-app-final/src/app/api/analytics/funnel/route.ts` validates/rate-limits; `src/lib/funnel.ts` increments KV. These are event counts, not deduplicated visitors or joined sessions.
- **D:** GTM/dataLayer enqueue, not delivery proof. Container loading needs consent and configuration. Evidence: `star-map-app-final/src/lib/googleTagManager.ts`, `src/components/AnalyticsConsentManager.tsx`.

| Event / step | Where and when | Intended destination |
| --- | --- | --- |
| `page_view` | `src/components/AnalyticsConsentManager.tsx` pathname effect → `src/lib/analytics.ts::sendGaPageView`; DNT honored, denied/unset consent permits cookieless pings | GA4; separate consented provider path enqueues D and Pinterest page visit when configured |
| `landing_view`; `funnel_step(step=landing_view)` | `src/components/analytics/LandingViewTracker.tsx`, landing effect | G and F; not global unique visitors |
| `funnel_step(step=hero_plan_click)` | Hero, preview form, gift-format and sticky CTA callers in inventory | F; intent, not rendered map |
| `funnel_step(step=preview_started)` | `src/components/EditorExperience.tsx`: query-entry hydration and saved-map hydration | F; editor-entry proxy, not successful raster; no literal `editor_start` emitter found |
| `funnel_step(step=editor_reveal)` | Main editor and `src/app/MobileCreate.tsx`, reveal completion | F; UI reveal proxy, not pixel correctness |
| `reveal_map`, `preview_revealed`, `preview_reveal_animation_started`, `preview_reveal_animation_completed` | Desktop uses `reveal_map`, mobile `preview_revealed`; both track animation boundaries | G |
| `view_item_list`, `select_item` | Paywall, gift-format telemetry/CTA, download/success upsells (inventory and wrapper callers below) | GA4 only via consent/DNT-gated `sendGaEvent` |
| `begin_checkout`, `checkout_started` | `src/lib/analytics.ts::trackBeginCheckout`, called by editor, download print upsell and success digital add-on | `begin_checkout` → GA4 + D; `checkout_started` → G; consented Pinterest AddToCart. No standalone GA4 `add_to_cart` emitter found. |
| `funnel_step(step=checkout_started)` | Main/simplified editor, download and success clients before handoff | F; distinct from generic `checkout_started`, also fired earlier in main editor; do not sum them |
| `checkout_request_received`, `checkout_session_created`, `checkout_redirected` server steps | `src/app/api/checkout/route.ts`, accepted request / created session / URL handoff | KV, not GA4/GTM; handoff does not prove arrival at Stripe |
| `checkout_redirected`, `checkout_retry`, `checkout_failed`, `print_asset_generation_failed` | `src/components/EditorExperience.tsx`; simplified editor also emits failure | G; attempt/error signals, not purchase |
| `checkout_client_blocked` | `src/lib/analytics.ts::trackCheckoutClientDiagnostic`, invoked by checkout clients | G plus `/api/analytics/checkout-diagnostics` → failure KV; no GTM push |
| `checkout_expired` | `src/app/api/stripe/webhook/route.ts` → `src/lib/funnel.ts::recordCheckoutExpiredOnce` | Deduplicated KV step; not GA4/GTM |
| `payment_verified` | Stripe verify/webhook and funnel reconcile routes → `src/lib/funnel.ts::recordPaymentVerifiedOnce` | Deduplicated KV; known nonpositive totals excluded, QA skipped |
| Server `purchase` | Same recorder invokes `src/lib/ga4MeasurementProtocol.ts` and `src/lib/posthogServerPurchase.ts` | Configured GA4 Measurement Protocol and PostHog with separate dedupe; credentials/ingestion unverified |
| Browser `purchase_success`, `purchase` | `src/app/success/SuccessClient.tsx` after verification → `src/lib/analytics.ts::trackPurchaseCompleted` | Success → G; purchase → GA4/D/PostHog/Pinterest. Server-primary flag can suppress browser GA4. Otherwise both `sendGaEvent('purchase')` and `track('purchase')` occur; raw sends are not unique orders. Pending-consent handling exists. |
| `download_started`, `download_completed`, `download_failed`; `export_download` | `src/app/download/DownloadClient.tsx`; editor has started/completed and export signals | F and G respectively; not proof that a file was opened or printed |
| Recovery, referral, sharing, proof, upsell and editor-detail events | Complete literal call inventory below | G; request/click signals do not establish delivery, reviews or referral revenue |

`preview_checkout_nudge_shown` and `preview_checkout_nudge_clicked` appear in `star-map-app-final/src/lib/funnelSteps.ts` but no emitting caller was found under src. These are declarations, not active event coverage; destination **none established**.

Ecommerce wrapper callers: `star-map-app-final/src/components/PaywallModal.tsx`, `src/components/GiftFormatsTelemetry.tsx`, `src/components/GiftFormatCtaLink.tsx`, `src/app/download/DownloadClient.tsx`, `src/app/success/SuccessClient.tsx`; checkout wrapper also in `src/components/EditorExperience.tsx`. The literal inventory below records their emitted names at the helper and auxiliary names at callers.

Additional page-view coverage: `star-map-app-final/src/components/PosthogProvider.tsx` enables PostHog SDK `capture_pageview: true` when configured, consent-enabled and DNT off; autocapture and session recording are disabled. This is PostHog-only SDK coverage, not a proven production page-view dataset. `experiment_exposure` is called through `trackExperimentExposure` by `src/components/EditorExperience.tsx`, with session-storage dedupe in `src/lib/analytics.ts`.

### Checkout timing: open measurement, separate fix workstream

Local history identifies `66f50a2f` (#593) server timing, `30277287` (#629) non-awaited counter persistence, and `1345eae1` (#635) client timing marks. References: [#629](https://github.com/daveybehavey/starMapAppV2/pull/629), [#635](https://github.com/daveybehavey/starMapAppV2/pull/635); public fetch failed, commit titles were read locally. Existing performance investigation/fix workstream: `docs/checkout-performance-2026-11-10.md`. Its profiling-blocker section explicitly does not establish live before/after latency. This report does not duplicate that fix list.

| Instrument | Where it fires and lands | Coverage / limit |
| --- | --- | --- |
| Server `checkout_timing` | `src/lib/checkoutTiming.ts` from `src/app/api/checkout/route.ts`; server console plus KV aggregates via `src/lib/funnel.ts`, no GA4/GTM | `pre_create`, `promo`, `printful_quote`, `stripe_create`, `post_create`, `total`; cold/isolate-age marker, attempts, stage count/sum/buckets, fallback/quote counters. Missing stages remain missing. Nested stages are not additive. No production samples read. |
| Client `checkout_timing`, `client:true` | `src/lib/checkoutClientTiming.ts` wired in `src/components/EditorExperience.tsx`; browser console plus G callback | Marks `submit`, `request_sent`, `response_received`, `redirect`; submit→request, request→response, response→redirect and total. No new persistent first-party endpoint. Main-editor wiring is not all checkout-client coverage. No live samples read. |

KV timing keys are `checkout_timing:total:<counter>` and `checkout_timing:daily:<date>:<counter>` (`star-map-app-final/src/lib/funnel.ts`). Client timing captures pre-request work missed by the server timer; browser console output is not durable aggregate telemetry (`src/lib/checkoutClientTiming.ts`).

**GA4 fault blast radius:** accept the runtime fault as given. GA4 reporting across all four stages is unavailable, including page views, selections, custom engagement, checkout and purchase. Source emitters/dataLayer queues do not refute this. First-party KV, console timing and PostHog/Pinterest paths are structurally independent (`star-map-app-final/src/lib/analytics.ts`, `funnel.ts`, `checkoutTiming.ts`, `checkoutClientTiming.ts`), but this job did not establish their production collection. Server Measurement Protocol is another configured path, not proof of usable historical GA4 data. No diagnosis or fix of the fault was attempted.

### Literal client event inventory

Extracted from src TypeScript/JavaScript `track`, `trackFunnelStep` and `sendGaEvent` calls; duplicate names within a file collapse to the first call. Definitions without calls are excluded. These names include auxiliary events to avoid hiding emitted engagement/recovery signals. Generic calls use G, funnel calls F, and sendGaEvent uses GA4 only. Each call is conditional capability, not observed production execution. Special server emitters and wrappers are covered above.

| Event / step | Sender | Evidence call site |
| --- | --- | --- |
| `hero_cta_clicked` | track | `star-map-app-final/src/app/HomeHeroCta.tsx:21` |
| `hero_plan_click` | trackFunnelStep | `star-map-app-final/src/app/HomeHeroCta.tsx:26` |
| `paywall_intensity_blocked` | track | `star-map-app-final/src/app/MobileCreate.tsx:425` |
| `mobile_intensity_upsell_shown` | track | `star-map-app-final/src/app/MobileCreate.tsx:428` |
| `mobile_render_mode_upsell_shown` | track | `star-map-app-final/src/app/MobileCreate.tsx:444` |
| `render_mode_changed` | track | `star-map-app-final/src/app/MobileCreate.tsx:451` |
| `sample_moment_applied` | track | `star-map-app-final/src/app/MobileCreate.tsx:533` |
| `preview_reveal_animation_started` | track | `star-map-app-final/src/app/MobileCreate.tsx:542` |
| `preview_revealed` | track | `star-map-app-final/src/app/MobileCreate.tsx:552` |
| `preview_reveal_animation_completed` | track | `star-map-app-final/src/app/MobileCreate.tsx:553` |
| `editor_reveal` | trackFunnelStep | `star-map-app-final/src/app/MobileCreate.tsx:557` |
| `mobile_render_mode_upsell_clicked` | track | `star-map-app-final/src/app/MobileCreate.tsx:921` |
| `mobile_intensity_upsell_clicked` | track | `star-map-app-final/src/app/MobileCreate.tsx:966` |
| `premium_preview_enabled` | track | `star-map-app-final/src/app/MobileCreate.tsx:1496` |
| `print_upsell_viewed` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:418` |
| `download_started` | trackFunnelStep | `star-map-app-final/src/app/download/DownloadClient.tsx:644` |
| `download_failed` | trackFunnelStep | `star-map-app-final/src/app/download/DownloadClient.tsx:685` |
| `export_download` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:727` |
| `download_completed` | trackFunnelStep | `star-map-app-final/src/app/download/DownloadClient.tsx:728` |
| `download_missing_map` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:908` |
| `download_state_seen` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:953` |
| `download_recovery_action` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:967` |
| `access_link_email_requested` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:983` |
| `account_recovery_requested` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1037` |
| `billing_portal_opened` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1070` |
| `checkout_started` | trackFunnelStep | `star-map-app-final/src/app/download/DownloadClient.tsx:1178` |
| `print_checkout_started` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1216` |
| `referral_link_created` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1373` |
| `referral_link_copied` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1400` |
| `referral_post_template_copied` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1417` |
| `referral_link_shared` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:1438` |
| `download_merch_teaser_clicked` | track | `star-map-app-final/src/app/download/DownloadClient.tsx:2138` |
| `account_magic_link_claimed` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:120` |
| `my_downloads_sessions_loaded` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:147` |
| `account_magic_link_requested` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:171` |
| `my_downloads_copy_link_clicked` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:211` |
| `my_downloads_open_download_clicked` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:349` |
| `my_downloads_create_map_first_clicked` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:389` |
| `my_downloads_create_next_map_clicked` | track | `star-map-app-final/src/app/my-downloads/MyDownloadsClient.tsx:405` |
| `success_recovery_action` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:202` |
| `access_link_email_requested` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:219` |
| `billing_portal_opened` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:253` |
| `checkout_started` | trackFunnelStep | `star-map-app-final/src/app/success/SuccessClient.tsx:276` |
| `digital_addon_started` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:302` |
| `digital_to_print_upsell_clicked` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:337` |
| `referral_link_created` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:429` |
| `referral_link_copied` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:458` |
| `referral_post_template_copied` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:476` |
| `referral_link_shared` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:498` |
| `purchase_success` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:586` |
| `success_recovery_panel_seen` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:769` |
| `success_merch_teaser_clicked` | track | `star-map-app-final/src/app/success/SuccessClient.tsx:1158` |
| `print_shipping_country_selected` | track | `star-map-app-final/src/components/EditorExperience.tsx:579` |
| `paywall_opened` | track | `star-map-app-final/src/components/EditorExperience.tsx:664` |
| `preview_started` | trackFunnelStep | `star-map-app-final/src/components/EditorExperience.tsx:1147` |
| `preview_reveal_animation_started` | track | `star-map-app-final/src/components/EditorExperience.tsx:1497` |
| `reveal_map` | track | `star-map-app-final/src/components/EditorExperience.tsx:1520` |
| `preview_reveal_animation_completed` | track | `star-map-app-final/src/components/EditorExperience.tsx:1521` |
| `editor_reveal` | trackFunnelStep | `star-map-app-final/src/components/EditorExperience.tsx:1525` |
| `sample_moment_applied` | track | `star-map-app-final/src/components/EditorExperience.tsx:1592` |
| `paywall_view` | track | `star-map-app-final/src/components/EditorExperience.tsx:1678` |
| `export_hd_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:1709` |
| `download_started` | trackFunnelStep | `star-map-app-final/src/components/EditorExperience.tsx:1714` |
| `export_download` | track | `star-map-app-final/src/components/EditorExperience.tsx:1715` |
| `download_completed` | trackFunnelStep | `star-map-app-final/src/components/EditorExperience.tsx:1716` |
| `export_free_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:1719` |
| `checkout_started` | track | `star-map-app-final/src/components/EditorExperience.tsx:1846` |
| `print_asset_generation_failed` | track | `star-map-app-final/src/components/EditorExperience.tsx:2044` |
| `checkout_started` | trackFunnelStep | `star-map-app-final/src/components/EditorExperience.tsx:2189` |
| `checkout_retry` | track | `star-map-app-final/src/components/EditorExperience.tsx:2269` |
| `checkout_redirected` | track | `star-map-app-final/src/components/EditorExperience.tsx:2297` |
| `checkout_failed` | track | `star-map-app-final/src/components/EditorExperience.tsx:2395` |
| `print_option_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:2443` |
| `share_link_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:2503` |
| `share` | track | `star-map-app-final/src/components/EditorExperience.tsx:2504` |
| `share_image_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:2542` |
| `premium_preview_enabled` | track | `star-map-app-final/src/components/EditorExperience.tsx:3728` |
| `free_export_upsell_clicked` | track | `star-map-app-final/src/components/EditorExperience.tsx:4062` |
| `checkout_fallback_selected` | track | `star-map-app-final/src/components/EditorExperience.tsx:4317` |
| `gift_format_cta_click` | track | `star-map-app-final/src/components/GiftFormatCtaLink.tsx:34` |
| `hero_plan_click` | trackFunnelStep | `star-map-app-final/src/components/GiftFormatCtaLink.tsx:42` |
| `gift_formats_catalog_view` | track | `star-map-app-final/src/components/GiftFormatsTelemetry.tsx:19` |
| `hero_preview_submit` | track | `star-map-app-final/src/components/HeroEditorDeferred.tsx:39` |
| `hero_plan_click` | trackFunnelStep | `star-map-app-final/src/components/HeroEditorDeferred.tsx:44` |
| `print_options_clicked` | track | `star-map-app-final/src/components/HeroEditorDeferred.tsx:51` |
| `proof_request_email_draft_copied` | track | `star-map-app-final/src/components/PostPurchaseProofRequest.tsx:94` |
| `proof_request_email_draft_copy_failed` | track | `star-map-app-final/src/components/PostPurchaseProofRequest.tsx:97` |
| `proof_request_email_clicked` | track | `star-map-app-final/src/components/PostPurchaseProofRequest.tsx:115` |
| `testimonial_request_email_clicked` | track | `star-map-app-final/src/components/PostPurchaseProofRequest.tsx:129` |
| `preview_start_submit` | track | `star-map-app-final/src/components/PreviewStartForm.tsx:217` |
| `hero_plan_click` | trackFunnelStep | `star-map-app-final/src/components/PreviewStartForm.tsx:225` |
| `checkout_started` | trackFunnelStep | `star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx:757` |
| `checkout_failed` | track | `star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx:836` |
| `sticky_secondary_click` | track | `star-map-app-final/src/components/StickyCtaBar.tsx:71` |
| `hero_plan_click` | trackFunnelStep | `star-map-app-final/src/components/StickyCtaBar.tsx:72` |
| `sticky_preview_click` | track | `star-map-app-final/src/components/StickyCtaBar.tsx:82` |
| `landing_view` | track | `star-map-app-final/src/components/analytics/LandingViewTracker.tsx:26` |
| `landing_view` | trackFunnelStep | `star-map-app-final/src/components/analytics/LandingViewTracker.tsx:27` |
| `occasion_selected` | track | `star-map-app-final/src/hooks/useEditorLogic.ts:333` |
| `pro_preset_selected` | track | `star-map-app-final/src/hooks/useEditorLogic.ts:444` |
| `view_item_list` | sendGaEvent | `star-map-app-final/src/lib/analytics.ts:298` |
| `select_item` | sendGaEvent | `star-map-app-final/src/lib/analytics.ts:307` |
| `begin_checkout` | sendGaEvent | `star-map-app-final/src/lib/analytics.ts:320` |
| `checkout_started` | track | `star-map-app-final/src/lib/analytics.ts:339` |
| `purchase` | sendGaEvent | `star-map-app-final/src/lib/analytics.ts:426` |
| `purchase` | track | `star-map-app-final/src/lib/analytics.ts:444` |
| `page_view` | sendGaEvent | `star-map-app-final/src/lib/analytics.ts:528` |
| `funnel_step` | track | `star-map-app-final/src/lib/analytics.ts:640` |
| `checkout_client_blocked` | track | `star-map-app-final/src/lib/analytics.ts:687` |
| `experiment_exposure` | track | `star-map-app-final/src/lib/analytics.ts:715` |

## 3. Public funnel walk and fetch register

Fetch date: report date. No CTA was submitted or checkout entered. Tool errors are not independent HTTP status measurements. Integrated home/editor/pricing sections can share one fetched URL. No failed URL was retried.

| URL | Result / observed content |
| --- | --- |
| https://starmapco.com/ | Failed: UnexpectedStatusCode; home CTA copy unverified |
| https://starmapco.com/shop | Returned shop, preview routes and pricing; crawled last week |
| https://starmapco.com/star-map-gift-ideas | Returned gift/occasion page; crawled last month |
| https://starmapco.com/products/star-map/framed-14x14/usd | Failed: Cache miss; product-specific copy unverified |
| https://starmapco.com/editor | Failed: not accessible via this tool; live editor interactions/copy unverified |
| https://starmapco.com/pricing | Failed: not accessible via this tool; shop supplies pricing instead; dedicated route existence unconfirmed |
| https://ourimprint.ca/ | Returned home, embedded editor and pricing; crawled five days ago; all three surfaces covered here |
| https://ourimprint.ca/gifts/anniversary-gift | Failed: Cache miss; gift-specific copy unverified |
| https://ourimprint.ca/products/fingerprint-art/matte-5x7/cad | Failed: Cache miss; product-specific copy unverified |
| https://github.com/daveybehavey/starMapAppV2/pull/629 | Failed: Cache miss |
| https://github.com/daveybehavey/starMapAppV2/pull/635 | Failed: Cache miss |

### StarMapCo

- **Reach → Act:** [Shop](https://starmapco.com/shop) offers “Start free preview” and “Preview framed print”. Enter date/location, choose format, then enter editor with intent preserved. Data entry and optional format choice precede personal value; no account is advertised as required. Home fetch failed.
- **Act → Convert:** [Gift ideas](https://starmapco.com/star-map-gift-ideas) offers “Preview first, decide later” alongside format routes. Occasion/style browsing leads toward editor entry. This postpones purchase commitment; actual rendering remains unverified after the editor fetch failed.
- **Convert:** [Shop](https://starmapco.com/shop) promises preview before payment. Digital is $9 USD, 16×16 poster $39 USD, framed $99 USD, plus applicable shipping. Country selection precedes destination-specific shipping/transit knowledge; personalization can precede full delivered cost. Payment precedes HD access and physical production. These are advertised steps, not a completed transaction.
- **Earn:** [Shop](https://starmapco.com/shop) links “My Downloads”; downstream use was not tested. Source-only recovery/referral flows: `star-map-app-final/src/app/download/DownloadClient.tsx`, `src/app/success/SuccessClient.tsx`.

Fetched-copy discrepancy: [gift ideas](https://starmapco.com/star-map-gift-ideas) shows a $100 free-shipping threshold; [shop](https://starmapco.com/shop) shows $89. Different crawl ages prevent calling this a confirmed current live mismatch. No pricing change proposed.

### OurImprint

All observations in this subsection come from [the returned home/editor/pricing page](https://ourimprint.ca/).

- **Reach → Act:** “Start your free preview” enters the embedded editor. Two ink-print photographs and permission confirmation precede personal artwork; copy says photos stay on-device.
- **Act:** Personalize names/date/message, composition, colours and size. “Preview free” supplies value before account/payment. “Email it to me” offers a return/guide link with optional marketing consent; delivery was not tested.
- **Convert:** Digital starts CA$19, prints CA$29, framed CA$79. Acceptable prints precede ordinary checkout; payment precedes clean files. “Buy a gift certificate” offers a surprise route with payment before recipient personalization. Checkout was not entered.
- **Earn:** “Restore your purchase” and “Refer a friend” expose recovery/advocacy paths; downstream outcomes untested.

Gift/product fetch failures leave those routes unknown. No private OurImprint implementation or analytics was inspected.

## 4. Friction ledger

Ratings are **expected-impact judgments**, not measured losses or implementation approvals.

1. **Missing decision denominator — High judgment.** Known GA4 fault plus unqueried first-party counts prevents comparing reach scarcity with abandonment (§1; `star-map-app-final/src/lib/analytics.ts`). Inference: selecting NS-1/NS-2 on an assumed conversion rate would be premature.
2. **Entry/reveal semantics — High judgment.** Hydration emits preview_started; reveal flow emits editor_reveal (`star-map-app-final/src/components/EditorExperience.tsx`, `src/app/MobileCreate.tsx`). Inference: treating these as unique new editors or independently verified raster completions misstates activation.
3. **Checkout markers overlap — High judgment.** Generic checkout_started occurs early and through the checkout wrapper; first-party start is separate. Server redirected is URL handoff (`star-map-app-final/src/lib/analytics.ts`, `src/components/EditorExperience.tsx`, `src/app/api/checkout/route.ts`). Inference: summing markers or equating handoff with Stripe arrival hides the actual loss point.
4. **Checkout latency remains open — High judgment.** Client pre-request work is outside server timing, while client timing has no dedicated durable endpoint (`star-map-app-final/src/lib/checkoutClientTiming.ts`, `src/components/EditorExperience.tsx`). Refer to `docs/checkout-performance-2026-11-10.md` and #629/#635 (§2); no latency result, bottleneck or duplicated fix list asserted.
5. **Delivered price follows design effort — Medium judgment.** [Shop](https://starmapco.com/shop) needs country context for shipping. Inference: a physical buyer may personalize before learning the full total. Free preview is a mitigating benefit.
6. **Shipping promise requires fresh comparison — Medium judgment, unconfirmed live.** §3 records different thresholds between [gift ideas](https://starmapco.com/star-map-gift-ideas) and [shop](https://starmapco.com/shop). Inference: simultaneous differences could weaken trust; different crawl ages prevent confirmation.
7. **Preparation before value — High judgment.** Two ink images precede OurImprint personalization (§3, [page](https://ourimprint.ca/)). Inference: more creative alone cannot remove that preparation step; the return-email option could help, but effectiveness is unknown.
8. **Capture surface is not lifecycle performance — Medium judgment.** OurImprint capture is visible (§3); StarMapCo recovery/proof/referral calls exist (`star-map-app-final/src/app/download/DownloadClient.tsx`, `src/components/PostPurchaseProofRequest.tsx`). Inference: neither establishes list size, permission quality, delivery or recovered purchases. Do not conclude both shops have no capture.
9. **Revenue/retention semantics — Medium judgment.** Browser purchase has multiple sends; first-party verification deduplicates and excludes QA/known nonpositive totals (`star-map-app-final/src/lib/analytics.ts`, `src/lib/funnel.ts`). Inference: raw purchase, referral-click or download-event totals cannot substitute for authoritative revenue and retention outcomes.

## 5. NOT MEASURED

- Traffic, unique visitors, sessions, source mix, paid reach, creative impressions and creative engagement for either shop.
- GSC impression totals, clicks, CTR, query mix and landing-page conversion.
- StarMapCo GA4 funnel counts or rates: no usable GA4 data exists under the supplied baseline.
- Production first-party KV counts, PostHog/Pinterest collection, GTM tag delivery and deployed instrumentation parity.
- Unique editor starts, successful render rate, time to first value and abandonment by device or route.
- Checkout attempts, Stripe page arrivals, failure rates and live client/server latency distributions, including cold/warm splits.
- Email list size, capture rate, consent rate, delivery, opens, clicks, return visits and recovered purchases for either shop.
- Revenue, AOV, margin, refunds, repeat purchases, referral conversion and retention; the supplied zero-order baseline is accepted, not remeasured.
- Live behavior or CTA copy on failed-fetch pages, and simultaneous live validity of the differing fetched shipping thresholds.
- A causal comparison or incremental return for NS-1 versus NS-2.

## 6. NS-1 versus NS-2: decision page

**Neither lifecycle email nor creative/content volume is proved to be the binding constraint today.** This is an evidence limit, not a claim that either lacks value. Accepted zero orders and small GSC presence have no qualified-visitor denominator (§1). Source instrumentation establishes possible observations, not observed funnel performance (§2). Fetched surfaces establish preview propositions and commitments, not conversion effects (§3).

**Inference — NS-2:** search visibility does not establish enough qualified reach, nor prove insufficient reach. No channel volume or creative response was measured. More content might bring visitors; this diagnostic cannot quantify that or show they would reach personal value. Evidence: §1 and the NOT MEASURED list.

**Inference — NS-1:** OurImprint already presents email return capture and requires preparation before personal value (§3), making follow-up plausible rather than proved binding. StarMapCo recovery and engagement code (§2) does not establish a functioning pre-purchase nurture funnel or its absence. Without capture/return/abandonment denominators, lifecycle opportunity cannot be ranked against reach.

**Single measurement that would change the answer:** one fixed-window, source-labelled, unique-visitor cohort funnel per shop: qualified landing → personal preview completed → checkout handoff → verified paid order, classifying preview nonbuyers by permissioned recontact availability and whether they return. This is one joined cohort observation, not a sum of unrelated event counters. Distinguish shop/source/device, exclude known QA and expose missing joins. No arbitrary numeric threshold or forecast is prescribed. Existing first-party counters and payment dedupe can corroborate it but cannot alone produce this unique-visitor cohort (`star-map-app-final/src/lib/funnel.ts`, `src/lib/analytics.ts`). Collection implementation is outside this document-only job.

**Inference — interpretation:** very few qualified entrants, with entrants reaching value and proceeding, would favor Reach/NS-2 as the next hypothesis. A material pool of preview-engaged nonbuyers who leave and do not return, with permissioned recontact feasible, would favor NS-1. If loss is concentrated before preview or during checkout, neither growth choice is established as binding; preparation, usability or the separate checkout measurement needs attention first. These are conditional interpretations, not observed volumes or causal proof of incremental lift.

**Decision (judgment):** retain NS-0 as the gate. Do not choose growth work from missing GA4 values or treat zero orders as zero demand. Use this collection map, visible commitments and measurement gaps to obtain the cohort evidence before committing to email or creative volume.
