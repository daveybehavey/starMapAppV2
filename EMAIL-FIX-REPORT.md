# EMAIL FIX REPORT — PR #630, cycle 1 of 2

Owner brief: Jack, 2026-11-11. Base: `5e09a72a87025815372d58bc844f7798b43482ab`.
Worktree: `C:\Users\ReuseTechBC\projects\sm-email-fix`.
Branch: `fix/email-r03-fixes`. Local commits only; no push, merge, deployment, or sends.

## FIX-1 — preserve existing dispatch permission

Files (under `star-map-app-final/`):
- `src/lib/promotionCoordinator.ts`
- `scripts/unit/emailR03StageA.test.mjs`

Capture validates the disclosure, reads the coordinator, and calls the existing `gatherPromotionLegacyFacts` only when that identity has no coordinator document. The existing request transition imports those permission facts only on document creation, including if another request creates the document between the read and mutation. Existing documents remain authoritative and skip the legacy read. Pending capture completes no consent event and creates no receipt. Unsubscribe/global and deliverability suppression continue to refuse permission.

Tests cover legacy list membership, a legacy subscribed timestamp, a legacy unsubscribe, a fresh identity, and an existing deliverability-suppressed authority whose facts remain identical. All use synthetic local facts and forbid network calls. The original Stage A isolation test is updated to expect the specifically authorized initial permission read and forbid repeated legacy reads for an existing document; its no-provider assertion remains.

This is the existing dispatch-permission import, not R-03 consent-evidence reconstruction. No legacy 68-subscriber record was accessed, migrated, backfilled, or relied upon. RB-1 remains **NOT PASSED**; reliance remains barred.

Commit: `141fca02` — fix(email): preserve legacy permission during pending capture (#630).

## FIX-2 — native form navigation and truthful feedback

Files (under `star-map-app-final/`):
- `src/app/api/promotions/consent-request/route.ts`
- `src/components/PromotionSignup.tsx`
- `src/lib/promotionSignupStatus.ts`
- `src/app/page.tsx`
- `src/app/HomeStaticSections.tsx`
- `src/app/editor/EditorPageClient.tsx`
- `scripts/unit/emailR03FixRoute.test.mjs`

Response selection uses **Accept negotiation**: requests accepting `text/html` receive a 303 redirect, unless they also explicitly accept `application/json`; JSON takes precedence. Missing Accept and `*/*` retain JSON. Native HTML form submission remains JavaScript-free.

The return URL comes from a same-origin `Referer` whose pathname is `/` or `/editor`. Missing, malformed, external, or non-storefront referrers fall back to `/`. Existing query parameters (for example `mode=quick`) are retained; `promo` is replaced and stale `code` is removed. No new status parameter is introduced and no code is issued.

| Outcome | Browser redirect query | API response unchanged |
| --- | --- | --- |
| Recorded pending | `promo=pending` | 200, `ok: true`, `status: pending`, pending message |
| Invalid body / fresh consent required | `promo=error` | 400, `invalid_request` / `fresh_consent_required` |
| Rate limited | `promo=rate_limited` | 429, original JSON and Retry-After |
| Capture unavailable | `promo=capture_unavailable` | 503, `capture_unavailable` |

Existing consumers: `src/app/page.tsx` reads `resolvedSearchParams.promo` and `.code`, passes status/code through `HomeStaticSections` to `PromotionSignup`; `src/app/editor/page.tsx` already reads those same two parameters and passes them to `EditorPageClient`. The home parser and editor rendering now recognize the additional status values. Shared status messages prevent the two surfaces from disagreeing.

Pending renders exactly: **Request recorded. Email confirmation is not yet available. Your subscription is not complete.** It does not enter the existing success/code state. Invalid input, rate limits, and unavailable capture have distinct, truthful feedback.

Route tests exercise all four outcomes for both home and editor redirects and for JSON callers, malformed form bodies, unsafe/missing referrers, unspecified Accept, and actual server-rendered form feedback with a stale code supplied.

Commit: `a829075f` — fix(email): return native signup posts to storefront status (#630).

## Validation

Windows; Node `v22.23.4`; `TZ=UTC`; `--test-concurrency=1`. Full suites run sequentially, not in parallel. Baseline tracked files were restored byte-for-byte from the base commit for the baseline run (`git diff --quiet` returned 0), then the saved changes were restored.

| Run | Tests | Passed | Failed |
| --- | ---: | ---: | ---: |
| Base 5e09a72a | 2790 | 2774 | 16 |
| Final fixes | 2811 | 2795 | 16 |
| Focused Stage A + fixes | 33 | 33 | 0 |

Full failure-name sets match exactly: **zero new failures**. All twelve original Stage A tests and all 21 added tests pass. Full runs each have 3 suites, zero cancelled/skipped/todo. Lint: PASS (0 errors, 14 existing warnings). Typecheck: PASS. Diff whitespace and frozen dispatch-file checks: PASS.

Unchanged baseline failures:
- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- aggregate rating helpers are referenced nowhere outside the lib module
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

Exact validation commands from `star-map-app-final/` unless noted:

```powershell
$env:PATH='C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin;'+$env:PATH
$env:TZ='UTC'
node --version
node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs
node --test --test-concurrency=1 --test-reporter=tap scripts/unit/emailR03StageA.test.mjs scripts/unit/emailR03FixRoute.test.mjs
npm run lint
npm run typecheck
# Worktree root:
git diff --check 5e09a72a
git diff 5e09a72a --exit-code -- star-map-app-final/src/lib/promotions.ts star-map-app-final/src/lib/promotionDispatchGuard.ts
```

Initial focused run: 32/33 passed. One new test mistakenly excluded the mutable pending slot from only one side of its authority-facts comparison; correcting the test comparison produced 33/33. No production change was needed for that failure.

Local full TAP and lint/typecheck/install logs are retained in the gitignored `star-map-app-final/.tmp-email-fix/` directory; only the concise report is committed. GitHub Actions was not triggered; CI remains the authoritative validator after the bridge handoff. Build and Playwright were not run in this cycle; the requested suite, lint and typecheck were run.

## Bundle and boundaries

Bundle: `C:\Users\ReuseTechBC\projects\email-fix.bundle`. Created with the requested command from the worktree root; existence and `git bundle verify` checked after the report commit.

```powershell
git bundle create ..\email-fix.bundle fix/email-r03-fixes ^origin/feat/email-r03-stage-a
Test-Path ..\email-fix.bundle
git bundle verify ..\email-fix.bundle
```

Both dispatch-fence files (`promotions.ts`, `promotionDispatchGuard.ts`) are byte-unchanged from base. No U4–U7 or H predicate work. No changes to production configuration, sends, checkout, payments, downloads, print pipeline, prices, or reliance posture. The original checkout, `sm-email-r03`, and `_jack-briefs` were not edited; the requested initial fetch/worktree creation were the only setup operations in the original checkout.

## Divergences and environment notes

No scope divergence. Home/editor status wiring and the shared feedback module are necessary to make FIX-2 visible through the existing contract. The old zero-legacy-read Stage A assertion was updated because FIX-1 explicitly requires the pre-existing permission import; the original twelve Stage A tests still pass.

Dependency setup used `npx --yes --package=node@22 -c "npm ci"`; the installed Windows npm launcher still used its bundled Node 26 for installation (engine warning, install succeeded and patch-package ran). Every test run explicitly used Node 22.23.4. An initial baseline invocation from the worktree root was interrupted and discarded; the reported baseline was rerun from the application directory. Git lacked author configuration, so commits used per-command `-c user.name=Codex -c user.email=codex@users.noreply.github.com`; no shared Git configuration changed. No attempt to push was made and no remote PR metadata was changed, as this brief requests a local bundle handoff.
