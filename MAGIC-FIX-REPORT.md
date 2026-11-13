# MAGIC-FIX — coordinator RPC invocation

## Handoff

- Owner-authorized bridge brief: `bridge-brief-magic-fix-2026-11-13.md` (inlined task), lane 1.
- Fresh fetch: `git fetch origin main` from the original checkout.
- Base: `c3655faa9a930a20256f0af33eef1ab8ad1d3918`, PR #649.
- Worktree: `C:\Users\ReuseTechBC\projects\sm-magicfix`.
- Branch: `fix/coordinator-rpc-invoke`.
- Delivery: incremental `C:\Users\ReuseTechBC\projects\qmagicfix.bundle`, range `c3655faa9a930a20256f0af33eef1ab8ad1d3918..HEAD`.
- This bridge delivery follows the explicitly requested branch/bundle workflow. No push, PR, merge, deployment, production call, send, configuration change, or purchase was performed. CI and the requested independent Codex confirmation review remain downstream gates; this implementation's self-review is not that independent review.

## Exact diff sites

1. `star-map-app-final/src/lib/consistencyCoordinator.ts`, nested `call()` helper, lines 590–591: replace extracted function plus `fn.call(stub, input)` with a call-site-only narrow cast and direct `[method](input)` invocation on the stub. The method remains attached to its RPC receiver. Namespace precedence, fallback gates, error wrapping, route behavior, and DO implementation are unchanged.
2. `star-map-app-final/scripts/unit/consistencyCoordinatorRpc.test.mjs`: real Miniflare/workerd regression, discovered by the existing `npm run test:unit` glob and therefore the CI static-checks job. Uses esbuild and Miniflare already present in the committed dependency lock; no package or runtime upgrade.
3. `star-map-app-final/scripts/unit/fixtures/consistencyCoordinator.worker.mjs`: bundles the real client and real `ConsistencyCoordinatorDO`, using SQLite storage and a real namespace binding. Adapted from the diagnostic harness without copying diagnostic scripts into the change.
4. This report.

## RPC anti-pattern audit

Repository-wide searches covered namespace construction (`idFromName`, `getByName`, `idFromString`, `DurableObjectNamespace`), extracted stub properties, `.call`, `.apply`, and `.bind`, followed by inspection of the client call sites. `rg` was unavailable, so `git grep`/`git ls-files` were used. The configured DO classes in `wrangler.toml` were cross-checked against these clients.

| Client / source (`star-map-app-final/src/lib/`) | Checked sites / method set | Verdict |
| --- | --- | --- |
| `consistencyCoordinator.ts` | Shared helper at 589–591; all coordinator methods flow through it | One true defect; fixed by direct computed-property invocation |
| `entitlementAuthority.ts` | 204–205 `getState`; 224–225 `apply` | Direct stub calls; `apply` is the actual DO method, not Function.prototype.apply |
| `giftCertificateGrant.ts` | 165–166 `getRow`; 181–182 `initialize`; 202–203 `confirmPublished`; 228–229 `publish` | Direct stub calls; no change |
| `printOrderAuthority.ts` | 101–102 `apply`; 125–126 and 258–259 `getState` | Direct stub calls, including reconciliation path; no change |
| `referralDiscoveryClient.ts` | 103–104 `getAssociation`; 123–124 `register`; 144–145 `recordTerminalNegative` | Direct stub calls; no change |
| `referralRewardAuthority.ts` | Calls the entitlement client (`apply`), not detached RPC functions | No independent faulty stub invocation; no change |
| `reviewRequestLedger.ts` | 142–143 `getState`; 157–158 `apply` | Direct stub calls; no change |
| `reviewRequestSuppression.ts` | `getStub` returns whole stub at 631; 642 `check`, 653 `record`, 664 `clear`, 675 `erase`, 686 `dispatch` | Methods invoked directly on returned stub; no change |
| `sharedSendCap.ts` | `createSendCapClient` helper uses `service.fetch(new Request(...))` | Service binding fetch is direct; no detached RPC call |
| `promotionSendCap.ts` | Constant only; no namespace/client invocation | No RPC call |

The other `.call` matches were ordinary browser fetch wrappers or `Object.prototype.hasOwnProperty`, not DO RPC. No additional true instance was found. No changes were made to the other clients.

## Regression evidence

Runtime: Node **v22.23.5**, Windows. Command from the application root:

```powershell
& $node22 --test scripts/unit/consistencyCoordinatorRpc.test.mjs
```

`$node22` is `C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe`.

The worker builds with `NODE_ENV=production`, `CI=0`, and `STARMAP_CONSISTENCY_COORDINATOR_LOCAL=0`, and asserts fallback is disabled. The real namespace is supplied explicitly. Outbound requests are blocked and counted; the test requires zero attempts. Promotion dispatch is disabled. All data are synthetic.

Assertions cover unknown token => `unknown`; legacy record => `consumed`; register => consume => `already_consumed`; account session upsert/read equality; promotion subscribe/read equality/re-subscribe; and a genuine DO kind mismatch retaining `ConsistencyCoordinatorUnavailableError`, its code, and its original cause.

The production invocation hunk was temporarily reverted locally, the test was run, and the fix was restored in a `finally` block. The pre-fix run exited **1**, with **1 failed / 0 passed / 0 cancelled**:

```text
not ok 1 - coordinator client uses real workerd RPC with local fallback disabled
label: 1 unknown/null
name: ConsistencyCoordinatorUnavailableError
code: consistency_coordinator_unavailable
cause.name: TypeError
cause.message: The RPC receiver does not implement the method "call".
false !== true
```

The restored fix exited **0**, with **1 passed / 0 failed / 0 cancelled** (1.718 seconds overall). The same test passed inside the full unit run (2.169 seconds test duration). The original diagnostic scripts are not part of this delivery.

Local setup caveats: the first test attempt ran before dependency installation finished and could not import Miniflare. An initial pre-fix attempt during installation timed out at 60 seconds; that is not counted as proof of the RPC regression. The test timeout was increased to 180 seconds, and the definitive pre-fix/fixed runs above both completed in under two seconds. The initial `npm ci` launcher unexpectedly used Node 26.13.0 despite a PATH override; it completed successfully, but this is explicitly not claimed as a Node 22 install. All reported regression and validation runs use the explicit Node 22 executable. No dependency files changed.

## Validation

All validation uses Node v22.23.5 with `TZ=UTC`. From `star-map-app-final`, PATH was prefixed with the Node 22 binary directory and scripts invoked as:

```powershell
$env:TZ = 'UTC'
& $node22 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:unit
& $node22 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
& $node22 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run lint
& $node22 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
```

| Command | Result |
| --- | --- |
| New regression, original hunk restored temporarily | Exit 1; expected RPC `call` error |
| New regression, fixed code | Exit 0; 1 passed |
| `npm run test:unit` (`TZ=UTC`) | Exit 1; 3,134 tests, 3,117 pass, 17 fail, 0 cancelled/skipped; final run 76.619 seconds |
| `npm run typecheck` | Final exit 0; initial whole-stub cast failed TS2352 and was corrected to a method-only call-site cast |
| `npm run lint` | Exit 0 |
| `npm run build` | Exit 0; webpack compilation and page generation completed |

The full unit failure name-set follows verbatim. Windows-specific evidence includes malformed drive paths, unsupported `c:` ESM URLs, CRLF-sensitive assertions, and path-separator-sensitive source scans. These are observed failures, not a claim that every failure has been independently baseline-reproduced. No fixes outside the brief were attempted. CI is canonical and was not run in this local bundle delivery.

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

After the full suite, the fixture's clock was moved one day ahead to prevent real alarms racing the assertions. Both pre-fix and fixed targeted runs were repeated on that final fixture: expected failure then pass (fixed: 2.321 seconds). Typecheck then rejected the initial whole-stub generic cast (TS2352). The final code casts only `stub[method]` inside the invocation expression; no function is extracted. The real-workerd regression passed again (1.586 seconds), and final typecheck passed. The full unit suite was rerun on this final form: 3,117 pass / 17 fail, with an identical failure name-set (compared programmatically), 0 skipped/cancelled.

## Token draw

Cumulative session token accounting snapshot at 2026-11-13T22:35:40Z, from this session's local token-count event: input 6091647, cached input 6009344, uncached input 82303, output 20897 (including reasoning 5427), total 6112544. Cached input is a subset of input; reasoning is a subset of output. This snapshot precedes packaging and the final response; it is not a billing amount. No subagents were used.


## Packaging

Build-generated merchant-feed changes were restored. Raw local validation logs are retained outside the worktree at C:\Users\ReuseTechBC\projects\sm-magicfix-evidence. The report embeds the required failure evidence and name-set, so those logs are not required to review the bundle.

Packaging commands (run after the implementation/report commit):

```text
git bundle create C:\Users\ReuseTechBC\projects\qmagicfix.bundle c3655faa9a930a20256f0af33eef1ab8ad1d3918..HEAD
git bundle verify C:\Users\ReuseTechBC\projects\qmagicfix.bundle
```
