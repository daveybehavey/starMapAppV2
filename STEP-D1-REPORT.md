# STEP-D1 review-dispatch fence

Lane 2, David's PC bridge, 2026-11-13. Implemented against freshly fetched
`origin/main` at `c3655faa9a930a20256f0af33eef1ab8ad1d3918` (#649).
Worktree: `C:\Users\ReuseTechBC\projects\sm-stepd1`.
Branch: `feat/step-d1-review-fence`.
Authority/scope: the operator's inlined STEP-D1 bridge brief and chair Finding 2,
option (a). Delivery is the requested local incremental bundle; no remote PR,
merge, deployment, configuration change, live provider call, or spend performed.

## Dispatch path and insertion points

1. `star-map-app-final/cloudflare-worker.ts` scheduled handler calls
   `runScheduledReviewRequestTick(env)` in `src/lib/reviewRequestRuntime.ts`.
2. Runtime constructs dependencies and calls `runReviewRequestTick` in
   `src/lib/reviewRequests.ts`. The tick claims the ledger row with a frozen
   payload, then calls `deps.suppression.dispatch`.
3. `createReviewSuppressionClient` routes to the recipient's
   `ReviewRequestSuppressionDO.dispatch`. That DO constructs the ledger,
   fresh eligibility checker, and `createSendCapClient(this.env)`, then calls
   `executeReviewDispatch`. The only DO change passes `env: this.env` into
   this coordinator, so an absent explicit flag cannot inherit process env.
4. In `src/lib/reviewRequestSuppression.ts`, the existing awaited
   `counter.check("review")` still checks configured capacity and fails closed
   on a missing `SEND_CAP_SERVICE`. **New pre-check:** immediately after that
   check, `dispatchPrerequisite("promotion", deps.env)` applies the existing
   promotion flag parser (`trim() === "true"`). Refusal returns before suppression,
   reservation, or the irreversible ledger transition.
5. Existing initial suppression check -> `counter.reserve("review")` -> awaited
   ledger `begin_dispatch` -> awaited fresh eligibility check. Reservation family
   remains **review**, regardless of reuse of the promotion activation helper.
6. **New cap re-read:** after eligibility, `counter.check("review")` checks cap
   configuration again. This external await is BEFORE the existing final
   suppression check, preserving suppression as the last awaited gate.
7. Existing final awaited suppression check -> fresh synchronous deadline check
   -> **new synchronous activation recheck** -> `attemptedAt` assignment ->
   `sendWithTimeout(deps.send, frozenPayload, ...)`. There is no await between
   the successful activation decision and provider invocation. Production's
   `sendViaResend` -> `sendResendEmail` reaches `fetch` without intervening I/O.
8. A post-reservation refusal returns `{ outcome: "refused", reason }`, with
   the same `promotion_dispatch_disabled` reason as promotions (or the cap
   refusal). The existing permanent `rejected` ledger resolution records that
   exact diagnostic in `lastError` and terminalizes the row as `failed`; it does
   not schedule a blind retry. The existing `finally` sees `attemptedAt === null`
   and releases the unused reservation. The provider is not called. If a ledger
   resolution fails, the existing conservative dispatch lifecycle still applies.
9. Open path: unchanged frozen payload/provider adapter, one provider invocation,
   normal ledger resolution, and one committed review slot. Ambiguous attempts
   remain charged. Failed release remains conservatively charged, as before;
   this change does not invent retries or automatic refunds for failed RPCs.

No cap arithmetic, shared-cap client/Worker implementation, promotion production
code, confirmation rendering, eligibility predicates, or suppression predicates
changed. Existing review tests explicitly enable the fence; the existing shared
cap review fixture now supplies its explicit environment. No route surface changed.

## Tests and negative controls

`scripts/unit/reviewDispatchFence.test.mjs` imports the REAL coordinator, ledger
state machine, cap client, and reservation/settlement functions. Only storage,
eligibility, and provider I/O are fake. Every fixture starts with an existing
committed promotion slot, so returning usage to its prior value cannot be faked
by clearing all usage.

- **A, initially off:** zero provider calls, unchanged usage, no `/reserve`
  trace at all, and ledger remains `claimed`.
- **B, closes after reserve:** an explicit promise barrier pauses the real
  dispatch behind its awaited eligibility check. The test observes `dispatching`
  and one pending extra slot, closes the flag, then resumes. It asserts zero
  provider calls, exactly one release, no commit, original usage restored, and
  `lastError === "promotion_dispatch_disabled"` on the terminal row.
- **Open:** exactly one fake provider call with the identical frozen payload,
  one reserve, one commit, no release, prior slot preserved, one additional
  committed review slot, and ledger `sent`.
- Additional tests cover flag closure during final suppression, an absent
  explicit flag despite enabled process env, missing cap binding, and cap
  configuration disappearing after reservation.

Negative controls were actually executed against temporary production-source
mutations, restored byte-for-byte in `finally`:

1. Replace `if (!activationRecheck.permitted) {` with `if (false) {`; run
   `node --test --test-name-pattern='review fence B:' scripts/unit/reviewDispatchFence.test.mjs`.
   Exit **1**: expected refused/promotion_dispatch_disabled, got
   sent/fake-provider. This demonstrates B detects removal of the final fence.
2. Remove the `if (!activation.permitted) return ...` pre-check; run
   `node --test --test-name-pattern='review fence A:' scripts/unit/reviewDispatchFence.test.mjs`.
   Exit **1**: reservation-trace assertion expected false, got true. A catches
   the reservation even though the remaining final check releases it later.
3. Restored source: the focused review/cap set passed **133/133**.

## Validation

Node used for tests and checks: **v22.23.5**. PowerShell invocation prefix:

```powershell
$env:PATH='C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin;'+$env:PATH
$env:TZ='UTC'
# Invoke npm through Node explicitly; npm.ps1 otherwise chooses its adjacent Node 26.
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:unit
```

All commands run from `star-map-app-final` except Git commands at the worktree
root. Initial setup accidentally used the system npm launcher/Node 26 for
`npm ci --no-audit --no-fund`; installation completed, then dependencies were
rebuilt successfully with Node 22 via `node <npm-cli.js> rebuild`. All test and
validation runs used Node 22. An early `npm run typecheck` invocation failed
because installation had not linked `tsc` yet; an early direct `node
node_modules/typescript/bin/tsc --noEmit` also saw incomplete dependency types.
Those preliminary attempts are not claimed as validation passes.

| Check | Exact command (npm invoked through Node 22 as above) | Result |
| --- | --- | --- |
| New fence cases | `node --test scripts/unit/reviewDispatchFence.test.mjs` | 7 passed, 0 failed |
| Focused review/cap regression set | `node --test scripts/unit/reviewDispatchFence.test.mjs scripts/unit/reviewRequests.test.mjs scripts/unit/sharedSendCap.test.mjs scripts/unit/sharedSendCapNull.test.mjs` | 133 passed, 0 failed |
| Typecheck after completed install | `node <npm-cli.js> run typecheck` | Exit 0 |
| Lint | `node <npm-cli.js> run lint` | Exit 0; 0 errors, 17 warnings, all outside changed files |
| Full UTC suite after completed install | `node <npm-cli.js> run test:unit` with `TZ=UTC` | Exit 1; 3,140 tests, 3,123 passed, 17 failed |
| Whitespace | `git diff --check` | Exit 0 |
| Build / Playwright | Not run | No route surface change; CI/full gate remains canonical |

The early full run overlapped dependency extraction and reported 2,966 tests,
2,942 passed, 24 failed. Seven module-loading failures disappeared after install:
`accountLogout.test.mjs`, `dl1Slice4Route.test.mjs`, `editorRenderEconomics.test.mjs`,
`emailR03FixRoute.test.mjs`, `metaCheckout.test.mjs`, `metaPromoDisclosure.test.mjs`,
`moneyPathS94Followup.test.mjs`. The completed-install result above supersedes it.
The initial new-test run during extraction also failed to load the incomplete
Cloudflare package; its subsequent run passed 7/7.

Final failing name-set (17), reported without treating the suite as green:

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

Baseline comparison: **exact match of all 17 failing names**, no added or removed
failures. The base at c3655faa ran in the SAME worktree path/dependency layout
under Node 22 and TZ=UTC: **3,133 tests, 3,116 passed, 17 failed**, exit 1.
Temporarily restored the five implementation/test paths with
`git restore --source=c3655faa9a930a20256f0af33eef1ab8ad1d3918 --worktree -- <paths>`,
ran `node <npm-cli.js> run test:unit`, then restored HEAD in `finally`.
`git diff --exit-code` confirmed restoration; sorted TAP failure-name comparison
confirmed equality. The patch adds seven passing tests.

An earlier comparison using a separate detached worktree with a node_modules
junction was discarded as non-comparable: 3,133 tests, 2,944 passed, 189 failed;
module hooks resolved through the other physical root (including `NextRequest
is not a constructor`). The same-path control above replaces that experiment.
The temporary comparison worktree and its dependency junction were removed.

The final 17 failures are pre-existing on this exact base. Output includes
Windows file-URL/path handling, CRLF-sensitive source assertions, POSIX-mode
expectations, and npm.cmd spawning; this is not a claim that Linux CI has passed.

## Deployment/runbook handoff (no deployment in this build)

Keep **scheduler quiescence and draining in-flight work before reconciliation**
in the Step D deployment runbook. Closing this flag prevents new provider
invocations that observe it; it cannot retract requests already submitted or
drain an older deployment's running invocations. Human operators must stop new
scheduling, drain/confirm completion of already-running work, then reconcile
shared usage before any separately approved activation. This report carries the
runbook requirement without expanding the permitted code/test diff into
production configuration or deployment work. No cap binding was added.

CI is canonical. Full gate and chair confirmation review remain required before
the separately human-approved Step D deployment.

## Delivery and token draw

Incremental bundle target: `C:\Users\ReuseTechBC\projects\qstepd1.bundle`, range
`c3655faa9a930a20256f0af33eef1ab8ad1d3918..HEAD`, including implementation, tests,
and this report. Bundle verification: `git bundle verify C:\Users\ReuseTechBC\projects\qstepd1.bundle` passed. The bundle is regenerated and verified again after committing this report. Required prerequisite is the recorded base commit; all new commits are included.

Token draw: the agent runtime does not expose a measured per-task token counter;
no numeric usage is claimed. No subagents were used. Bridge/session metering is
needed for the exact draw.
