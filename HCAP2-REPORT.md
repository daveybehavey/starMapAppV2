# HCAP2-REPORT — Q16C fence-first local build

## Status and authority

Implemented locally for Jack's Tier C gate. **H remains null. No activation.** The new `PROMOTION_DISPATCH_ENABLED` code switch defaults off; no runtime env/config value was set. `REVIEW_REQUESTS_ENABLED` and all wrangler files are unchanged. No sends, live probing, production access, push, PR, merge, deployment, or OurImprint work occurred. Provider calls in tests are synthetic fakes.

The operator's Q16C direction supersedes the ordinary issue/PR workflow for this local bundle. Read the supplied full q16b report first. Fetched `origin/main`, then created `C:/Users/ReuseTechBC/projects/sm-hcap2`, branch `feat/promotion-send-cap-fence`, from **a7e09630d5dd1de482aeee9b374e9924198cfe85** (current fetched main). `ASTRA_BRIEF.md` and `ASTRA_PROGRAMME.md` are absent at this base; the supplied fences remain binding.

## Dispatch gates and scope

`sharedSendCap.ts:dispatchPrerequisite` checks the production `PROMOTION_SEND_CAP_H` first. Null still returns the exact reason **`send_cap_unset`**, before reading activation settings, binding, recipient authority, or counter state. There is no runtime H override. Only test-loader fixtures substitute finite or explicit null H.

For promotion, finite H is followed immediately by the new activation check: only the string `true` (trimmed) permits; unset, false, other strings, or nonstrings return **`promotion_dispatch_disabled`**. Explicit DO env is authoritative; it does not fall back to process settings. This prerequisite gates the permission checker, transport, inline coordinator driver, and ConsistencyCoordinatorDO alarm. Both Resend and SendGrid legs use the shared counter only after permission, compliance, request serialization, and their provider configuration checks pass. Unconfigured legs consume no reservation. Exhaustion is **`send_cap_exhausted`**; unavailable/malformed counter access is **`send_cap_unavailable`**. No fallback provider runs on a counter refusal.

The review suppression DO and `executeReviewDispatch` now refuse on null H, including before construction/access of dispatch dependencies. The existing review enable switch and tick configuration gates are unchanged. The tick handles a cap refusal by its existing token/state-guarded claim-release path; an exhausted counter does not first irreversibly begin a review dispatch. This refusal currently contributes to the existing `suppressionUnavailable` summary bucket (no new telemetry/config project introduced).

## Shared durable substrate and window

The existing `CONSISTENCY_COORDINATOR` namespace supplies exactly one object named **`commercial-send-cap:v1:global`** for both promotion (coupon/followup) and review families. No new binding or schema migration is needed: a validated `send_cap` document uses the existing SQLite JSON-state table. It contains random reservation IDs, family, reservation time and nullable invocation time; no recipient, payload, or provider identifiers are stored.

Reservation is a synchronous read / pure transition / upsert in that object, with no intervening await. RPC success is returned after the write; Cloudflare's storage output gate supplies the runtime durability boundary. An independently implemented, binding-only client never calls the existing coordinator client's memory fallback, even with CI/local flags set. Missing binding, failed RPC, malformed response, corrupt/kind-mismatched state, read errors, and failed reservation persistence all refuse before sending. Explicit env is passed by both DO dispatch paths.

Settled attempts occupy **(now − 86,400,000 ms, now]**. Exactly 24h-old attempts no longer count. With the finite **25** test fixture, the 25th attempt proceeds and the 26th refuses. One global list serves both families; retries count as attempts even when provider idempotency may deduplicate delivery. A backwards clock fails closed. Invocation timestamps are checked against reservation/server time; clock skew causing an invalid settlement retains the pending reservation rather than freeing capacity.

## Reserve-before-final-fence protocol and leakage

Review order is: null-H refusal → initial suppression → reserve shared slot → ledger begin_dispatch → fresh eligibility → final suppression → fresh deadline sample → provider adapter invocation → ledger resolution → reservation settlement.

The reservation deliberately precedes begin_dispatch: an exhausted/unavailable budget can refuse without terminalizing an otherwise valid claimed job. It is provisional, not an assertion that a provider attempt happened. A `try/finally` releases it on **every known no-invocation exit**: ledger refusal/failure, missing payload, ineligible/unavailable eligibility, final suppression or unavailable suppression, and expiry. Successful release removes the slot entirely; suppressed/expired non-attempts have no committed attempt timestamp and consume no capacity after release.

On the send branch, the invocation timestamp is recorded immediately before `sendWithTimeout` invokes the adapter. **No new external await occurs between the final suppression/deadline fence and that invocation.** Counter settlement is afterward. Provider rejection, synchronous throw, timeout, acceptance without ID, and ambiguous fetch all retain the charge; there is no refund based on a provider outcome. A synchronous throw is now classified as ambiguous, matching rejected promises/timeouts.

There is intentionally no exactly-once claim across storage and an external provider. A pending reservation consumes capacity and **never automatically expires**. A crash after reservation, a lost reserve response, failed release, failed settlement, or a stalled provider/ledger operation can leave capacity occupied, including for a send that never happened. That conservative capacity leakage is real: 25 orphaned reservations can block all dispatch indefinitely after later activation. Failed release/settlement is not retried as a send and does not free capacity. No automatic reclamation or administrative reset was introduced; any recovery needs separately reviewed evidence/authority. Settled attempts age out normally. This policy favors under-sending over refunding a possibly attempted send.

## Review-test expectation change and other surprises

**Yes: current review behavior/test expectations change under production null H.** Previously direct review dispatch could return sent, suppressed, expired, etc. without consulting H. It now returns `{ outcome: "refused", reason: "send_cap_unset" }` before those decisions. Existing review behavior tests now explicitly load a finite-H/successful-fake-counter fixture so their original ledger/suppression/eligibility/provider assertions remain exercised. Separate tests run the real counter and explicit null fixture; the existing production-null assertion is unchanged.

Existing promotion permission/compliance/coordinator tests similarly explicitly enable the test-only fence and use the successful counter fixture. Those fixtures do not validate arithmetic. The new arithmetic/integration suite instead uses H=25, the real client, real ConsistencyCoordinatorDO over a failure-injectable SQL fake, and mocked providers. Null and finite fixtures are separate test processes; no production code has a local-cap bypass.

The new driver-first gate also stops alarm processing/rescheduling while dark. A future activation decision must account for dormant jobs; this build does not replay them. The inline driver reports the refusal without reading historical delivery state while dark. These are dark-path lifecycle changes, not activation.

Installation was unexpectedly slow (22 minutes) but completed. npm 11.20.0 reported four dependency install scripts not covered by allowScripts; the app's patch-package postinstall ran successfully. Node 22.23.4 was used explicitly throughout, with TZ=UTC and its bin directory first in PATH; the host Node 26 shim was not used.

## Validation

Fresh baseline, before dispatch wiring or test expectation edits: **3,057 tests; 3,040 passed; 17 failed**. No cancellations/skips. The historical q16b/older-main failure list was not used.

Post-change full suite: **3,083 tests; 3,066 passed; 17 failed**. No cancellations/skips. All **26 new tests passed**. Compared sorted failure-name multisets (including nested TAP failures), not just totals: **identical to baseline; zero new failures and zero baseline failures removed**. Before duration: 104,616 ms; after: 186,706 ms.

Typecheck: passed, including a final repeat after the last runtime edit. Full lint: passed (0 errors, 15 warnings in unchanged files); final lint of every changed code/test file passed with no output. After strengthening the RPC test to cover rejection and a lost response after persistence, the final targeted run passed **144/144**, including all 26 new tests; final lint of that test file also passed. Git diff whitespace check: passed. Production build, Playwright, GitHub Actions, and live validation were not run; this is a local bundle, and Actions remains the authoritative downstream validator.

The new tests cover mixed-family concurrency, durable reconstruction, 25th/26th actual dispatch, exact 24h boundary, missing binding/RPC/malformed response/read/write/corrupt-state failures, no memory fallback, null-H bytes/precedence, fence-off ordering across all promotion drivers, provider configuration/permission/compliance before reservation, both provider legs, suppression during reservation, expiry, eligibility and ledger failures, no counter await after the final review check, ambiguous/synchronous/timeout attempts, failed settlement, orphan retention, clock regression, and refusal to refund committed attempts.

Commands (PowerShell; app directory unless specified; variables below expand to the exact binaries used):

```powershell
$node22 = 'C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = (Split-Path $node22) + ';' + $env:PATH
$env:TZ = 'UTC'
& $node22 --version                       # v22.23.4
& $node22 $npmCli --version               # 11.20.0
& $node22 $npmCli ci --no-audit --no-fund  # exit 0
& $node22 $npmCli run test:unit            # before: exit 1 (17 baseline failures)
& $node22 --test scripts/unit/sharedSendCap.test.mjs scripts/unit/sharedSendCapNull.test.mjs
# initial new tests: 15/15; expanded coverage is also in the full after suite
& $node22 --test scripts/unit/sharedSendCap.test.mjs scripts/unit/sharedSendCapNull.test.mjs scripts/unit/promotionSendCapUnset.test.mjs scripts/unit/promotionDispatchGuard.test.mjs scripts/unit/reviewRequests.test.mjs
# interim: 39 pass, 2 test-module loader failures; fixed fixture format to module-typescript
& $node22 --test scripts/unit/promotionDispatchGuard.test.mjs scripts/unit/reviewRequests.test.mjs
# rerun after loader fix: 105/105 passed
# The five-file targeted command above was then repeated at final HEAD: 144/144 passed.
& $node22 $npmCli run typecheck            # exit 0
& $node22 $npmCli run lint                 # exit 0, 15 warnings
& $node22 $npmCli run test:unit            # after: see comparison above
# Final changed-file lint: & $node22 node_modules/eslint/bin/eslint.js @changedFiles
# changedFiles = git diff --name-only + git ls-files --others --exclude-standard,
# filtered to .ts/.mjs, app prefix removed, sorted unique; exit 0.
& $node22 node_modules/eslint/bin/eslint.js scripts/unit/sharedSendCap.test.mjs # exit 0
# New files formatted with Node 22 invoking node_modules/prettier/bin/prettier.cjs --write.
git diff --check                         # exit 0
```

Setup (from original checkout): `git fetch origin`; `git worktree add C:\Users\ReuseTechBC\projects\sm-hcap2 -b feat/promotion-send-cap-fence origin/main`. SHA-256: baseline.log `C4FE213534C05ABF1CC11E0C7F4A2CEBB6CFF523D547CCE803B637035980D197`; after.log `C6673CE5267F3844CE7566FCA0BEAF997348005470C4545D26D502782A78EEBF`. Local evidence logs remain gitignored under `star-map-app-final/.tmp/hcap2/`; no raw test logs or secrets are committed.

Fresh baseline failure names:

- business profile never publishes phone; href stays empty
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

## Local handoff

Implementation commit: `87d223a70c6f0dbe4faa3e35a151a73f84468ae7`. This report is a separate follow-up commit. Commits use command-local `user.name=Codex` and `user.email=codex@localhost`; repository/user configuration was not changed. Commits stay on `feat/promotion-send-cap-fence`. Bundle target: `C:/Users/ReuseTechBC/projects/q16cfence.bundle`. Creation: `git bundle create C:\Users\ReuseTechBC\projects\q16cfence.bundle feat/promotion-send-cap-fence`; verification: `git bundle verify C:\Users\ReuseTechBC\projects\q16cfence.bundle`. The named branch history is included. This is a Tier C review artifact, not permission to set H, enable either engine, merge, or deploy.
