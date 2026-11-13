# CHK-F4 — checkout session interior instrumentation

Bridge job `run-chkf4`, 2026-11-13. Branch `perf/checkout-f4-instrument`.

## Base and delivery

Fetched origin before creating `C:\Users\ReuseTechBC\projects\sm-chkf4` from origin/main.
Recorded base: `3d6c52682a9687830d095d73b4343740f5fdce3a`.
`git merge-base --is-ancestor c6e3840a HEAD` (#645) and
`git merge-base --is-ancestor 62e82b74 HEAD` (#646) both exited 0 before edits.
The original checkout's local changes were left untouched.

Local commits and bundle only. Return bundle: `C:\Users\ReuseTechBC\projects\qchkf4.bundle`.
Jack opens the PR. No push, PR creation, merge, deployment, production configuration
change, live service invocation, email send, spend, or EuroPools work was performed.

## Instrumented stages

These are sequential interior slices of `createCheckoutSession`, before the existing
`stripe_create` mark. They are not an opaque SDK call. The existing Stripe timer,
its fallback coverage, and all existing timing stages remain unchanged.

| Stage | Collector/log field | Work covered |
| --- | --- | --- |
| `session_setup` | `sessionSetupMs` | Function entry, input normalization, merch resolution, pricing reads, country/currency selection and URLs |
| `session_shipping` | `sessionShippingMs` | Shipping selection, including the existing nested live merch/Printful quote |
| `session_line_items` | `sessionLineItemsMs` | Shipping result handling, metadata, geo pricing, and line-item assembly |
| `session_validation` | `sessionValidationMs` | Promotion estimate, free-shipping selection, CAD mirror estimate and margin checks |
| `session_params` | `sessionParamsMs` | Consent selection, Stripe session-parameter assembly, helper definitions and expiry-bound idempotency key, up to the existing Stripe timer |

The five stages partition the pre-Stripe interior on success (apart from tiny clock/mark
overhead). Shipping includes `printful_quote`; do not add both to calculate total time.
Digital shipping and validation slices still record their short branch-evaluation work.
A synchronous finally records elapsed time for the current stage on an early error;
unstarted stages remain null and produce no counters. Once Stripe starts, the interior
timer is finalized and the finally is a no-op, so Stripe/recovery latency cannot leak in.
This instrumentation measures; it makes no claim about the residual's cause or savings.

## Counter names and persistence

For each stage above, fixed allowlisted counters are:

- `stage_<stage>_count`
- `stage_<stage>_sum_ms`
- `stage_<stage>_lt1s`, `stage_<stage>_1_3s`, `stage_<stage>_3_10s`,
  `stage_<stage>_10_30s`, `stage_<stage>_gt30s`

They use the unchanged `checkout_timing:daily:<YYYY-MM-DD>:<counter>` and
`checkout_timing:total:<counter>` writer/read shape and existing daily TTL. Each reached
stage increments count and exactly one bucket. Sums use the existing integer-ms rounding;
zero sums do not write an increment. Existing QA exclusions remain in force.

Clock: `performance.now()`, as used by the existing server marks. New route marks only
mutate the request collector; they contain no await and no persistence call. The existing
aggregate persistence promise writes all stage increments via best-effort handling and
Workers `waitUntil`. No new response-path awaited write is introduced, so no new deferral
block or fallback is needed. The pre-existing aggregate helper's off-Workers unregistered
fallback is unchanged; F1/F2 funnel persistence and its awaited fallback are also unchanged.
No endpoints, storage system, production vars, or funnel events were added.

## Behaviour preservation and focused coverage

The new negative control strips only seven explicitly marked F4 insertion blocks and the
new import, then checks the complete route against the SHA-256 of its LF-normalized base
bytes. This includes all session params, price/promo expressions, idempotency, consent,
GET/POST handlers, cache writes, funnel deferral and response construction.

Two runtime controls execute the actual baseline and instrumented session function with
controlled I/O for digital and print. Serialized Stripe arguments and options are exactly
equal, returned results match, expiry-bound idempotency is pinned, and the real consent
helper with `STRIPE_CONSENT_PROMOTIONS_AUTO=0` produces `{}` with no consent fallback.
Fake-clock tests assert each new stage's count/sum/bucket and log attribution, partial
failure timing for all five stages, skipped-stage counters, no clock access without a
collector, and idempotent finalization that excludes subsequent Stripe latency.

The existing route-blob fence was re-pinned from
`75a060dd14c620c0fa6085a292ce95f27007faf7` to
`03e5c24db0d0a0f300c064175752a57591e2b71d` for this explicitly authorized instrumentation.
Its name and assertion remain; the promotion-policy pin is unchanged. This is not approval
to merge or deploy.

## Files changed

- `star-map-app-final/src/app/api/checkout/route.ts`: interior marks and finally.
- `star-map-app-final/src/lib/checkoutTiming.ts`: collector, log fields, allowlisted stages and monotonic timer.
- `star-map-app-final/scripts/unit/checkoutInteriorTiming.test.mjs`: new clock/error and byte/runtime negative controls.
- `star-map-app-final/scripts/unit/checkoutTiming.test.mjs`: extend all-stage aggregate fixture.
- `star-map-app-final/scripts/unit/metaCheckout.test.mjs`: documented route-blob re-pin.
- `CHK-F4-REPORT.md`: this report.

## Local validation

Windows PowerShell, Node 22.23.5, TZ=UTC, full suite concurrency 1. The machine's default
Node 26 ran npm installation; validation explicitly used the local supported Node 22.
No .env files or production credentials were used. Dependencies finished installation
before the baseline. `git diff --quiet` exited 0 before and after that baseline run.
Local raw evidence is in `.bridge-evidence/` and is not committed.

Setup commands:

```powershell
git fetch origin
git worktree add C:\Users\ReuseTechBC\projects\sm-chkf4 -b perf/checkout-f4-instrument origin/main
npm install --prefix .bridge-tools --no-save node@22
# From star-map-app-final:
npm ci
$env:PATH="$PWD\..\.bridge-tools\node_modules\node\bin;$env:PATH"
$env:TZ='UTC'
```

Both npm installs exited 0. No manifest or lockfile changed.

Validation commands (app directory, Node 22 on PATH):

```powershell
node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs
node --test --test-concurrency=1 scripts/unit/checkoutInteriorTiming.test.mjs scripts/unit/checkoutTiming.test.mjs scripts/unit/checkoutClientTiming.test.mjs scripts/unit/checkoutFunnelDeferral.test.mjs scripts/unit/stripeConsentCollection.test.mjs scripts/unit/metaCheckout.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src scripts tests next.config.mjs eslint.config.mjs playwright.config.ts
git diff --check
```

The focused command passed **122/122** (exit 0). An initial focused run was 36/37:
a new forbidden-token assertion accidentally matched `sessionParamsMs` as `sessionParams`;
word boundaries fixed the assertion. The route-byte hash and runtime comparisons passed
in that initial run as well. No standing failure was fixed or removed.

Build, Playwright, live Stripe/Printful and production timing were not run for this
instrumentation-only change. GitHub Actions remains the authoritative validator; none
was triggered by this local bundle delivery.

### Full-suite result and exact failure-name comparison

| Check | Baseline | Final |
| --- | --- | --- |
| Full unit suite | 3,123 tests; 3,106 pass; 17 fail (exit 1) | 3,133 tests; 3,116 pass; 17 fail (exit 1) |
| Typecheck | exit 0 | exit 0 |
| Lint | exit 0; 17 warnings, 0 errors | exit 0; identical output |

The sorted failure-name multisets, including nested failures, are exactly identical:
zero added, zero removed. All ten new tests pass. This satisfies the requested Windows
baseline criterion; it is not an all-tests-pass claim. The current supported-Node baseline
was measured on the recorded base rather than assuming the older Node 26 report's 19 failures.

Unchanged failure names:

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

SHA-256 evidence hashes:

- baseline.tap: `b1d16cee9663efc2c5a1fa959e41ccb75c67b4f539d8adb2af95664c808b0cf2`
- final.tap: `51a67837fc4d3e914c17b2d74d6fa8b30c261cb3c5b47c816cd7320698c06478`

`git diff --check` passed after removing trailing blank lines. Only whitespace cleanup
followed the final suite; no executable code or assertions changed afterward.

Bundle creation/verification commands (worktree root):

```powershell
git bundle create C:\Users\ReuseTechBC\projects\qchkf4.bundle perf/checkout-f4-instrument ^3d6c52682a9687830d095d73b4343740f5fdce3a
git bundle verify C:\Users\ReuseTechBC\projects\qchkf4.bundle
git bundle list-heads C:\Users\ReuseTechBC\projects\qchkf4.bundle
```

The incremental bundle requires the recorded base. It contains this committed report
and the branch's changes; local dependency/tool directories and raw logs are excluded.
