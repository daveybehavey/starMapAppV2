# Claim-first native dispatch — run-q15b-claimfirst

Start head: d578a801 (origin/main, PR #641). Branch: fix/claim-first-native-dispatch.
This operator-authorized bridge job is delivered offline for the full Tier C gate. No push, PR readiness change, merge, deployment, live probing, or provider calls.

## Protocol design

The existing authority claim operation serializes contenders per order and refuses a standing claim even when its dispatch ID matches. It also refuses terminal, bound, and operator-recovered lifecycles. No authority or webhook changes are required.

Native V1 and V2 retries retain the #641 standing claim/marker read, then compete for the same authority claim as alternate dispatch. A successful claimant re-reads authority and KV before writing an attempted marker. Missing/unread state, lifecycle or relevant record advancement, or a blocking marker causes best-effort dispatch-ID-checked release and stand-down before any provider call. A thrown read fails closed and leaves the claim standing. The attempted marker is merged onto the fresh record and durably retained before submission. A failed marker write submits nothing and conservatively retains the claim.

After submission begins, the claim is never released automatically, matching the alternate protocol. Errors, timeouts, throws, missing provider identity, and persistence failures leave a claim and/or attempted marker for reconciliation. A successful native response still binds the provider identity through the existing post-submit helper; its sent record carries an accepted marker. There is no unlock between acceptance and binding. Non-success provider responses are conservatively ambiguous; no rejection contract is invented.

The coordination guarantee concerns the native retry versus claim-taking alternate dispatch paths. Operator/manual resolution and native webhook submission retain their existing protocols and are not expanded by this job.

## Validation

**Green under the brief's failure-name comparison rule: all 16 baseline failure names are identical after the change; none added or removed. This is not an all-tests-pass claim.**

### Resume and scope

Resumed `C:\Users\ReuseTechBC\projects\sm-claimfirst` as authorized. Fetched origin without moving this branch from `d578a801fe806bd6c1e82a179784497a111a3a5f`. The interrupted run had changed only `.gitignore` and drafted this report. Its implementation/test generators existed under `.local-tools/` but had not modified the application. Their sound work was reused and reviewed; test fixtures were corrected to use the actual merch family and durable KV write method. Existing ignore entries were retained. Original install logs are preserved under ignored `claimfirst-evidence/`.

Implementation commit: `b8bc90240fe10cfbd938c147c15beb19795191c8`.

Only the retry route's production code changes. The alternate branch, Stripe webhook, authority client/state machine/DO, payment/revocation gates, provider payloads, and external IDs are unchanged. The explicit bridge brief authorizes this bounded fulfilment work and offline bundle delivery; no remote PR was created.

### Acceptance evidence

The new `scripts/unit/printRetryClaimFirst.test.mjs` drives the real retry route, local KV, and real serialized in-memory authority/state machine. Existing harness fakes replace Stripe, provider submissions, alerts, confirmation, asset TTL, and post-submit review. The post-submit fake binds through the real authority and persists through the real order writer. No production services are required.

Each of these eight cases runs for both V1 posters and V2 merch, giving 16 new tests:

1. Alternate claim wins after the native standing-state snapshot is read: native returns 409 with zero provider calls.
2. Native holds its claim during submission: direct alternate acquisition loses, alternate retry refuses with zero alternate provider calls, and the native winner submits exactly once with the original external ID, binds identity, and persists acceptance.
3. Timeout blocks subsequent native and alternate retries.
4. Thrown/lost response blocks subsequent native and alternate retries.
5. Non-2xx response blocks subsequent native and alternate retries.
6. An alternate retry loses against the native claim even before the attempted marker has been persisted.
7. Attempted-marker persistence failure causes zero provider calls and leaves the claim blocking both routes.
8. Advancement after native claim acquisition releases the unused claim and submits nothing.

These prove criterion 1 at both acquisition orderings, including the old final-read-to-submission window, and criterion 2 for ambiguous responses across both destinations. All four original #641 behavioral acceptance tests and its source-order check remain unchanged and pass.

Claim loss returns `409 alternate_dispatch_reconciliation_required` with `dispatchId`. Unread authority fails closed; terminal and already-fulfilled claim failures mirror the alternate protocol. On success, the accepted marker and provider identity are persisted through the existing bind-then-review helper, with no claim release. Missing provider identity exits that helper without persisting the accepted candidate, leaving the attempted marker and claim. No response status is newly considered proof that no order was created.

### Commands and results

Commands ran from `star-map-app-final/` on Windows with the worktree's `.local-tools/node-v22.23.5-win-x64` prepended to `PATH` and `$env:TZ='UTC'`. Node **v22.23.5**, npm **10.9.9**.

| Command | Result |
| --- | --- |
| `npm.cmd install --no-audit --no-fund --cache ../.local-tools/npm-cache` | Exit 0; repaired 222 packages and successfully applied the Playwright patch. Package/lockfile unchanged. |
| `node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs` before implementation | Exit 1; **3,014 tests, 2,998 pass, 16 fail**, no skipped/cancelled/todo. Unchanged start-head application; new test file temporarily outside discovery. |
| Same full-suite command after implementation | Exit 1; **3,030 tests, 3,014 pass, 16 fail**, no skipped/cancelled/todo. |
| `node --test --test-concurrency=1 --test-reporter=tap scripts/unit/printRetryClaimFirst.test.mjs scripts/unit/printRetryNativeAlternateStanding.test.mjs` | Exit 0; **21/21 pass**. |
| `npm.cmd run lint` | Exit 0; **0 errors, 14 warnings**, none in changed files. |
| `npm.cmd run typecheck` | Final exit 1; same two diagnostics as initial check, both in unchanged `src/lib/sentryBrowser.ts`: line 54 `defaults`, line 56 `event`, TS7006 implicit `any`. No diagnostic names the changed route/tests. |
| `git diff --check` | Pass. |

The first diagnostic suite attempt was stopped because dependencies were incomplete; it is preserved as `incomplete-install-diagnostic.tap` and **excluded from the baseline**. The old route also failed the new race tests before implementation (the late alternate claim still allowed native success); the final focused run above is the acceptance result.

The full-suite comparison strips TAP numbering and compares exact failure-name sets, including nested failures: **identical true, added [], removed []**. Local evidence is retained in ignored `claimfirst-evidence/`: `baseline.tap`, `final.tap`, `targeted.tap`, `comparison.json`, install logs, and lint/typecheck logs. Raw logs are not bundled; the full failure-name comparison is recorded below.

SHA-256 of baseline TAP: `e100dd3064321d9c64c72a6bfaa2f3058b99720954354d838f9a1f01f7683430`.

SHA-256 of final TAP: `be9bed255c287efb533f6303c45a2c0f78e7efe7cf25083d95d299a21ec333f4`.

### Exact unchanged failure names

1. PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
2. aggregate rating helpers are referenced nowhere outside the lib module
3. city prune: next.config keeps the host redirects alongside the city map
4. city prune: next.config redirects pin the full 21-entry map, one hop, no chains
5. composition: the renderer consumes the SAME clip path for the sky and the watermark
6. deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
7. fails with the exact command and spec when Playwright discovers zero tests
8. fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
9. fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
10. frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
11. no public copy states a review count or a numeric rating for StarMapCo
12. passes when every named critical smoke command discovers tests
13. retired posts permanently redirect one hop to the survivor
14. saved-map API sanitizer validates and retains fontWeight
15. source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
16. wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers

## Handoff

Commits use command-scoped `Codex <codex@local.invalid>` attribution because the checkout has no configured author. No global Git configuration was changed.

Bundle target: `C:\Users\ReuseTechBC\projects\qclaimfirst.bundle`. Delivery command: `git bundle create C:\Users\ReuseTechBC\projects\qclaimfirst.bundle fix/claim-first-native-dispatch`; validation: `git bundle verify` and `git bundle list-heads` against that bundle.

Full Tier C review and authoritative GitHub Actions validation remain pending. This bridge run does not claim a production build, browser smoke run, independent review, or approval to merge/deploy.
