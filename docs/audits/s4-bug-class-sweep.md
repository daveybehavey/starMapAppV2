# S4 — four-class bug sweep

Analysis only. Baseline: `b12585834e4952fd3bebd7444b7adbb158088461` (`main` fetched for this task). Date: 2026-11-03, America/Vancouver. One branch, one draft PR, one new document. No fixes or release authorization.

## Scope and evidence standard

Reviewed the runnable `star-map-app-final/` app, selected unit/CI contracts, and existing editor audit context. Root legacy scaffolding is not treated as the app. Reference PRs [#560](https://github.com/daveybehavey/starMapAppV2/pull/560), [#557](https://github.com/daveybehavey/starMapAppV2/pull/557), [#559](https://github.com/daveybehavey/starMapAppV2/pull/559), and [#558](https://github.com/daveybehavey/starMapAppV2/pull/558) were read for the four class definitions. Their fixes are baseline context, not new findings.

CONFIRMED means an executable synthetic reproduction or a complete source path establishing the behavior and its trigger. Static confirmation is identified explicitly; it is not a claim of production incidence. SUSPECTED means a material premise remains unverified. Severity is proposed triage priority, not an incident declaration. No requirement to manufacture one confirmed defect per class.

Protected checkout/Stripe/payments, HD downloads/DL-1, print-order pipeline, commercial values, production configuration/flags and design rendering are excluded from implementation. No production APIs, customer data, real messages, transactions, deployments or secret inspection were used. No application, test, asset, workflow or configuration file changes. Existing design bytes are untouched; no new pixel-comparison run is claimed.

## Class coverage

| Class | Outcome |
| --- | --- |
| (a) Silent loss of a user benefit | A1 and A2 confirmed by source tracing. |
| (b) Stale snapshot persisted after awaits | B1 confirmed with the actual route function and isolated dependencies. |
| (c) Feedback behind an unopened view/reveal | Full-editor pre-reveal fix is present; C1/C2 remain suspected residuals, not proof the original reveal bug persists. |
| (d) Config/test pins drift | D1 suspected contributor-runtime contract mismatch, stopped at ownership collision. #558's removed-token source pins pass. |

## CONFIRMED

### A1 — P2: autosave failures leave reassuring save copy

**Evidence:** [star-map-app-final/src/lib/editorDraft.ts:740-766](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/lib/editorDraft.ts#L740-L766) returns `storage-unavailable` on `setItem` failure; [star-map-app-final/src/components/EditorExperience.tsx:1359-1399](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/EditorExperience.tsx#L1359-L1399) checks only `status === "saved"`. Every other outcome is discarded. [star-map-app-final/src/components/EditorExperience.tsx:2538-2555](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/EditorExperience.tsx#L2538-L2555) displays either “Draft autosaves on this device” or the previous saved timestamp. The simplified surface independently catches and ignores storage failures at [star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx:331-375](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx#L331-L375).

**Trigger/impact:** deny localStorage access, exhaust quota, or fail a write after one successful save; edit the design. The new draft is not saved, but there is no current-save failure state. Initial failure leaves an unconditional autosave promise; later failure leaves an old timestamp without a warning that newer edits are unprotected. Reload can lose those edits. A timestamp is evidence only of its earlier successful write, not proof that the latest state was saved.

**Validation:** source-confirmed UI omission. Existing `editorDraft.test.mjs` storage-error tests pass, establishing typed failure behavior; no browser quota simulation was run. The helper is already explicit about failure; the consumer loses that signal.

**Follow-up design:** surface a recoverable “could not save this edit” status and clear it only after a successful write. Keep editing available. Test success → failure → success and first-write failure. **STOP for overlapping test ownership:** open #569 owns `tests/draft-autosave.spec.ts`; no changes to that file or its task are proposed here. Coordinate before any future fix/test PR.

### A2 — P2: failed map-link hydration silently substitutes the local design

**Evidence:** [star-map-app-final/src/components/EditorExperience.tsx:1221-1288](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/EditorExperience.tsx#L1221-L1288) sets `mapFromUrlHandledRef.current = true` before fetching. Non-OK HTTP and invalid recipes return without feedback (`1242`, `1244`); rejected fetch/JSON is caught and ignored (`1286-1287`). The shown fallback is explicitly the draft. The one-shot flag is initialized at [star-map-app-final/src/components/EditorExperience.tsx:506-512](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/EditorExperience.tsx#L506-L512); this effect does not clear it on failure.

**Trigger/impact:** enter an editor URL with a valid `map_id` whose fetch returns 404/500, malformed content, or a network error. Loading that requested design fails silently while the editor continues with local/default state. There is no retry/reset in this failure path, so unrelated state changes do not retry the requested load. The user cannot distinguish a loaded linked design from fallback without visually recognizing the mismatch.

**Validation:** static confirmation of error branches and flag lifecycle, not a live outage or proof of a downstream purchase. The generation/cancellation checks at `1248-1257` correctly prevent a late successful response from overwriting user edits; that guarded path is not reported as a stale-write defect.

**Follow-up design:** an explicit load-failed state naming the requested-design operation, a retry action, and an explicit choice to continue with the current draft. Preserve the existing edit-generation fence. Test 404, network failure, invalid recipe, retry success and edits during an in-flight load. Do not expand this into commerce behavior.

### B1 — P2: concurrent distinct referral visits lose a counter increment

**Evidence:** [star-map-app-final/src/app/api/referrals/visit/route.ts:61-104](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/app/api/referrals/visit/route.ts#L61-L104) reads `record` once at `61`, awaits the fingerprint-dedupe read at `78` and dedupe write at `88-92`, then persists `{ ...record, visits: (record.visits ?? 0) + 1 }` at `94-97`. No fresh record read, conditional write or serialized counter operation intervenes. The shared KV setter is a value replacement, not a record merge: [star-map-app-final/src/lib/kv.ts:412-423](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/lib/kv.ts#L412-L423).

**Reproduction:** ran the real `POST` function, transpiled without changing its body, in a VM with synthetic request/response, rate-limit, normalization, event-append and KV dependencies. KV returns cloned records, so reads cannot mutate stored state accidentally. Seed `visits = 0`; start two requests with different documentation-range IPs (therefore distinct visitor fingerprints). Park both at the dedupe read until both original record reads have completed; then release both as not deduped. Each independently writes its dedupe key and replaces the referral record. Both return `ok: true, deduped: false`.

Observed output:

```json
{"successfulDistinctVisits":2,"persistedVisits":1,"writes":[1,1]}
```

**Impact/limits:** a real lost-update interleaving exists even with strongly consistent reads; a slow dedupe await widens its window. Confirmed scope is the visit count. This probe did not execute reward, conversion, payment or email logic and does not establish a monetary loss. It uses an explicit barrier, not a sleep or a production KV call.

**Follow-up design:** use an authoritative serialized counter/update boundary; merely re-reading before writing can still race. Acceptance: two distinct visits produce two increments, duplicate-visitor handling remains defined, and unrelated fields survive a concurrent annotation update. Stop any future implementation that crosses commercial/reward authority fences; this document grants no such authorization.

## SUSPECTED — not confirmed defects

### C1 — possible cold-font mismatch in pre-reveal feedback (P2 if reproduced)

**Evidence:** [star-map-app-final/src/components/EditorExperience.tsx:338-373](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/EditorExperience.tsx#L338-L373) and [star-map-app-final/src/app/MobileCreate.tsx:242-276](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/app/MobileCreate.tsx#L242-L276) compute pre-reveal overflow synchronously on an offscreen canvas. Their dependencies cover recipe state and reveal, but not font readiness. The renderer measures a configured font stack at [star-map-app-final/src/lib/renderSky.ts:1988-1994](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/lib/renderSky.ts#L1988-L1994). Existing focused tests use deterministic stub font measurements, not browser font loading.

**Hypothesis:** if first measurement uses a fallback face and the real face loads without a dependency change, the warning can remain absent or stale until another edit/reveal. This is a feedback-lifecycle cousin of class (c), not evidence of a remaining reveal-only computation. **Missing evidence:** actual font-load ordering, width/fit boundary crossing, and whether another mounted path refreshes the measurements. Reproduce with a fresh font cache and controlled font responses, keep inputs fixed while fonts complete, then compare pre/post-reveal report for the same recipe. No reproduction performed; do not promote to confirmed.

### C2 — simplified editor lacks overflow feedback; customer exposure unverified

**Evidence:** [star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx:924-928](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/SimplifiedEditor/SimplifiedEditor.tsx#L924-L928) mounts both preview branches without `onTextOverflowChange`; the callback contract is [star-map-app-final/src/components/PreviewCanvas.tsx:25-31](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/components/PreviewCanvas.tsx#L25-L31). The found route is [star-map-app-final/src/app/simple-test/page.tsx:1-12](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/src/app/simple-test/page.tsx#L1-L12), labelled a test surface and noindex. #559 explicitly recorded this simplified-surface exclusion.

The missing consumer is established, but whether that surface belongs in the customer warning contract is not. This is known scope residue, not a newly discovered full-editor reveal defect. First establish supported route exposure and intended warning parity. No customer-impact claim and no recommendation to widen #559 retroactively.

### D1 — advertised Node range may exceed what direct-TS unit tests support; STOPPED

**Evidence:** [star-map-app-final/package.json:5-16](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/package.json#L5-L16) advertises Node `>=20 <25` and runs `node --test scripts/unit/*.test.mjs` directly. [star-map-app-final/scripts/unit/editorDraft.test.mjs:1-10](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/scripts/unit/editorDraft.test.mjs#L1-L10) statically imports `.ts`; [star-map-app-final/scripts/unit/tsAliasLoader.mjs:33-56](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/star-map-app-final/scripts/unit/tsAliasLoader.mjs#L33-L56) handles resolution, not TypeScript transpilation. `AGENTS.md` already documents failures on Node 22.14 and the need for 22.18+ for these tests. [.github/workflows/ci.yml:14-15](https://github.com/daveybehavey/starMapAppV2/blob/b12585834e4952fd3bebd7444b7adbb158088461/.github/workflows/ci.yml#L14-L15) selects Node 22 for hosted CI.

**Unverified premise:** whether `engines` promises contributor-test support or application runtime support only; no lower-version matrix was run. Current Node 24.19.0 passes the selected suites. Do not call this a hosted CI failure, an application runtime failure, or a proven stale production pin.

**Ownership collision:** #567 and #572 both own `star-map-app-final/package.json` and `package-lock.json`. Investigation/remediation that would alter those manifests is stopped and left to their owners. No version, dependency, runtime config, fixture or production flag change made. A future owner-coordinated task could test the declared floor and align/document the contributor toolchain separately.

## Checks that did not become findings

- #559: desktop and mobile both compute overflow before reveal, pass shape-layout version, and publish post-reveal reports. The focused warning suite passes. Do not rediscover the fixed gating bug from older source snapshots.
- #558: the source contract test asserts the deploy workflow never references the removed token preference and exports key/email directly; focused tests pass. No inspection of live configured secrets and no assertion about today's secret inventory.
- Map hydration reads the current edit generation after its awaits; late-success overwrite is guarded. Autosave in the full editor is synchronous, so A1 is a dropped error outcome, not a fabricated await race.
- `useAstronomyWorker` rejects responses for inactive request keys and reports worker failure for caller fallback. A fallback label alone is not evidence that a user benefit was dropped.

## Ownership / stopped scope

Read the current open-PR metadata and complete changed-file lists for #527, #566, #567, #568, #569, #570, #571, #572, #576 and #577. None owns this new document. D1 collides with #567/#572 manifests; A1's natural browser-test file collides with #569. Those paths are stopped, not borrowed or modified. Storefront paths owned by #566/#568/#570/#571 and controls owned by #572 were not pursued for implementation. This task is findings-only and must not be treated as permission to fix the candidates.

No issue was created: the explicit operator request is the authority for this single findings draft PR. Related reference PRs and existing audit documents are context, not issues to close. Existing `docs/audits/516-editor-audit.md` and `518-mobile-parity.md` remain unchanged.

## Validation ledger and limits

Commands from repository root unless stated otherwise:

| Command / inspection | Result |
| --- | --- |
| `git status --short --branch`, `git fetch origin`, `git rev-parse origin/main`, `git log origin/main -6 --oneline` | Clean starting tree; reviewed baseline above. |
| `git switch -c docs/s4-bug-class-sweep origin/main` | One new branch from current main. |
| `rg --files`, scoped `rg -n` searches, `nl -ba …` source reads | Examined editor/draft/map-load/share, visit persistence, worker fallback, and selected test/config contracts. Not an exhaustive proof of absence. |
| Connected GitHub read tools: reference PR metadata, open PRs, changed-file lists, issue search for S4 bug task | Reference fixes merged; ten open PRs listed above; no matching S4 issue returned. |
| `node work/s4/probe.cjs` | PASS: real visit route loses one increment under explicit two-reader barrier. Also checked invalid draft input returns an explicit invalid outcome. Scratch script not committed. |
| In `star-map-app-final/`: `node --test scripts/unit/textOverflowWarning.test.mjs scripts/unit/deployProductionBridge.test.mjs scripts/unit/editorDraft.test.mjs` | PASS: 71/71, no skips/cancellations, Node v24.19.0. These are local unit/source tests, not a deploy invocation. |
| `git diff --check`; `git diff --cached --check` | PASS: no whitespace errors; staged diff contains only this document. |
| `npm ci`, lint, typecheck, full unit suite, build, commerce/render/browser smoke | Not run for a one-document change. No fixtures/snapshots updated. |

No claim of production incidence, full-repository defect completeness, all-style image validation, full-suite success or hosted CI success. Future remediation needs its own bounded task and ownership check. Independent review pending. Keep the PR draft; never mark ready, merge or deploy.
