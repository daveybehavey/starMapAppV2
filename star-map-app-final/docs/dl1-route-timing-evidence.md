# DL-1 route test timing investigation (#538)

Base: `a7e8cabfb4c7a85a2c84f40388926885d69a7762` (unmodified `origin/main` at investigation start).
Runtime: Node `v22.23.4`, npm, `TZ=UTC`.

## Root cause

The terminal-success test assumes all of this happens in one wall-clock window:

1. Issue a descriptor with `ttlMs: 200`, seed its retained intent, and reach `handleDescriptorUpload` before that descriptor expires. `POST` performs async session/token resolution before checking the descriptor, so this is not guaranteed.
2. Wait 300 ms, by which time A must have expired but must not have already published/finalized; register and promote successor B.
3. Observe A's staging file within 10 seconds, then race the finalize calls.

Under a scheduling stall A reaches classification after expiry and correctly returns 401 `identity_rejected`. It never validates or stages. The test then fails its staging-write premise, rather than exercising terminal-success comparison. Increasing the staging poll timeout cannot fix this ordering assumption. A sufficiently fast upload can also outrun the intended successor takeover.

A separate premise in `seedPromotionRace` admitted a governor at `Date.now()` with expiry `t0 + 500`, assuming 6000×6000 PNG validation always takes longer than 500 ms. The read rendezvous orders snapshots before registration, but does not expire the governor. A fast host can take R6 rather than the required JN1→R7 promotion.

## Test-only fix

- Admit the promotion-race fixtures in logical authority time 2 seconds before wall time. The governor is already expired before either route request starts; the descriptor remains live. Existing snapshot rendezvous and commit-history assertions still prove the stale-snapshot/refusal/reconstruction path.
- Freeze only `Date` in each terminal-success test. Let real request I/O and PNG validation finish to the route's `stateBefore` read, pause the returned snapshot, explicitly advance authority time past A's expiry, and let B take governance/promote.
- Pause A before its real finalize apply. Exercise both orders explicitly: A finalizes B's object (F6), or B finalizes before A (F1). Assert actual authority commit order, finalize outcomes, 409 `publication_conflict`, and B's sole registry entry/stored bytes.
- Extend the existing route-only authority wrapper with one-shot boundary pauses. Pauses release in `finally`; timeouts are diagnostic failures. Production code and external download contracts are unchanged.

## Reproduction

All commands run from `star-map-app-final/`. `node` below selects Node 22.23.4 (the session used `/workspace/.starmap-toolchain/node_modules/node/bin/node`).

Ordinary baseline command:

```sh
TZ=UTC node --test scripts/unit/dl1Slice4Route.test.mjs
```

Scheduling perturbation (test and production source remain unmodified):

```js
// work/dl1-timing/scheduler-stall.mjs
import { performance } from 'node:perf_hooks';
setInterval(() => {
  const until = performance.now() + 250;
  while (performance.now() < until) { /* synchronous CPU contention */ }
}, 10).unref();
```

```sh
TZ=UTC node --import ./work/dl1-timing/scheduler-stall.mjs --test \
  --test-name-pattern='terminal-success comparison' scripts/unit/dl1Slice4Route.test.mjs
```

Baseline failure:

```text
error: 'requester staging write observed (premise: its state read already happened)'
expected: true
actual: false
```

The diagnostic loader used the exact BASE test blob `a8ef82e0155d535622c9650a73584127f035e3d0` (verified with `git hash-object` against BASE). A follow-up diagnostic logged only 401 JSON responses from `Response.json` while running the exact original test source through a loader (same scheduling perturbation). It confirmed:

```text
DIAGNOSTIC route refusal: {"ok":false,"error":"identity_rejected","state":"identity_rejected"}
```

## Counts and validation

| Check | Result |
| --- | --- |
| BASE ordinary complete file | 6/6 pass, 27 tests each |
| BASE ordinary terminal test alone | 3/3 pass |
| BASE terminal with continuous 250 ms scheduling stalls | 0/3 pass; all fail staging premise |
| BASE continuous-stall follow-up with 401 tracing | 0/1 pass; 401 identity_rejected then same staging-premise failure |
| BASE terminal with bounded 250 ms seed-return delay | 0/3 pass; all trace 401 identity_rejected then fail staging premise |
| FIXED terminal with same bounded seed-return delay | 3/3 invocations pass, 2 finalize-order cases each (6/6 tests) |
| FIXED complete file, independent sequential processes | **20/20 consecutive pass, 28/28 each (560/560 tests), zero skips/cancellations** |
| `npm run lint` (Node 22) | exit 0, 12 existing warnings, zero errors |
| `npm run typecheck` (Node 22) | exit 0 |
| `TZ=UTC npm run test:unit` (Node 22) | 2475/2475 pass; 0 fail |
| `git diff --check` | clean |

The terminal test count increases from one to two because both F1 and F6 finalize orders are now required in every file run. The run loop stops on the first nonzero exit and used no retries. Test and helper source were unchanged throughout these 20 runs.

The ordinary baseline did not naturally fail in this session. The induced scheduling failures are reported separately; they demonstrate the faulty premise without claiming a naturally observed failure rate.

## Consecutive file run command

```sh
for i in $(seq -w 1 20); do
  TZ=UTC node --test scripts/unit/dl1Slice4Route.test.mjs > "work/dl1-timing/fixed-$i.log" 2>&1
  result=$?
  echo "fixed-$i exit=$result"
  if [ "$result" -ne 0 ]; then exit "$result"; fi
done
```

| Run | Exit | Tests passed | Duration (s) |
| --- | --- | --- | --- |
| 01 | 0 | 28/28 | 79.000 |
| 02 | 0 | 28/28 | 59.355 |
| 03 | 0 | 28/28 | 38.792 |
| 04 | 0 | 28/28 | 40.627 |
| 05 | 0 | 28/28 | 30.870 |
| 06 | 0 | 28/28 | 29.668 |
| 07 | 0 | 28/28 | 32.151 |
| 08 | 0 | 28/28 | 27.303 |
| 09 | 0 | 28/28 | 33.384 |
| 10 | 0 | 28/28 | 29.454 |
| 11 | 0 | 28/28 | 30.744 |
| 12 | 0 | 28/28 | 24.803 |
| 13 | 0 | 28/28 | 33.450 |
| 14 | 0 | 28/28 | 26.949 |
| 15 | 0 | 28/28 | 32.105 |
| 16 | 0 | 28/28 | 31.836 |
| 17 | 0 | 28/28 | 28.698 |
| 18 | 0 | 28/28 | 25.328 |
| 19 | 0 | 28/28 | 28.561 |
| 20 | 0 | 28/28 | 48.581 |

No merge or deployment performed. GitHub Actions remains the authoritative repository validator.

## Bounded-delay confirmation

To isolate the 200 ms premise from continuous event-loop starvation, a loader wrapped only the test fixture's authority client. After the *real* registration of A commits, it delays returning that seed operation by 250 ms. The route, PNG validation, storage and authority operations are unchanged. On the original test this makes classification reject expiry; with the fixed test, Date is frozen until the explicit snapshot boundary, so both finalize orders still reach their intended assertions.

Run on the baseline or fixed checkout respectively:

```sh
TZ=UTC node --import ./work/dl1-timing/seed-delay.mjs --test \
  --test-name-pattern='terminal-success comparison' scripts/unit/dl1Slice4Route.test.mjs
```

```js
// work/dl1-timing/seed-delay.mjs
import { register } from 'node:module';
register('./seed-delay-loader.mjs', import.meta.url);
```

```js
// work/dl1-timing/seed-delay-loader.mjs
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../../src/lib/entitlementAuthority.ts' &&
      context.parentURL?.endsWith('/scripts/unit/dl1Slice4Route.test.mjs')) {
    return {
      url: new URL('./seed-delay-authority.mjs', import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
```

```js
// work/dl1-timing/seed-delay-authority.mjs
import { createEntitlementAuthorityClient as realClient } from '../../src/lib/entitlementAuthority.ts';
export * from '../../src/lib/entitlementAuthority.ts';
export function createEntitlementAuthorityClient(...args) {
  const real = realClient(...args);
  return { ...real, async apply(sessionId, op) {
    const result = await real.apply(sessionId, op);
    if (op.type === 'register_publication_intent' &&
        op.intent.intentId === 'ab'.repeat(16)) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return result;
  } };
}
```

An exploratory run of the fixed tests under the *continuous* 250 ms / 10 ms CPU stall hit the new 30-second diagnostic test cap for both cases. A second attempt was stopped after the first case hit that same cap. Streaming PNG inflation has many asynchronous chunks, so continuous event-loop starvation also delays real validation; this is separate from the descriptor-expiry ordering bug. These attempts are not included in the bounded-delay or consecutive-file pass counts.
