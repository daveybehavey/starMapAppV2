# Email R-03 Stage A evidence — 2026-11-10

Authorization: Jack's job setup of 2026-11-10. Governing documents: `C:/agent/codex-jobs/briefs/rdk-r03-build-spec-2026-11-06.md` (ratified), the email build brief of 2026-11-10, and the Astra red-team memo of 2026-11-10. The spec governs the brief. Scope is U1–U3, StarMapCo only.

Base: `905ac5215f5d25b9ad1dacd3cc2b62ea2178be6c`, fetched `origin/main`; local main was fast-forwarded from `e9e46f1d`. Tested implementation: `155ce082dc63650952ae71ee1a3b84136270cbb2`. Branch: `feat/email-r03-stage-a`. No PR, merge, deployment, production-data operation, or real email send was performed. Existing screenshot modifications were excluded from the commit.

## Implementation and files

All application paths below are relative to `star-map-app-final/`.

| File | Change |
| --- | --- |
| `src/components/PromotionSignup.tsx` | Visible shared versioned wording, unchecked required affirmative control, hidden version/hash; request submits to the pending-only Stage A route. |
| `src/app/api/promotions/consent-request/route.ts` | Validates address/action/version/hash, rate limits and honeypot; creates pending consent only, discards raw confirmation token, returns honest pending/no-delivery state. |
| `src/lib/promotionDisclosure.ts` | Frozen append-only version artifact: exact UTF-8 wording and SHA-256 stamp, sender/scope/channel/locale/variant/control/presentation metadata. Unknown versions do not resolve. |
| `src/lib/promotionReceipt.ts` | Subject/address-binding validation, generation-specific receipt facts/idempotency key, factual text/HTML renderer, bounded retry/terminal/incident ledger. No provider or transport dependency. |
| `src/lib/consistencyCoordinatorState.ts` | Freezes capture on pending request; confirmation validates historical evidence and creates receipt in the same returned document as the event/generation/suppression update. Read validation rejects partial pairs. Receipt outcomes update no consent or welcome fact. |
| `src/lib/consistencyCoordinator.ts` | Typed capture and receipt-outcome RPCs; matching local authority implementation. |
| `src/durable-objects/ConsistencyCoordinatorDO.ts` | Persists paired completion with the existing single SQL upsert; persists idempotent receipt outcomes. No new alarm or delivery driver. |
| `src/lib/promotionCoordinator.ts` | New captured requests bypass legacy facts gathering entirely. Older callers retain existing behavior. |
| `scripts/unit/emailR03StageA.test.mjs` | Twelve executable Stage A cases against production modules and the real DO shell with synthetic storage/provider outcomes. Optional artifact retention via `EMAIL_R03_EVIDENCE_DIR`. |

Additional changed files: this report, `receipt.txt`, `receipt.html`, `receipt-failure-ledger.json`, `stage-a-tests.tap`, and root `QUEUE.md`.

## AT-5 proof and limits

The harness imports the production receipt renderer and the actual `ConsistencyCoordinatorDO`. A synthetic SQL adapter records complete serialized documents and can fail the upsert. A failed completion write leaves the original pending document unchanged; retry produces exactly one write containing the generation advance, consent event, and receipt job. Replaying the same token performs zero additional writes and creates no second receipt.

The renderer's subject, text, HTML and controls are inspected. All six §3.1 fields are asserted: address, ISO server confirmation time, scope plus exact historical disclosure/version, sender identity, record control, and withdrawal via both URL and contact email. The output has no coupon, offer, recommendation, purchase prompt, checkout link or cross-sell. Only synthetic record/unsubscribe URLs and the factual withdrawal address are supplied. Retained renderings: [text](receipt.txt), [HTML](receipt.html).

The provider-fault test injects three definitive rejection outcomes into the real durable receipt-outcome method, separated by the five-minute retry backoff. It does not call a provider. Every failure persists an incident, consent remains unchanged, and the third rejection creates one terminal `failed` record. Duplicate attempt outcomes and subsequent acceptance cannot overwrite it. [Retained failure ledger](receipt-failure-ledger.json). Ambiguity terminates `blocked` rather than risking duplicate delivery. A fresh reconsent gets a distinct generation receipt and preserves once-ever welcome history.

Stage A AT-5 content/paired-write/failure-ledger checks: **PASS**. This is an offline harness demonstration with synthetic controls and outcomes, not proof of a delivered receipt or a working subscriber lookup. Receipt credentials, their issuance and live lookup remain U4. All receipt jobs carry `deliveryHold: stage_a_no_send` and are excluded from existing promotional drivers and alarms. No send adapter is added.

## Red-team amendments applied

| Finding | Stage A application | Executable evidence |
| --- | --- | --- |
| 1 — atomic contemporaneous capture | Request is not completed consent; valid confirmation is the completion act. Durable evidence and receipt commit together before subscription state advances. Server `createdAt`/`serverAt` and generation supply ordering. | Pending-not-consent; failed SQL commit; replay and expired-token tests. |
| 2 — completeness contract | New event binds an opaque event reference, coordinator subject hash, sender, channel, scope, locale, variant, presentation version and affirmative confirmation to the request's frozen artifact. Email is checked against the existing coordinator hash format. No retrospective data completion. | Capture mismatch tests, event schema assertions, missing paired receipt rejection. Future campaign applicability checks remain U6. |
| 3 — actual immutable disclosure binding | UI renders and stamps one shared artifact; server validates version/hash/action; pending request preserves its binding across later confirmation caller overrides. Exact historical text is retrieved by version. | Historical override, altered/unknown version/hash, wrong address, UTF-8 digest and immutable-artifact checks. |
| 4 — material presentation | Artifact names consent-control wording, unchecked default and presentation version; visible text and required unchecked checkbox are rendered on the same form. The hash covers exact text, not unstable HTML. | Production form source checks. Browser visibility/understanding is not asserted by the hash. |
| 15 — factual transactional content | Receipt uses a dedicated renderer with no shared promotional footer; classification is transactional provider quota, no promotional budget; job remains on hold. | Six-field/content/link tests against production renderer. Recovery-capacity controls remain U5/U6. |
| 17 — adversarial traceability, Stage A subset | Named invariant-to-test mapping, storage failure, stale/replayed token, tampered evidence, retry backoff, duplicate outcomes and visible terminal incident. | Twelve Stage A tests, retained render and ledger artifacts. This does not claim U7 sign-off. |

Supporting scope protections: the new flow performs zero legacy KV reads and zero network calls in its isolation test; existing erasure removes all newly introduced receipt address/content and late outcomes do not recreate it. No credential, recovery, footer/welcome-reference, retention-clock or dispatch-evidence/access feature was built. Findings 5–14 and 16 affecting those later units are deferred, rather than treated as satisfied.

## Spec boundaries, differences and unresolved gap

1. §3.2 describes a live receipt credential issued at completion, while the authorized staging places credential lifecycle in blocked U4. Stage A intentionally parks delivery and accepts synthetic controls only in the harness; it issues no credential and invents no lookup route. A production receipt cannot yet be delivered with all working controls. This staging limitation remains open until Q-D2/U4 and separate activation authorization.
2. Pre-RD-K, unstamped ceremony behavior is preserved. A newly completed unstamped ceremony gets a terminal blocked receipt artifact (`pre_rd_k_missing_capture_no_reconstruction`) and cannot render an R-03 receipt. No historical receipt is created, no disclosure is guessed, and no prior stored record is migrated/backfilled. The Stage A form always requires complete frozen capture.
3. Receipt retry policy is explicitly bounded to three definitive failures with the existing five-minute backoff duration; ambiguous acceptance blocks immediately for operator resolution. Unlike the promotional jobs, it is a separate transactional ledger and is never driven/rearmed by subscribe or unsubscribe. This avoids changing promotional allocator/frequency machinery or adding sends; a later authorized delivery adapter must preserve the key, content, quota accounting and terminal discipline.
4. **Pre-existing GC-2 gap:** source inspection of `deliverPromotionSend` and `promotionDispatchGuard.ts` found permission/suppression and compliance checks, but no H-unset predicate. No unconditional cap refusal was present on main. Therefore this branch cannot certify the requested fail-closed-on-H invariant. The ratified spec §1.2 also says “no change to ... the dispatch fence”; the fence was left unchanged and direction was requested about adding a hard refusal. No send or activation is authorized. This is an open blocker, not a passed test or a newly introduced bypass.

No U4–U7 implementation, welcome dispatch, test email, production send, legacy 68-record access, backfill, migration or reliance occurred.

## RB-1 and gate posture

| Demonstration | Result |
| --- | --- |
| AT-1 | NOT RUN — U4/U5 unavailable. |
| AT-2 | NOT RUN — U4/U5 unavailable. |
| AT-3 Parts 1–4 | NOT RUN — U4–U6 unavailable. |
| AT-4 | NOT RUN — U4 unavailable. |
| AT-5 | PASS for the Stage A offline checks above; live credential/delivery integration deferred. |
| AT-6 | NOT RUN — U6 unavailable. |

RB-1 is **NOT PASSED**. Reliance remains barred; no partial reliance is claimed. Independent review, programme gates and merge are not completed. Stage B awaits Q-D2. Q-D3, retention acceptance and H remain undecided. No draft PR was opened because Jack explicitly instructed branch push only.

## Validation

Environment: Windows, Node **v22.23.4**, `TZ=UTC`, test runner `--test-concurrency=1` (sequential files).

| Run | Tests | Suites | Pass | Fail | Cancelled / skipped / todo |
| --- | ---: | ---: | ---: | ---: | --- |
| Main baseline (`905ac521`) | 2778 | 3 | 2762 | 16 | 0 / 0 / 0 |
| Initial development full run | 2790 | 3 | 2773 | 17 | 0 / 0 / 0 |
| Final (`155ce082`) | 2790 | 3 | 2774 | 16 | 0 / 0 / 0 |

All twelve new Stage A tests pass in the final run. The final failure-name set is identical to baseline: **zero new failures**. Retained [Stage A TAP](stage-a-tests.tap). The initial development run's extra failure was the new no-legacy-I/O test: receipt validation incorrectly compared a hex address hash to the coordinator's existing truncated base64url identity hash. It was corrected and the test now calls the real coordinator hash helper. The failed run is recorded here, not silently discarded. A prior focused run had the same defect (11/12); the preceding initial ten-case focused run passed 10/10.

Commands (from `star-map-app-final`, Node 22 path prepended, UTC):

```powershell
$env:PATH='C:\agent\tools\node22\node-v22.23.4-win-x64;'+$env:PATH
$env:TZ='UTC'
node --test --test-concurrency=1 scripts/unit/*.test.mjs
node --test --test-concurrency=1 scripts/unit/emailR03StageA.test.mjs
node --test --test-concurrency=1 scripts/unit/promotionConsentGenerations.test.mjs scripts/unit/consistencyCoordinator.test.mjs
npm run lint
npm run typecheck
npm run build
git diff --check
```

The final full run set `EMAIL_R03_EVIDENCE_DIR` to this evidence folder. Existing focused coordinator/consent tests: **84/84 PASS**. Stage A focused tests after correction: **12/12 PASS**. Lint: **PASS, 0 errors, 14 existing warnings**. Typecheck: **PASS**. Production build: **PASS** (before final formatting/comments; unchanged runtime implementation). `git diff --check`: **PASS**. Browser/Playwright suites: **NOT RUN**; no browser visibility or operational retrievability claim is made. GitHub Actions / independent review: **NOT RUN**, no PR authorized.

Baseline failures retained by name:

- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- city prune: next.config keeps the host redirects alongside the city map
- deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- retired posts permanently redirect one hop to the survivor
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers
- fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
- frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
- passes when every named critical smoke command discovers tests
- fails with the exact command and spec when Playwright discovers zero tests
- aggregate rating helpers are referenced nowhere outside the lib module
- no public copy states a review count or a numeric rating for StarMapCo
- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- saved-map API sanitizer validates and retains fontWeight
- fence: PreviewCanvas keeps watermark: !paid â€” on the text-layer pass, above the text
- composition: the renderer consumes the SAME clip path for the sky and the watermark

Full logs are retained outside the repository under `C:/agent/codex-jobs/` (not copied into the evidence pack because unrelated tests print large source and synthetic service diagnostics). SHA-256:

| Log | SHA-256 |
| --- | --- |
| `email-stage-a-before.log` | `a7357f84ca26b23741b43466c15546e2f12da98af40a8337d652edbb44d269aa` |
| `email-stage-a-after.log` | `af08b3a63dcca960b4ab31d281a6bdb603a2d8dc5c11c0c7c1e6ff4758b93b2b` |
| `email-stage-a-final.log` | `ddc0feac00beb5709a0a4120940f63248843fe77df3265e74f7b5a51647f5d9c` |

