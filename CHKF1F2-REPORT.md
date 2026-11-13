# perf(checkout): defer funnel analytics off the response path (F1+F2, Tier C)

Bridge job: run-chkf1f2. Branch: perf/checkout-defer-funnel. Base: origin/main at 6b21208b (fetched before creating the worktree). Prepared for Jack to open a DRAFT PR; no push, PR, merge, deployment, or production configuration change was performed.

## Change and exact lifetime mechanism

The six existing funnel calls now run in four request-lifetime promises. Each block creates an async persistence promise, retains its existing awaited bestEffortCheckoutSideEffect calls inside that promise, and immediately registers it with getCloudflareContext().ctx.waitUntil(persistence). This is the same Workers mechanism already used by this route's timing aggregates and queued timing counters (lines 160 and 1160). The imported OpenNext implementation provides the current request context to both handlers; no targeted Worker path lacks access to it.

| Path | Registration in route.ts | Work retained inside the promise |
| --- | --- | --- |
| GET post-create | line 2303 | checkout_session_created, then checkout_redirected |
| POST pre-create | line 2776 | checkout_request_received |
| POST discount-rejected post-create | line 2872 | checkout_session_created only, matching the existing branch |
| POST normal post-create | line 2968 | checkout_session_created, then checkout_redirected |

All step names, payload expressions (source, plan, handoff, trustedCheckoutClassification), diagnostic stage names, and QA guards remain unchanged. Paired post-create steps retain serial ordering inside their registered promise. POST request persistence can overlap later checkout work.

The only deliberate difference from the existing timing helper's fallback is that these new funnel blocks use **await persistence** if context lookup/registration throws (for example, outside Workers). They never introduce an unregistered fire-and-forget fallback. The optimization therefore applies where waitUntil is available; the existing awaited semantics remain outside that runtime.

Stripe creation, both POST idempotency-cache writes, response construction, promotion handling, session parameters, amounts, error responses and timing marks are unchanged. An AST-assisted local comparison verified that the route outside these four funnel blocks is byte-identical after LF normalization, and all six funnel call expressions are unchanged apart from indentation.

## Files changed

- star-map-app-final/src/app/api/checkout/route.ts: wrap the four funnel blocks in registered persistence promises.
- star-map-app-final/scripts/unit/checkoutFunnelDeferral.test.mjs: 16 focused behavioural tests executing actual GET/POST handler tails with controlled I/O, including real response construction and POST cache-write control flow.
- star-map-app-final/scripts/unit/metaCheckout.test.mjs: re-pin the exact checkout-route blob from b82fe1a7d8f009c5f728d496844374b3779382c7 to 75a060dd14c620c0fa6085a292ce95f27007faf7 for the operator-authorized change. The existing fence test and its name remain; promotion policy remains pinned to 927699d1920cc4905f7bbe20c75daaf728a2e467. This does not represent merge approval.
- CHKF1F2-REPORT.md: this bridge report, in place of a PR body.

## Validation

Node v22.23.5, TZ=UTC, sequential tests (--test-concurrency=1). Validation ran from star-map-app-final. The machine defaults to Node 26; Node 22 was installed inside the worktree and prepended to PATH for validation. npm.ps1 itself uses the machine's Node 26 for dependency installation, so validation used direct Node invocations of the package tools to guarantee Node 22. No environment files or production credentials were loaded.

Environment used in PowerShell:

~~~powershell
$env:PATH="$PWD\..\.bridge-tools\node_modules\node\bin;$env:PATH"
$env:TZ='UTC'
$env:TEMP="$PWD\..\.bridge-tools"
$env:TMP=$env:TEMP
~~~

Exact validation commands and outcomes:

| Command | Outcome |
| --- | --- |
| npm install --prefix .bridge-tools --cache .bridge-tools/cache --no-save node@22 (worktree root) | Installed local Node v22.23.5 |
| npm ci (app root; npm_config_cache set to worktree .bridge-tools/cache) | Completed dependency installation; no manifest/lockfile changes |
| node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs | Baseline: 3,100 tests, 3,083 pass, 17 fail. Final: 3,116 tests, 3,099 pass, 17 fail. Both exit 1 for the standing failures; exact failure-name sets identical |
| node --test --test-concurrency=1 --test-reporter=tap star-map-app-final/scripts/unit/checkoutFunnelDeferral.test.mjs (worktree root, explicit local Node executable) | Negative control against unchanged route: 6 pass, 10 fail. Changed route: all 16 pass |
| node node_modules/typescript/bin/tsc --noEmit | Before and after: no diagnostics; after exit 0. The two sentryBrowser diagnostics mentioned in the brief did not occur on this fetched main |
| node node_modules/eslint/bin/eslint.js src scripts tests next.config.mjs eslint.config.mjs playwright.config.ts | Before and after: exit 0, zero errors, the same 15 pre-existing warnings; complete outputs identical |
| node node_modules/eslint/bin/eslint.js scripts/unit/metaCheckout.test.mjs | Final pin update: exit 0 |
| node .bridge-tools/check-scope.cjs (worktree root, explicit local Node executable) | All six funnel expressions unchanged; route outside the four blocks unchanged |
| git diff --check | Passed |

One early exploratory unit invocation started before npm ci had finished and produced missing-dependency failures; it was discarded. The recorded baseline was rerun after installation completed, before route edits. The first complete after-change run had one additional expected whole-file blob-pin failure; the authorized re-pin above resolved it, and the entire suite was rerun to obtain the final set below. No standing failures were removed or renamed.

New coverage includes GET/POST, digital/print, browser/missing handoff; blocked funnel writes with responses completing before release; exact step payloads after draining waitUntil promises; throwing writes with identical response status/body and subsequent steps retained; QA exclusion; awaited persistence without Worker context; and both normal/discount-rejected POST branches keeping cache writes awaited even while funnel writes remain blocked. Eight negative-control cases failed because the original response awaited the blocked funnel; two cache cases failed because the original pre-create funnel prevented reaching the cache. These are handler-tail tests, not deployed Worker or live Stripe tests.

GitHub Actions remains the authoritative validator. Build/Playwright and live production validation were not run for this narrow telemetry change.

### Exact failure NAME sets

Before set = after set (17 names, sorted):

- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- aggregate rating helpers are referenced nowhere outside the lib module
- business profile never publishes phone; href stays empty
- city prune: next.config keeps the host redirects alongside the city map
- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- composition: the renderer consumes the SAME clip path for the sky and the watermark
- deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
- fails with the exact command and spec when Playwright discovers zero tests
- fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
- fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
- frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
- no public copy states a review count or a numeric rating for StarMapCo
- passes when every named critical smoke command discovers tests
- retired posts permanently redirect one hop to the survivor
- saved-map API sanitizer validates and retains fontWeight
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers

## Expected saving (estimate, not measured)

The supplied production sample was 19 instrumented attempts over 28 days: post_create approximately 1,061 ms mean, pre_create approximately 908 ms, total approximately 2,875 ms. Removing the awaited post-create funnel rounds and POST request-received round is estimated to save **approximately 1.2–1.5 seconds from the approximately 2.9-second mean**. This is an estimate to verify in the unchanged production timing counters after an approved merge/deployment, not a measured result from this build. The load-bearing POST cache write stays on the response path.

## Bundle handoff

Worktree: C:\Users\ReuseTechBC\projects\sm-chkf1f2

Bundle creation/verification commands (run after committing this report):

~~~powershell
git bundle create C:\Users\ReuseTechBC\projects\qchkf1f2.bundle perf/checkout-defer-funnel
git bundle verify C:\Users\ReuseTechBC\projects\qchkf1f2.bundle
~~~
