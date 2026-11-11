# Merchant feed bridge build — 2026-11-11

Operator: Jack's explicit local bridge-build instruction. Branch: `feat/merchant-feed-full`.
Reused the clean `C:\Users\ReuseTechBC\projects\sm-feed` worktree; starting HEAD and
`origin/main` both resolved to `905ac5215f5d25b9ad1dacd3cc2b62ea2178be6c`.

## Result

Default item count: **3 before → 9 after** (six standalone physical catalogue
products, the existing framed-HD bundle, and two non-recurring digital offers).
`MERCHANT_FEED_INCLUDE_DIGITAL` now defaults to **true**. Explicit false still
disables both digital offers, leaving seven physical offers at default pricing.
`hd_unlimited` / subscriptions are excluded.

Full ID list:

| ID | Status |
| --- | --- |
| `print_poster_unframed` | Existing live ID, byte-stable |
| `print_poster_framed` | Existing live ID, byte-stable |
| `print_poster_framed_hd_bundle` | Existing live ID, byte-stable |
| `print_poster_unframed_16x16` | New |
| `print_canvas_wrap` | New |
| `print_mug_11oz` | New |
| `print_card_4x6` | New, standalone keepsake card |
| `digital_single_hd` | Newly enabled by default; preserves the generator's pre-existing opt-in ID for hd_single |
| `digital_pack3_hd` | New, hd_pack3; follows the existing digital ID scheme |

No catalogue prices changed. No checkout, editor, download, print-pipeline, or
production configuration changes. Only the generator, its new regression test
file, and this requested report are committed. Generated public XML is not
committed, per the generator-and-tests scope.

## Price parity and preserved semantics

The generator transpiles and imports the real `src/lib/printCatalog.ts` and
`src/lib/pricing.ts` in memory using the already-installed TypeScript dependency.
Physical prices come from each catalogue row's fallback and env names; digital
and HD add-on fallback prices come from the pricing functions. There is no
copied price table. This avoids requiring Node's newer native TS support in the
generator while retaining compatibility with the repository's Node range.

The regression tests independently load the real TypeScript modules through the
existing test alias loader. They compare every emitted item price against
`getPrintPricingTiers()`, `getPricingTiers()`, and the framed tier plus
`getPrintDigitalAddOnPrice()`. Tests cover defaults and public/server overrides
and pin the exact nine-ID set. Override test values are inputs, not a price table.

The generator retains public-first price override precedence and its existing
single-currency formatter (`NEXT_PUBLIC_CURRENCY`, USD by default). It emits no
CAD variants and performs no currency conversion. A non-default-currency test
pins that legacy behavior. CAD offers remain a separate follow-up.

Existing physical item shipping logic, free-shipping threshold, conditional
framed-HD bundle inclusion, `in_stock` availability, restricted-country filtering,
and delivery defaults are retained. New physical products use their catalogue
shipping profiles and the same threshold; digital shipping remains zero. The
tests cover mapped rates, no-map fallbacks, threshold overrides, digital opt-out,
subscription exclusion, and country exclusion.

New items use existing crawlable pages and existing images: the 16x16 uses
`/star-map-poster`, canvas and mug use `/shop`, the card uses
`/star-map-keepsake-card`, and both digital offers use `/personalized-star-map`.
No landing pages were added. The canvas, mug, and card image files were verified
present locally. Live Merchant Center acceptance was not tested.

## Validation

All unit runs used **Node v22.23.4**, **TZ=UTC**, and
`--test-concurrency=1`. Baseline finished before generator edits; the changed
full suite ran afterward. Existing installed dependencies were reused through
a gitignored `node_modules` junction to the owner's main checkout; no package
or lockfile changes and no fresh `npm ci`.

| Run | Tests | Suites | Passed | Failed | Skipped/cancelled/todo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unchanged origin/main baseline | 2778 | 3 | 2605 | 173 | 0 |
| Changed branch | 2785 | 3 | 2612 | 173 | 0 |
| Focused feed regression files | 17 | 0 | 17 | 0 | 0 |

Compared normalized TAP failure names (stripping only TAP ordinal prefixes):
**173 baseline names, 173 changed names, identical sets; zero new failures**.
Both full suites exit 1 because of the baseline failures; this is not a green
full suite. For example, baseline account-logout tests report
`NextRequest is not a constructor`. Unrelated baseline failures were not fixed.
The exact failure-name set is recorded below.

Commands (PowerShell, from `star-map-app-final` unless noted):

```powershell
$env:TZ='UTC'
npx --yes --package=node@22 node --version
# v22.23.4
npx --yes --package=node@22 node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs *> ..\..\feed-baseline.tap
# baseline: exit 1; counts above
npx --yes --package=node@22 node --test --test-concurrency=1 --test-reporter=tap scripts/unit/merchantFeedCatalog.test.mjs scripts/unit/merchantFeedFramedShipping.test.mjs scripts/unit/merchantFeedLandingLinks.test.mjs *> ..\..\feed-targeted.tap
# focused: 17 passed, zero failed
npx --yes --package=node@22 node --test --test-concurrency=1 --test-reporter=tap scripts/unit/*.test.mjs *> ..\..\feed-after.tap
# changed: exit 1; counts above
git diff --check
# pass
& 'C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe' node_modules/eslint/bin/eslint.js scripts/generate-merchant-feed.mjs scripts/unit/merchantFeedCatalog.test.mjs
# targeted ESLint: exit 0, no diagnostics
```

The equivalent `npx --yes --package=node@22 node node_modules/eslint/bin/eslint.js
scripts/generate-merchant-feed.mjs scripts/unit/merchantFeedCatalog.test.mjs` invocation
also completed with exit 0 and no diagnostics. It initially appeared stalled,
so the verified Node 22 executable was invoked directly as a fallback.

The TAP logs are local sibling artifacts under `C:\Users\ReuseTechBC\projects`.
Full app build/typecheck and browser suites were not run for this script-only
change. GitHub Actions remains the authoritative validator after bridge import.

## Handoff and divergences

Local bundle target: **`C:\Users\ReuseTechBC\projects\feed.bundle`**.
From the worktree root, the requested command is:

```powershell
git bundle create ..\feed.bundle feat/merchant-feed-full ^origin/main
```

No scope decisions were reopened. No push, merge, deployment, or production
access. GitHub CLI was unauthenticated (`gh issue list --search 'merchant feed'
--state all --limit 15` failed), so no linked issue could be retrieved and no
draft PR was created. The operator-specified branch and local commit/bundle
handoff replace the normal issue-linked branch/PR workflow for this run.

Git had no author identity configured. The initial commit attempt failed and
the initial bundle attempt correctly refused an empty range. The successful
commit uses command-local `-c user.name=Codex -c user.email=codex@localhost`;
repository and global Git identity settings remain unchanged.

The existing opt-in digital-single ID is reused, rather than inventing a
`print_` prefix for a digital product. The four added physical IDs follow
`print_<catalogue id>`; the pack follows the existing `digital_*_hd` scheme.

## Baseline failure-name set (unchanged)

```text
(a) sidecar-only isGift/customerEmail: proof classifies due and renders
(b) inline metadata, no sidecar: report identical to direct classification of the raw record
(c) no metadata anywhere: still gift_uncertain, render refused (no over-merge)
(d) inline values win over a conflicting sidecar (record precedence)
aggregate rating helpers are referenced nowhere outside the lib module
audit pin: retained stolen cookie loses authentication while same-email session B remains
BOT-P1 (F9): the webhook's pending rebuild never erases the dispatch marker — a failed reconciliation write cannot reopen dispatch
city prune: next.config keeps the host redirects alongside the city map
city prune: next.config redirects pin the full 21-entry map, one hop, no chains
Class B (join path, area 9): two publishers race the DESCRIPTOR flow with IDENTICAL bytes — both succeed; exactly one intent; the single entry names the shared digest
Class B (join path, deterministic): the joiner's upload succeeds through the real route — it JOINS the governing intent recorded at the seam (the governor submits no upload in this test); join record persisted with the governing pair
Class B: two publishers race the fused flow with distinct bodies — exactly one 200; the stored object + registry name the winner; the loser's bytes appear nowhere
composition: the renderer consumes the SAME clip path for the sky and the watermark
CONTROL conflicting receipt (stale initial read): 503 reconciliation_required
CONTROL durable intent write rejects before commit: 503 persistence_ambiguous
CONTROL genuinely unpaid fixture, Stripe retrieval rejects: outer-catch unpaid
CONTROL genuinely unpaid session: definitive unpaid, no writes
CONTROL revocation lands after the session put: revoked body, session write preserved
CONTROL revocation lands at settlement's pre-put check: revoked body, intent retained, no session write
CONTROL revocation via payment-intent tombstone: revoked body, no cookie
CONTROL revocation via record flag: revoked body, no cookie
CONTROL revocation via side evidence record: revoked body, no cookie
CONTROL session put rejects after commit: 503 persistence_ambiguous, session may be committed
CONTROL session put rejects before commit after intent commit: 503 persistence_ambiguous
CONTROL unpaid record carrying accounting state: 503 reconciliation_required
cookie resolver (§5.6): cookie + matching Origin identifies; foreign/missing Origin → 401; token present governs over cookie
deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
descriptor classification: bad signature → 401; expired → 401; identity mismatch → 409 prepare_stale
descriptor upload → finalized; identify afterwards → I-1 already_finalized; fused re-POST of the same bytes → legacy success shape
descriptor upload with a malformed PLTE payload → 422 bad_plte and NOTHING is published (Codex P2 on the round-3 head)
descriptor upload with an unsupported critical PNG chunk → 422 and NOTHING is published (correction round 3 — Codex P2-2)
descriptor upload with high-bit IDAT chunk type bytes → 422 bad_chunk_type and NOTHING is published (Codex P2 on the round-3 head bc37757)
descriptor upload with nonconsecutive IDAT chunks → 422 nonconsecutive_idat and NOTHING is published (Codex P2 on the round-3 head)
durable failure preserves the browser cookie and permits retry
F2 (consumers): link + status agree on the generated code; legacy inline codes still read
F2 (portal): the customerId cache write cannot republish stale entitlement state
F2 (referral link): generating a code cannot republish stale entitlement state
F3: a refund landing mid-consume cannot be erased by the consume's stale write (and vice versa)
F5: a reversal landing between the terminal reread and the terminal write is not erased
F7: cap evidence pushed outside the feed's read slice still enforces the 24h cap
F7: grants recorded in the dedicated cap ledger survive total feed eviction
F9: a clean dispatch carries the stable dispatch identity in payload and header
F9: a dispatch with an unknown outcome (network failure) fails closed to reconciliation
F9: a receiver that creates the order and then answers 500 has NOT provably rejected — the dispatch stays attempted (gate fix round 1 P1-C re-pin)
F9: an accepted dispatch whose sent-write fails is never blindly redispatched
fails with the exact command and spec when Playwright discovers zero tests
fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
fused re-POST with DIFFERENT bytes against a finalized artifact → 409, never success, winner retained
Gate round 2 (F9): a legacy 'rejected' marker refuses at BOTH dispatch sites — it encodes an ambiguous response, not a proven refusal
Gate round 3 (F9): a present dispatch marker whose state is missing or unrecognized refuses at BOTH dispatch sites — only an absent marker may dispatch
identify I-2: conflicted registry entry → 409 publication_conflict
identify I-3: live governing intent, object absent → finalization_pending + fresh descriptor + upload recovery
identify I-4: live governing intent, object present → finalization_pending + reconcile recovery, NO descriptor
identify I-5: fresh artifact → identified + descriptor naming the derived identity
item 3: routing enabled but authority unavailable defers safely — pending state, no legacy fallback grant
item 3/5: strict referrer revocation evidence produces a referrer_inactive validation skip (no grant)
item 3+4: routing-disabled eligible reward defers — pending state, no grant, no aggregates, no dedupe marker, retried on redelivery
item 4 (fix round 2): a conversion already reversed when bookkeeping resumes closes without the aggregate delta ever applying
item 4 (fix round 2): a reversal landing mid-bookkeeping (after the delta, before the terminal write) survives the terminal write — no second reversal
item 4 (fix round 2): aggregate evidence is not evicted by later conversions — a stalled conversion retries without double-counting
item 4 (fix round 2): an unreadable referral record during a grant_confirmed resume is retryable — nothing terminal is claimed, the healthy retry completes exactly once
item 4 (fix round): aggregate-write failure during a grant_confirmed resume stays resumable — the retry completes bookkeeping exactly once
item 4 (fix round): reversal of a counted completed grant decrements the aggregate by exactly one (control)
item 4 (fix round): reversal of a finished legacy decision (no phase, conversionRecorded) still decrements the aggregate (control)
item 4 (fix round): reversal of a mid-bookkeeping grant (aggregate marker landed, terminal outstanding) decrements by exactly one
item 4 (fix round): reversal of an uncounted confirmed grant keeps other conversions' aggregate intact while the credit clawback lands
item 4: a grant_confirmed state resumes at bookkeeping — the grant seam is not re-entered and aggregates apply exactly once
item 4: finished legacy decision (rewarded:true + conversionRecorded:true) stands without reprocessing
item 4: poisoned legacy state (rewarded:true, no outcome fields) is surfaced for reconciliation, never granted or consumed
item 4: terminal-put failure after the bookkeeping effects replays bookkeeping only — no double aggregate, no duplicate events
item 4.10: reversal recognises an authority-confirmed grant (grant_confirmed, conversionRecorded false) and claws back
item 4.10: reversal still no-ops for a merely pending conversion (no grant effect exists)
item 5: refund tombstone landed before fulfillment suppresses the referral reward end-to-end
item 5: revocation evidence arriving mid-flight (after settlement, before grant decision) yields a terminal purchaser_revoked skip, never a grant
item 5: revocation evidence inserted at the pre-grant recheck is caught (no grant)
item 5: unreadable purchaser revocation evidence is retryable — no grant, no terminal state, no pending write
item 6: an inactive transition preserves an existing refund revocation reason and timestamp
item 6: evidence landing before the activation re-check blocks the put
item 6: evidence landing during the activation put converges to revoked and the event stays retryable
item 6: legitimate inactive-to-active transition still applies and finalises; replay is a duplicate
item 6: missing or mismatched subscription mapping is retryable, never silently dropped
item 6: refund-revoked subscriber is never reactivated by a stale active subscription event (side evidence)
item 6: refund-revoked subscriber is never reactivated via the payment-intent tombstone alone
item 6: unreadable revocation evidence makes a subscription event retryable (no mutation, no marker)
item 7: a failed subscription session write is answered retryable and the replay applies the update
item 7: a legacy numeric dedupe counter does not suppress subscription processing
Merch fall-through: a paid merch order in the alternate-only configuration dispatches once, under the marker discipline
Merch fall-through: a standing attempted marker refuses the webhook pass instead of dispatching
missing record and repeated logout are idempotent
missing state: operator retry route refuses
missing state: webhook pass refuses
missing/empty cookie ("   ") skips KV
missing/empty cookie ("") skips KV
missing/empty cookie (undefined) skips KV
no public copy states a review count or a numeric rating for StarMapCo
OFF state (flag 'false'): protocol-class POSTs are refused at the route layer (R-3(b) darkness, F-2.1) and reach NO legacy write
OFF state (flag 'false'): the cookie classification follows the token — ambient cookie beside a token stays legacy; cookie-only is a protocol form
OFF state (flag unset): POST is the base legacy flow — descriptorless upload → legacy-key storage → GET serves the bytes; a re-upload overwrites; no authority state is touched
P1-A (F3): a consume that sealed before an authority outage cannot resurrect a revocation that landed unleased during it
P1-B (F5): a reversal landing after the terminal evidence consult is merged by the terminal write, never erased
P1-C (F9): a webhook dispatch answered 500 stays attempted and is never redispatched on redelivery
PASS all three auxiliary boundaries reject: each attempted independently, no extra grant
PASS already_settled path with healthy storage: paid body carries the real print summary
PASS already-paid destination + different incoming cookie: one durable refusal attempt precedes the paid answer
PASS analytics boundary rejects with a generic error: contained
PASS analytics dedupe remote-put failure: settled payment stays paid
PASS analytics dedupe remote-read failure: settled payment stays paid
PASS cookie variant under mapping failure: digital credit purchase sets the cookie
PASS cookie variant under mapping failure: print with digital add-on sets the cookie
PASS cookie variant under mapping failure: print-only sets NO cookie
PASS cookie variant under mapping failure: subscription sets the cookie
PASS cookie variant: preserved incoming live-entitlement cookie under mapping failure
PASS discount-rejected session + carry cookie: refusal attempted before the gate answer
PASS healthy already-paid fast path: paid body carries the real print summary
PASS healthy initialized path: paid body, cookie, mappings, analytics
PASS healthy initialized print path: paid body carries the real print summary
PASS later funnel increment failure: dedupe stays committed, payment stays paid
PASS no cookie: no refusal write
PASS nonfulfillable Stripe session + carry cookie: refusal attempted before the unpaid answer
PASS payment-intent mapping failure: retrieval/charge still attempted, payment stays paid
PASS payment-intent mapping put commits then rejects: payment stays paid
PASS payment-intent retrieval failure keeps its existing catch: payment stays paid
PASS print-summary read failure on the already_settled path: settled payment stays paid
PASS print-summary read failure on the initialized path: settled payment stays paid
PASS refusal persistence failure: 503 carry_refusal_persistence_pending, no paid assertion, no cookie, no settlement
PASS repeated carry request: another durable attempt, same operation identity, zero movement
PASS retry after degraded success: stored balance served, auxiliaries not replayed
PASS retry after refusal persistence failure: ordinary verification resumes
PASS revoked destination + carry cookie: refusal attempted before the revoked answer
PASS same-session cookie: no refusal write
PASS stale initial read, settlement sees settled record: already_settled response, no auxiliary calls
PASS Stripe retrieval failure + carry cookie: refusal attempted before the outer catch answers
PASS subscription mapping failure: payment stays paid, earlier mappings retained
PASS subscription mapping put commits then rejects: payment stays paid
passes when every named critical smoke command discovers tests
pending durable delete prevents a successful response; concurrent new session survives
PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
rejects invalid Origin ("https://preview.example.test/path") before cookie or KV mutation
rejects invalid Origin ("https://sibling.example.test") before cookie or KV mutation
rejects invalid Origin ("malformed") before cookie or KV mutation
rejects invalid Origin ("null") before cookie or KV mutation
rejects invalid Origin (null) before cookie or KV mutation
remote success followed by mirror failure is unconfirmed; retry succeeds
retired posts permanently redirect one hop to the survivor
revocation parity (OFF state, legacy resolvers): a superseded token gets no archive write and no archive read; the governing token is served exactly as before
revocation parity (ON state, protocol resolver): a superseded token does not resolve for identify; the governing token identifies
route replay race (correction round 3, area 3; rendezvous forced per the Codex P2 on the round-3 head): two IDENTICAL uploads whose stateBefore snapshots are BOTH read before either registration is released, straddling a JN1→R7 promotion — the stale-snapshot registration is reconstructed from the fresh persisted intent and replays; both succeed
route replay race, control (correction round 3, area 3; rendezvous forced): DIFFERENT bytes under the same forced interleaving — the join-matching upload succeeds, the other is refused 409 and the reconstruction cannot launder it
route replay reconstruction, failure injection (correction round 4, area 3 — G-dot verdict \#3): the stale-snapshot registration is refused, a fresh promoted intent stands, and the reconstruction apply is UNAVAILABLE (null) — the route answers the retryable upload_failed, never the stale intent_payload_conflict, and publishes nothing
route replay, governing (area 3 fix round 2): a descriptor upload whose intent already stands replays through the real route — no new intent, no generation burned, the recorded expiry is not renewed
route replay, promoted (area 3 fix round 2): after a JN1→R7 promotion, the joiner's re-upload through the real route replays against the machine-stamped intent; with different bytes it conflicts at the dedupe boundary
S94-1 gate fix round 1 (P1): a purchaser_revoked skip over the pending checkpoint preserves the grant identity, and the refund reverses the accepted grant through it
S94-1 gate fix round 1 (P1): an accepted grant whose grant_confirmed write failed is reversed through the authority before the reversal may finalize — the sequence the F4 deferral assumed, closed
S94-1 gate fix round 1 (P2): the F6 repair does not duplicate legacy random-id reversal events on redelivery
S94-1-F1: routing-disabled reversal of a legacy rewarded conversion reclaims ZERO from the combined balance — purchased credits are unreachable
S94-1-F4: routing-enabled reversal of a pending conversion defers — a committed-but-unconfirmed grant is never finalized around
S94-1-F6: a reversal ledger append that fails after the state finalizes is repaired on redelivery — events land exactly once
S94-1-F8: a birth-pending authority grant is paired with its reversal — the refund defers instead of finalizing unpaired
S96-1 F1: a hold whose session cannot be resolved stays retryable (503), never ACKed away
S96-1 F1: order_put_hold is recorded + alerted once, and a terminal failure supersedes and clears it
S96-1 F2: a retry parked mid-read loses cleanly to a concurrent webhook delivery
S96-1 F2: a webhook delivery parked mid-read cannot dispatch after a concurrent retry claimed the order
saved-map API sanitizer validates and retains fontWeight
source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
terminal-success comparison (area 7 P2 / CB-P2a): a requester whose retained intent lapses mid-flight while a successor takes governance gets 409, never success (requester finalizes first)
terminal-success comparison (area 7 P2 / CB-P2a): a requester whose retained intent lapses mid-flight while a successor takes governance gets 409, never success (successor finalizes first)
unrecognized state: operator retry route refuses
unrecognized state: webhook pass refuses
upload validation: wrong-dimension PNG → 422 with NO staging write, intent, or registry entry (§5.10 order)
valid trimmed token: exact durable key, success and existing cookie attributes
wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers
```
