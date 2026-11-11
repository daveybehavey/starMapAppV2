# H-ENFORCE report

Date: 2026-11-11. Operator: Jack. Branch: feat/h-enforce-guard.
Base: origin/main at 905ac521. Worktree: C:/Users/ReuseTechBC/projects/sm-henforce.

## Implementation

H lives in exactly one runtime declaration: star-map-app-final/src/lib/promotionSendCap.ts, PROMOTION_SEND_CAP_H: number | null = null. Its comment cites GC-2 and reserves setting H to chair/David.

Distinct refusal: send_cap_unset. evaluatePromotionSendCap in promotionDispatchGuard.ts runs before the pure authority decision and before production authority reads. deliverPromotionSend also checks it before an injected permission checker, so coordinator-owned checkers cannot bypass H. No provider leg or fallback is attempted. Positive H falls through to the unchanged permission, suppression, authority and compliance checks. No cap arithmetic or activation mechanism was added.

The shared default checker also fences recovery promotional mail; its existing regression tests use the same positive-H fixture. No recovery runtime file was edited. No Stage A files, environment files, deployment configuration, or other fence predicates changed. No sends, push, PR, merge or deployment were performed.

## Source verification

- docs/gdot-work-packet-2026-11-02.md, Part 1 item 4, records that H is unset and commercial sends fail closed by design.
- docs/CASL-RD-A-EVIDENCE-BASELINE.md, AM-15 and GC-2, says unset H refuses commercial admission while transactional admission proceeds.
- Main's promotionDispatchGuard.ts had permission/suppression/authority checks but no H predicate; promotions.ts had the dispatch and compliance gates but no H predicate.
- Record limitation: the tracked November 2 document is a work packet requesting a chair ruling, not a signed returned ruling. The policy is corroborated by the baseline register; this explicit bridge-build instruction authorizes its enforcement.

## Validation

Node v22.23.4, TZ=UTC, sequential test execution (--test-concurrency=1). Node binary directory prepended to process PATH:
C:/Users/ReuseTechBC/AppData/Local/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/bin.
No persistent environment/configuration changes.

| Run | Tests | Passed | Failed |
| --- | ---: | ---: | ---: |
| Confirmed main baseline | 2778 | 2762 | 16 |
| Final | 2791 | 2775 | 16 |
| Focused promotion/coordinator/compliance run | 195 | 195 | 0 |

Final failure-name set equals confirmed main exactly: zero new failures, zero removed failures. All 13 new null-H tests pass. They cover coordinator subscription/import/unsubscription/no-permission/deliverability suppression, legacy state/list/unsubscription, unknown/invalid recipients, unreadable authority, both send kinds, injected permit/refusal/throwing checkers, and legacy wrappers. Tests assert no authority reads and no provider calls while unset. Existing assertions remain intact in seven regression files, using an isolated test-only loader that supplies H=1; there is no production override.

Commands run from star-map-app-final unless noted:

- Repo setup: git fetch origin; git worktree add ..\sm-henforce -b feat/h-enforce-guard origin/main — passed.
- npm ci --ignore-scripts — passed (installer used host Node 26.13.0 and emitted an engine warning; all test/check runs use Node 22).
- node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs — confirmed main exit 1, final exit 1, solely the identical 16 baseline failures below.
- node --test --test-concurrency=1 --test-reporter=tap scripts/unit/promotion*.test.mjs scripts/unit/caslSendAlignment.test.mjs scripts/unit/consistencyCoordinator.test.mjs — exit 0, 195/195.
- npm run lint — passed, 0 errors / 14 warnings.
- npm run typecheck — passed, exit 0, no diagnostics.
- git diff --check — passed.

Confirmed baseline/final failure names:

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
- fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
- composition: the renderer consumes the SAME clip path for the sky and the watermark

## Divergences and evidence

The first baseline overlapped dependency installation and had 2738 tests / 2720 passed / 18 failed. It is superseded by the fully installed, unchanged-main baseline above. The first patched full run exposed four shared recovery-checker tests needing the positive-H fixture; these were corrected without changing their assertions or recovery runtime code. The final suite was rerun after that correction.

ASTRA_BRIEF.md and ASTRA_PROGRAMME.md are absent from origin/main in this worktree. This explicit operator run supplies the branch and local-commit/bundle workflow instead of the usual issue-linked draft PR workflow. Build/Playwright/Actions were not run; the requested unit suite, lint and typecheck are the validation scope.

Local raw evidence is retained under star-map-app-final/.tmp/henforce/ (gitignored). Failure names and counts are preserved here for bundle reviewers.

## Handoff

Bundle target: C:/Users/ReuseTechBC/projects/henforce.bundle.
Creation command (worktree root): git bundle create ..\henforce.bundle feat/h-enforce-guard ^origin/main.
Bundle existence and verification will be confirmed in the reply after local commit.

Commit identity divergence: Git had no configured author. The local commit uses command-local -c user.name=Codex -c user.email=codex@localhost; no Git configuration was changed.
