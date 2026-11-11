# Checkout performance — Latitude, 2026-11-10

Owner-authorized local performance work on `astra/work`, based on freshly fetched
`origin/main` / `905ac521`. No push, PR, merge, deployment, or production access.
Jack's November 10 instruction supersedes the older checkout fence for this
bounded speed-only change. Pre-existing local files and AGENTS edits were preserved.

Outcome: one local telemetry-wait fix, measured only with controlled I/O; real
cold/warm checkout latency remains blocked by missing test credentials. Lint,
typecheck, build, render smoke and full smoke passed. Unit and commerce suites
remain non-green for the failures detailed below; this is not merge-ready evidence.

## Result and profiling blocker

The application runs locally, but **the full checkout-to-Stripe profile is blocked**.
Only `.env.example` exists; `STRIPE_SECRET_KEY`, `PRINTFUL_API_TOKEN`, and
`PRINTFUL_STORE_ID` are absent from the inherited environment. No secrets were
read or added. Node 22.23.4 was obtained using `npm exec --yes --package=node@22`;
the machine's default Node 26.13.0 was not used for test executables.

`npm run dev -- --hostname 127.0.0.1 --port 3017` started successfully and
`GET /editor` returned 200. A local POST of a subscription plan with a correctly
shaped presence-only browser handoff token returned HTTP 503, reason
`stripe_not_configured`. The initial tokenless and malformed-token diagnostic
requests returned the expected 403 `checkout_handoff_required`.
The dev server was stopped after diagnosis.

No successful browser checkout walk or Stripe redirect occurred. Dummy keys and
local KV cannot reproduce external latency. The reported live ~30 seconds is
**neither confirmed nor contradicted**. No dominant production stage or <2-second
completion claim is justified by this environment.

| Production stage vocabulary | Cold successful walk | Warm successful walk |
| --- | --- | --- |
| `pre_create` | unavailable | unavailable |
| `promo` (nested inside `pre_create`) | unavailable | unavailable |
| `printful_quote` (merch only) | unavailable | unavailable |
| `stripe_create` | unavailable | unavailable |
| `post_create` | unavailable | unavailable |
| `total` | unavailable | unavailable |

For diagnosis only, the failed subscription request logged cold `pre_create=373.1ms`,
`promo=0ms`, `total=377.8ms`; the three remaining stages were null. This is an
early error, not a checkout latency sample. The HTTP request also included work
outside the logged timer. These values must not be used as before/after evidence.

## One bounded fix

Local commit: `b19c83a5` — `perf(checkout): stop awaiting timing-counter persistence`.
Authored as `Astra (Codex) <astra@localhost>` using per-command Git configuration;
the checkout had no configured author identity. No global/local Git config changed.

`src/app/api/checkout/route.ts`, `flushQueuedTimingCounters`: register the existing
best-effort persistence promise with Workers `ctx.waitUntil`, matching the route's
existing stage-aggregate persistence. Previously this flush awaited one counter
after another before returning the Stripe URL. It runs after `stripe_create`
finishes and before `post_create` begins, so its latency was visible in `total`
but absent from those component stages.

Counter names, increments, QA exclusion, serial write order, and every existing
success/error flush site remain unchanged. Empty flushes do nothing. Failures
remain caught by the existing best-effort wrapper. Off Workers, persistence runs
unregistered, as the existing aggregate writer does; durability across process
termination is not guaranteed there. Production Worker lifetime behavior still
requires runtime validation. No Stripe/Printful request or buyer response changed.

### Measured isolated effect, not a checkout walk

`node scripts/benchmark-checkout-timing-persistence.mjs 905ac521` executes the actual
baseline and changed route closures, with two counter writes, each delayed 100ms.
Five trials per version, Node 22.23.4, TZ=UTC; every trial verifies both writes
finish. This demonstrates removal of an avoidable dependency, not real KV latency.

| Response wait | Before, ms | After, ms |
| --- | --- | --- |
| Trial 1 | 215.13 | 0.29 |
| Trial 2 | 216.26 | 0.18 |
| Trial 3 | 216.73 | 0.08 |
| Trial 4 | 215.31 | 0.05 |
| Trial 5 | 218.75 | 0.07 |
| Median | **216.26** | **0.08** |

This helps merch requests and requests with fallback counters. A plain digital
checkout with no fallback queues no event counters and gains nothing from it.
The 100ms delay is injected, not observed from Stripe, Printful, or production KV.

## Static attribution and call counts

Paths below are relative to `star-map-app-final/`. Counts are code-path counts,
not measured requests. A normal fresh request is assumed; cache hits and errors
can exit earlier.

1. **Before the API timer:** `src/components/EditorExperience.tsx` saves a map with
   one `/api/maps` POST unless the loaded ID and recipe fingerprint match. Print
   checkout waits for fonts, tries one asset-resolution GET, then renders/encodes
   and uploads if reuse fails. Main artwork can try five or six widths and seven
   JPEG qualities per width; size checks skip overlarge uploads (16 MiB decoded
   ceiling). A card add-on has its own asset preparation. Checkout sends IDs and
   options, not the artwork, to `/api/checkout`. The client permits two checkout
   attempts, with a 400ms retry delay or 1200ms for rate limiting. All this can
   contribute to a buyer's wait beyond one server `total` sample. Rendering,
   compression, asset identity, and upload quality were left unchanged.
2. **`pre_create`:** `src/app/api/checkout/route.ts` awaits rate limiting (one KV
   increment), optional referral lookup (one KV get), reusable asset lookup
   (index then asset: up to two KV gets per lookup), saved-map validation
   (one KV get), promo resolution, and POST idempotency cache lookup (one KV get).
   Before fresh POST creation it also awaits `checkout_request_received` funnel
   persistence. A normal allowlisted source/plan/handoff writes eight counters
   in parallel per funnel step. The KV adapter implements each increment as a
   read followed by a write, so eight increments mean sixteen binding operations.
   Asset/map server validation cannot simply trust the client's copies.
3. **`promo`:** nested within `pre_create`, zero Stripe calls with no code;
   otherwise one configured promotion retrieve or one promotion list, with
   expanded coupon data. It does not cover later discount estimation. Reordering
   this ahead of guards could issue calls for requests currently rejected early.
4. **Unattributed session preparation:** `resolveMerchForCheckout` precedes the
   quote timer. Fixed variants resolve locally. Apparel uses
   `src/lib/printfulCatalogV2.ts`: serial pages of 100 variants, up to 50 requests
   on a cold cache; zero on an existing cached promise. The promise is already
   shared per product/region, including concurrent callers. Rejections are also
   retained. Catalog fetches have no explicit abort timeout. This is a cold/warm
   candidate hidden in `total`, not evidence that it caused the live stall.
5. **`printful_quote`:** merch makes one POST to `/v2/shipping-rates`, after
   variant resolution and before Stripe creation. There is no explicit timeout
   or quote cache in `src/lib/printfulShippingRatesV2.ts`. Ordinary framed/poster/
   canvas print checkout uses synchronous configured/rate-table shipping, with
   **zero live Printful quote calls** here. Do not attribute every print stall to
   Printful. Caching quotes or changing timeout/fallback policy could change
   charged shipping or availability; neither was changed.
6. **More unattributed preparation:** product-scoped promotion estimates can
   await one Stripe price retrieve per uncached distinct configured price ID,
   serially across line items. `getStripeProductIdForPrice` already caches the
   promise, so repeated estimates (including CAD/USD checks) share it. These
   calls happen after `pre_create` and before `stripe_create`, outside `promo`.
   Parallelizing distinct IDs is a candidate only after measurement; Stripe
   call ordering and pricing checks were preserved.
7. **`stripe_create`:** one normal session-create SDK invocation. Consent
   fallback and discount fallback can each add creates (up to four create
   invocations through their nested paths), and missing URL recovery adds up to
   one retrieve. Each SDK call retains the configured 20-second timeout and
   two network retries; SDK invocations therefore are not wire-attempt counts.
   A single call with retries could exceed 30 seconds. This is a possibility,
   not attribution. Payloads, fallback ordering, keys, and retry policy are fenced.
8. **Gap fixed here:** up to four queued event counters (one quote bucket plus
   three fallback flags), each issuing total+daily increments concurrently.
   Before this change those counter pairs were awaited serially. At four events
   this is eight KV increments / sixteen binding operations, outside the named
   quote/Stripe/post stages. Stage-aggregate persistence was already nonblocking.
9. **`post_create`:** POST awaits an optional idempotency handoff-cache write and
   then two funnel steps serially. On the normal allowlisted path that is one
   cache put plus sixteen increments / thirty-two binding operations. GET has
   the two funnel steps without the POST handoff-cache write. Funnel steps are
   plausible further deferral candidates, but are business analytics rather
   than the new timing instrumentation; no change was made without profiling.
   The handoff-cache write was deliberately kept on the path to preserve reuse.

## Production confirmation after a separately approved deployment

Use aggregate-only reads of `checkout_timing:daily:<YYYY-MM-DD>:<counter>` or
deltas of `checkout_timing:total:<counter>` for comparable windows. For each stage,
mean = delta `stage_<stage>_sum_ms` / delta `stage_<stage>_count`; inspect `lt1s`,
`1_3s`, `3_10s`, `10_30s`, and `gt30s` bucket shares as well. The last bucket starts
at 30,000ms, despite its name. Never treat an absent/null stage as zero.

`checkout_attempts` counts non-QA emitted timing records (including caught errors),
not all clicks or early rejections; cached URL replays return before this instrumentation. QA requests
log timings but skip persistent timing counters. Use stage counts as duration
denominators and attempts for fallback rates. `promo` overlaps `pre_create`, so
do not sum them. Mixed stage populations also prevent subtracting aggregate
means to estimate a residual; use matched timing log records for that.

Check `consent_fallback_fired`, `discount_fallback_fired`, `url_recovery_fired`
and the original `printful_quote_*` counters per attempt. A successful change
should reduce `total` on affected requests without a comparable reduction in
`stripe_create`, and preserve event-counter delivery after background writes
settle. An unchanged total or a dominant Stripe/quote duration refutes this as
the main stall fix. KV totals contain no cold/warm or product dimensions: use
the existing structured logs (`cold`, isolate age, checkout kind, outcome) to
separate those populations, without publishing raw customer/session data.

If API totals are fast while the browser stalls, time click-to-request and
response-to-navigation separately. If cold apparel totals dominate with low
named stages, measure the catalog gap. Acquire an approved isolated Stripe test
configuration and Printful sandbox/approved read-only quote setup before a real
cold/warm redirect walk; do not substitute production credentials.

## Validation and delivery

All test processes used Node 22.23.4 and `TZ=UTC`; commands were run sequentially
from `star-map-app-final/`. On Windows the installed npm PowerShell shim selects
its adjacent Node 26 even when PATH starts with Node 22. For the refreshed run,
`npm` below was a session-only function invoking:
`node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'` with Node 22 first
in PATH. Nothing was added to a shell profile or repository configuration.

| Command | Result |
| --- | --- |
| `npm ci` (explicit Node 22 launcher) | Pass; 751 packages installed; existing Playwright patch applied; package/lock files unchanged |
| `npm run lint` | Pass; 0 errors, 14 warnings in unchanged files |
| `npm run typecheck` | Pass |
| `npm run build` | Pass; 118 static pages generated |
| `node node_modules/playwright/cli.js install chromium` | Pass; installed Playwright Chromium/headless shell build 1200 |
| `npm run qa:smoke:commerce` | 32 tests: 31 passed, 1 failed, 0 skipped; exit 1 |
| `npm run qa:smoke:render` | 9 tests: 9 passed, 0 failed, 0 skipped; exit 0 |
| `npm run qa:smoke` | 23 tests: 23 passed, 0 failed, 0 skipped; exit 0 |
| `node --test --test-concurrency=1 scripts/unit/checkoutTimingPersistence.test.mjs scripts/unit/checkoutTiming.test.mjs` | 13 passed, 0 failed, 0 skipped |
| `node --test --test-concurrency=1 scripts/unit/*.test.mjs` | **2,780 tests: 2,764 passed, 16 failed, 0 skipped; 3 suites; exit 1** |
| `node scripts/benchmark-checkout-timing-persistence.mjs 905ac521` | Both versions completed five trials and all writes; measurements above |

The full suite is **not green**. Failures in the refreshed run:

| Unchanged unit file | Failed tests | Evidence |
| --- | ---: | --- |
| `cityPagesPrune.test.mjs` | 2 | Windows absolute-path ESM imports reject protocol `c:` |
| `fathersDayBlogMerge.test.mjs` | 1 | Same Windows ESM path error |
| `deployProductionBridge.test.mjs` | 1 | Source assertion cannot find expected Cloudflare deployment step |
| `dl1Slice4Publication.test.mjs` | 1 | Byte assertion sees CR instead of LF |
| `frameInsetPurpose.test.mjs` | 1 | Renderer source regex includes LF-only boundaries |
| `personaSweepWaveD.test.mjs` | 1 | Renderer import source regex includes LF-only boundary |
| `kvBackup.test.mjs` | 1 | POSIX mode expectation: actual 438 versus expected 384 on Windows |
| `playwrightSmokeManifest.test.mjs` | 2 | `spawnSync npm.cmd EINVAL` |
| `reviewCountsHidden.test.mjs` | 2 | Source/path assertions, including backslash path failing module exclusion |
| `settlementMitigation.test.mjs` | 1 | Source pin for cookie preservation |
| `textFontWeight.test.mjs` | 1 | Saved-map sanitizer source assertion |
| `watermarkMaskAnchor.test.mjs` | 2 | Preview/renderer source assertions |

No failed test file or its source target was edited by this change. A separate
full baseline checkout run was not performed; these are unchanged-file failures,
not a claim that GitHub Actions on Linux fails identically. They were left outside
this performance fix. GitHub Actions was not triggered and remains the authoritative
validator before any future approval.

Diagnostic history: the first full unit run against existing `node_modules` had
2,777 tests: 2,760 passed / 17 failed / 0 skipped. Its additional failure was missing
`react-test-renderer`; `npm ci` resolved it. The first build was interrupted to
repair dependencies, and a first npm install using the machine's Node 26 launcher
was interrupted and replaced with the explicit Node 22 install. The focused test's
first attempt had 11 passes and one module-load failure from CRLF extraction;
normalizing the test's source input fixed that, after which all 13 passed. No app
behavior was changed to accommodate a platform-specific test.

The first smoke attempts exposed a missing Chromium executable: commerce had
8 API-only passes / 24 browser-launch failures (32 tests); render had 0 passes /
9 browser-launch failures. The following full-smoke attempt was interrupted to
install the pinned browser; it has no completed count. Browser checks were then
rerun with `PW_FORCE_NEW_SERVER=true` and the scripts' existing `--workers=1`.
The remaining commerce failure is `tests/map-hub-editor.spec.ts:35`: saved-map
hydration never exposes the first canvas within 30,000ms. This test fails before
checkout and its implementation files were not changed. All other 31 commerce
tests passed. It is recorded rather than expanded into an editor fix.

Detailed local logs are in the ignored `star-map-app-final/.tmp/checkout-performance/`.

Deliberately untouched: prices/currencies/SKUs/promotions, Stripe and Printful
payloads or ordering, idempotency and handoff cache semantics, retry/timeout and
fallback policy, buyer UI/flow, rendering/upload fidelity, downloads,
fulfilment/webhooks/order writers, production config, secrets, unrelated files.
No claim is made that all remaining stages are below two seconds or at an external
service floor. Further tuning stops here because the production-shaped profile
is blocked and the remaining candidates need evidence or change payment semantics.

## Bridge re-entry verification

The repeated bridge instruction found the implementation and report already committed
as `b19c83a5` and `534052a5`. A fresh `git fetch origin main` succeeded:
`git rev-list --left-right --count HEAD...origin/main` returned `2 0`, so the
existing work includes current origin/main (`905ac521`). No duplicate fix was made.
Presence-only checks reconfirmed that STRIPE_SECRET_KEY, PRINTFUL_API_TOKEN and
PRINTFUL_STORE_ID remain absent; only .env.example exists locally.

Reverification used Node 22.23.4 and TZ=UTC, sequentially from the app directory:

- `npm exec --yes --package=node@22 -- node --test --test-concurrency=1 scripts/unit/checkoutTimingPersistence.test.mjs scripts/unit/checkoutTiming.test.mjs`: 13 passed, 0 failed, 0 skipped.
- `npm exec --yes --package=node@22 -- node scripts/benchmark-checkout-timing-persistence.mjs 905ac521`: before samples 220.33, 220.13, 221.11, 219.60, 217.65 ms; after 0.25, 0.05, 0.03, 0.04, 0.10 ms. Median 220.13 ms before / 0.05 ms after, with both injected 100 ms writes completing in each trial. These remain synthetic persistence measurements, not a checkout walk.

Existing final-unit.log and final-commerce.log confirm the recorded 2,764 pass /
16 fail and 31 pass / 1 fail results. The full suite was not rerun on re-entry;
no implementation changed. The missing credentials and non-green suite remain
unresolved limits. No push, PR, merge, deploy, or production access occurred.
