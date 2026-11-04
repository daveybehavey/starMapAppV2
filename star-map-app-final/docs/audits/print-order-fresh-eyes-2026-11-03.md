# PRINT-ORDER fresh-eyes audit — 2026-11-03

## P1 — N1: Stripe webhook continues into Printful submission after a completed manual resolve

**Live double-print / double-COGS risk, conditional on an overlapping operator recovery.** Newly identified surviving caller; this is **not** a re-report of the retry-route race fixed by #501.

The webhook checks KV `sent` before its pending write ([src/app/api/stripe/webhook/route.ts:1868](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L1868)), then awaits asset TTL extension ([src/app/api/stripe/webhook/route.ts:1890](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L1890); optional card await at 1907). With a complete recipient, it skips the recipient-refresh recheck entirely. It reaches native V1 submission at [src/app/api/stripe/webhook/route.ts:2135](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L2135) or V2 submission at [src/app/api/stripe/webhook/route.ts:2016](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L2016) without a fresh authority/KV fulfillment check.

**Deterministic reproduction against this main:** enter the real `queuePrintOrder` with a valid paid-print-shaped session and complete recipient; inside the asset-TTL seam, call the real admin resolve route with manual provider order A. Resolve returns HTTP 200 and authority binds A. Resume the webhook. The real V1 submitter issues **one new provider POST**; the synthetic provider accepts order B. The later bind refuses `conflicting_provider_id` and throws `PrintOrderAuthorityBindError`. That refusal occurs **after** the provider side effect.

A manually fulfilled order need not carry the checkout's `external_id`: resolve only records an identity ([src/app/api/print/orders/resolve/route.ts:81](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/resolve/route.ts#L81)), while V1 deduplication uses the checkout-derived external ID ([src/lib/printful.ts:172](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printful.ts#L172), [src/lib/printful.ts:213](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printful.ts#L213)). Therefore native provider idempotency does not reconcile unrelated manual A. With default auto-confirm, B is submitted for production ([src/lib/printful.ts:119](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printful.ts#L119)). This is a code-reachable risk, not evidence that a real duplicate occurred.

**Why new relative to the fixed baseline:** #501 added `standDownIfFulfillmentMoved` to **admin retry**, and its regression tests pass. #505 repaired webhook recipient-refresh persistence, which runs only when the recipient is missing. Neither covers this complete-recipient webhook continuation. This is a long pre-submit await window, not merely the already-documented final-read-to-write residual. The V1 path was behaviorally reproduced; the equivalent missing V2 admission check is source evidence, not a live V2 experiment.

**Suggested bounded follow-up, not implemented:** give webhook dispatch the retry route's fresh authority/KV stand-down behavior after long awaits, including existing alternate claims; review a shared authority submission/resolve claim separately if an absolute guarantee is required.

## Scope, baseline, and evidence standard

- Repository: `daveybehavey/starMapAppV2`; runnable root: `star-map-app-final/`. Repo-root legacy scaffolding is excluded.
- Audited main: **`a7e8cabfb4c7a85a2c84f40388926885d69a7762`**. Fetched `origin/main` and inspected that exact detached revision. Main advanced during audit with #533 (campaign-clock/public-copy changes only). Inspected that intervening diff; print pipeline files are unchanged. Refreshed to the final revision and reran the four synthetic reproductions.
- Fix baseline: [#497](https://github.com/daveybehavey/starMapAppV2/pull/497), [#501](https://github.com/daveybehavey/starMapAppV2/pull/501), [#502](https://github.com/daveybehavey/starMapAppV2/pull/502), [#505](https://github.com/daveybehavey/starMapAppV2/pull/505). Read their descriptions/dispositions and inspected the resulting source and focused regression suites.
- Related architectural context: [#243](https://github.com/daveybehavey/starMapAppV2/issues/243). This document is the operator-requested read-only audit, not implementation or closure of that issue.
- Grades: **P1** = credible duplicate physical fulfillment / material money exposure; **P2** = recoverability, state integrity, or notification reliability defect without proven duplicate manufacture.
- “New” means a surviving defect identified in this pass, distinguished below from the four fixes and their stated residuals; it does not mean introduced by those PRs.
- No production settings, records, logs, credentials, provider calls, customer messages, merge, or deployment were used. All behavioral evidence is synthetic and offline. “Delivered” in code means provider acceptance, not confirmed inbox delivery.

## Additional new findings

### P2 — N2: terminal webhook remains a stale whole-record writer

Evidence: [src/lib/printfulWebhookOrderEvents.ts:189](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L189) reads the KV snapshot, line 207 awaits provider review, lines 215–240 construct/send from that snapshot, and [src/lib/printfulWebhookOrderEvents.ts:244](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L244) rechecks only **authority**, before persisting the old record at [src/lib/printfulWebhookOrderEvents.ts:272](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L272).

**Reproduction:** start with an already-failed terminal KV record lacking a delivered failure-alert stamp (the retry-after-alert-failure case). While the real terminal handler awaits its alert sender, call the real shipping-notification writer; its failed-record base is retainable, so it successfully anchors shipment and stamps the intercepted email acceptance. Assert those fields exist before resuming the terminal handler. Resume the handler with delivered=true. It returns `updated`, but `shippedAt` and `shippingNotificationSentAt` are both gone. The authority revision has not changed for these annotation writes, so its revision check cannot detect them. Shipment can be recorded by admin notification; the shipping writer does not require a `sent` status. This reproduction deliberately uses a failed-record base, for which persistence permits the annotation write; it does not assume a sent-record shipping write can bypass terminal authority.

**Impact:** loss of shipment fact/review timing and delivered-email deduplication evidence; a later event can resend email. Authority terminal state remains correct. This is not #505's fixed ordinary problem/failure helper: terminal webhook still uses its own direct persist path. It is also not the unavoidable final read→put gap: there is no final KV reread after its provider/email awaits.

**Suggested follow-up:** merge terminal-owned fields onto the fresh record after I/O, retain the authority revision check, and preserve unrelated delivered stamps.

### P2 — N3: hold-sweep adapter resurrects a hold across its authority await

Evidence: [src/lib/printOrderHoldSweepRuntime.ts:78](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderHoldSweepRuntime.ts#L78) reads/merges current KV **before** the awaited authority check at lines 93–98; [src/lib/printOrderHoldSweepRuntime.ts:110](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderHoldSweepRuntime.ts#L110) writes that pre-check merge without another KV read. By contrast, the review-sweep adapter already re-reads/re-merges **after** that same await ([src/lib/printOrderReviewSweepRuntime.ts:115](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderReviewSweepRuntime.ts#L115)).

**Reproduction:** call the real `createPrintOrderHoldSweepStore(...).persistRecord` using a synthetic raw-KV namespace and authority stub. Inside `getState`, land a shipment, its notification stamp, and clear the hold; return a valid `bound` authority. The adapter reports `persisted`, removes the shipment/notification stamps, and restores the old `providerHoldAt`.

**Impact:** an ended hold becomes live again; false escalation, repeated alerts, and lost shipment/delivery evidence. This requires `PRINT_ORDER_HOLD_SWEEP_ENABLED=true`; production activation was not inspected. #497's merge protects changes before the merge, but not changes during this subsequent RPC. #502 repaired the analogous **review** adapter; the hold adapter remains different. This is a named awaited-RPC window, distinct from the acknowledged no-CAS read→put residual.

**Suggested follow-up:** apply the review adapter's post-authority reread/remerge pattern to the hold adapter.

### P2 — N4: concurrent terminal deliveries can send duplicate operator alerts

Evidence: [src/lib/printfulWebhookOrderEvents.ts:232](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L232) performs a KV-stamp check before sending; terminal transition idempotency returns the same revision on repeat ([src/lib/printOrderAuthorityState.ts:412](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderAuthorityState.ts#L412)). Neither reserves alert delivery. The email POST has no provider idempotency key ([src/lib/printOrderAlerts.ts:289](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderAlerts.ts#L289)); the SendGrid path likewise has none ([src/lib/printOrderAlerts.ts:335](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderAlerts.ts#L335)). The DO serializes lifecycle changes, not email delivery.

**Reproduction:** seed one unstamped order, run two real terminal handlers for the same event/order using `Promise.all`, and park each alert sender until both have entered it. Release both. **Two sends** occur; both handlers can project the same terminal revision. This needs no missing KV stamp or persistence failure.

**Impact:** duplicate intervention alerts during concurrent deliveries; noisy operational signals. No second print or charge is caused by this finding. Sequential stamp-based redelivery suppression still works. This differs from the fixed F9 “failed alert permanently acknowledged” problem and from fixed delivered-stamp merge losses: both sends start before any success can be stamped.

**Suggested follow-up:** a recoverable serialized alert reservation plus deterministic provider idempotency, with a bounded retry window; do not substitute KV `incr` as a lock.

## Writer census

Search boundary: production `src/`, `cloudflare-worker.ts`, and non-unit scripts for `persistPrintOrderRecord`, `printOrderKey`, literal `print:order:`, durable KV writes, and raw namespace puts. These are logical writer families; shared wrappers are identified so they are not mistaken for additional independent storage writers.

| Writer / entry | Fields or transition owned | Persistence / concurrency posture checked |
|---|---|---|
| [Shared record sink](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrders.ts#L637) | Whole `print:order:<session>` record; expiration/deletion | Creation-anchored retention; durable put/delete; nonterminal authority guard. No global merge or CAS. |
| [Webhook pending rebuild](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L1817) | Checkout metadata, recipient, pending state, attempts | Rechecks `sent` before write at 1868–1877; carries alternate marker. Does not act as a dispatch guard after later awaits: N1. |
| [Webhook recipient refresh](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L1915) | Recipient/contact/amount/currency | Fresh read; sent stand-down; merges refreshed fields on advancement; persist at 1957. #505 repair present. |
| [Webhook ordinary problem writer](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L1773) | Failed/pending diagnostics and failure-alert outcome | Delegates to shared latest-merged failure helper; undelivered unmarked failure remains Stripe-retryable. |
| [Webhook stranded-claim surfacing](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L2312) | Reconciliation failure + alert stamps | Checks fresh sent/marker before and after alert; direct whole-record persist at 2349. Narrow checks, not a general annotation merge. |
| [Webhook alternate attempted marker](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L2360) | Dispatch ID / attempted episode | DO claim first; durable marker before outbound POST. |
| [Shared alternate completion helper](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrders.ts#L587) | Sent/completion fields, accepted dispatch marker | Fresh KV + authority; refuses superseded lifecycle/episode; current-record merge; called by webhook and retry. |
| [Async payment failure](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/stripe/webhook/route.ts#L2823) | Pending → failed, explicit nonterminal provenance | Only pending records; direct persist at 2833; no provider side effect. |
| [Retry recipient hydration](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L77) | Recipient/contact data | Fresh-recipient merge/refusal at 99–128; after-hydration stand-down. |
| [Retry admission bound repair](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L297) | Authority-derived sent/provider projection | Bases repair on fresh KV, not handler-start record; persist at 300. |
| [Retry already-sent approval outcome](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L324) | Approval alert stamps | Fresh read after send; progress-only stamp merge; persist at 335. |
| [Retry mid-pass stand-down repair](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L365) | Authority-derived bound projection | Fresh KV + authority; persist at 440; stand-down called at 519 and 617. |
| [Retry pre-submit hydrate persist](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L610) | Hydrated retry metadata | Before final stand-down; dispatch gate at 617 guards native submissions. |
| [Retry alternate attempted marker](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L861) | Attempts/assets + marker | Post-claim KV/authority check, pre-dispatch release on stand-down, marker persisted at 894 before POST. |
| [Shared ordinary failure helper](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderFailurePersist.ts#L50) | Diagnostics, max attempts, alert outcome, explicit provenance | Webhook + retry delegates; latest merge, advanced-state refusal, progress-only stamps. |
| [Accepted provider identity writer](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printFulfillmentPostSubmit.ts#L357) | Sent/provider identity + index | Bind before optional review; concurrent-state preservation; identity persist at 412. |
| [Post-submit review writer](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printFulfillmentPostSubmit.ts#L473) | Review state/clock/error and owned alert stamps | Fresh merge, advancement refusal, delivered-stamp reconciliation; persist at 488. |
| [Terminal provider webhook](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L115) | Terminal provenance/diagnostic, hold clearing, failure alert | Authority first, revision guard; stale KV snapshot remains: N2; alert exclusion missing: N4. |
| [Hold provider webhook](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printfulWebhookOrderEvents.ts#L393) | Hold episode/reason/status + first-alert stamps | Fresh annotation merge at 570; rejects shipped/terminal/new resolve; persists at 601. |
| [Customer confirmation outcomes](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderConfirmation.ts#L37) | Three confirmation fields | Latest-record merge after send; direct persists at 107/126; sequential stamp suppression, no send reservation. |
| [Shipment anchor + email outcomes](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/shippingNotifications.ts#L100) | First shipment fact, hold clearing, shipping-notification fields | Fresh anchor at 162; notification-only current merge at 209; reports unrecorded success. |
| [Admin resolve](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/resolve/route.ts#L81) | Authority recover/bind, sent projection, operator stamps, same-episode hold clear | Revision/lifecycle/ID ownership checks around index work; final-record rebuild; persist at 210. |
| [Scheduled hold adapter](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderHoldSweepRuntime.ts#L72) | First-alert/escalation outcomes | Raw KV put with remaining TTL and authority guard; stale merge over RPC: N3. |
| [Scheduled review adapter](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderReviewSweepRuntime.ts#L75) | Review outcome and pending-episode alert stamps | Raw KV put with remaining TTL; authority guard then fresh remerge at 115. |
| [DO authority apply](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/durable-objects/PrintOrderAuthorityDO.ts#L124) | Seed, provider bind, terminal failure, operator recover/resolve, alternate claim/release | Synchronous read→pure transition→SQLite write; no provider I/O in apply. Local test client uses serialized memory store. |
| [Provider-ID correlation index](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printFulfillmentIndex.ts#L53) | Provider ID → session mapping, owned stale-index deletion | Secondary projection, not an order-state record; used by bind and resolve. |

No additional production order-record writer was found in non-unit scripts. Status/verify/review-proof reads and review-request suppression reads are consumers. Review requests maintain their own state; they are not additional `print:order:` writers. The census is not a declaration that every row is race-free.

## Hold, clear, and claim-release paths

- Provider hold admission: only `order_put_hold`, nonterminal; unresolved session → 503; authority unread → 503; delivered-alert failure → 502; conflicting provider ID and already-shipped order ignored. Fresh hold merge prevents resurrection by events that observe a newer resolve/shipment before merging.
- Hold removal in this app is **shipment**, **terminal failure**, or **operator resolve of the same episode**. A native `order_remove_hold` event is not handled: [src/app/api/printful/webhook/route.ts:389](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/printful/webhook/route.ts#L389) falls through to ignored for unrecognized types. This matches #497's explicitly stated design; do not count it as a new regression or claim automatic provider-release synchronization is clean.
- Hold sweep retries unstamped first alerts and escalates once after the threshold, only when explicitly enabled. Both hold/review sweeps ship default-off in code; committed source does not establish dashboard activation.
- Alternate claim release is separate from provider hold removal. Only retry's pre-dispatch stand-down invokes `releaseAlternateFulfillmentDispatchClaim` ([src/app/api/print/orders/retry/route.ts:880](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/app/api/print/orders/retry/route.ts#L880)); it runs before the outbound POST. DO release checks dispatch identity ([src/lib/printOrderAuthorityState.ts:369](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderAuthorityState.ts#L369)). Claims are not cleared on ambiguous network/HTTP outcomes; marker/claim reconciliation is intentional.
- Review and hold scheduled tasks are wired into the existing worker scheduler ([cloudflare-worker.ts:108](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/cloudflare-worker.ts#L108), [cloudflare-worker.ts:127](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/cloudflare-worker.ts#L127)). No activation/configuration was changed.

## Alert delivery assessment

| Signal | Delivery/retry behavior verified | Limit |
|---|---|---|
| Ordinary webhook failure | Shared helper records outcome; failed unmarked alert throws so Stripe can retry | Marker-carrying failures intentionally finalize per #502; no generic failure sweep |
| Terminal provider failure | Failure result → 502; unread authority → 503; sequential delivered stamp suppresses repeat | Concurrent delivery duplicates: N4; stale terminal projection: N2 |
| First hold / aging escalation | Immediate webhook attempt plus gated retry/escalation sweep; progress-only episode stamps | Hold adapter race: N3; activation unverified |
| File-review approval/failure | Stamped disposition; unresolved/owed-alert records revisited by gated review sweep | No global exactly-once email reservation |
| Aged pending file review | One stamp per pending episode; failed delivery stays eligible | Gated sweep; no inbox-delivery proof |
| Customer confirmation / shipping | Existing stamp guards and latest-record outcome merges | Provider sends precede stamp writes; concurrent sends/crash gaps remain; not an exactly-once guarantee |

Operator alerts use Resend when configured; SendGrid is used only when the Resend path is unconfigured, not after a configured Resend delivery failure ([src/lib/printOrderAlerts.ts:359](https://github.com/daveybehavey/starMapAppV2/blob/a7e8cabfb4c7a85a2c84f40388926885d69a7762/star-map-app-final/src/lib/printOrderAlerts.ts#L359)). Missing configuration returns an explicit undelivered result. Customer confirmation/shipping use Resend. Destinations and provider/dashboard delivery were not inspected.

## Explicit “checked, clean” list

“Clean” is limited to the named invariant at this revision and the offline evidence below; it excludes N1–N4 and does not certify production settings or universal concurrency safety.

- **Checked, clean — #501 admin retry vs resolve during payment/hydration awaits:** real-route regression tests pass; fresh stand-down exists after hydration and before dispatch. No re-report of its fixed race.
- **Checked, clean — #497 alternate dispatch claim exclusion:** serialized claim admits one concurrent alternate dispatcher; terminal/bound/operator-recovered refusals and legacy-marker bootstrap are present. The claim is not KV `incr`.
- **Checked, clean — alternate ambiguity posture:** any existing marker blocks blind redispatch; a non-2xx/timeout does not authorize another physical order; outbound request carries stable dispatch identity. Native and alternate destinations remain mutually exclusive per invocation.
- **Checked, clean — native V1/V2 stable external-ID reconciliation:** no retry suffix/reminted identity; existing provider order reconciliation remains. This protects same-external-ID retries, not manual-order scenario N1.
- **Checked, clean — terminal authority/provenance invariants:** terminal failure/cancel are distinct from hold and explicit nonterminal failure; provider-ID conflicts fail closed; stale healthy mirror cannot intentionally clear terminal authority. Final KV race limits remain documented below.
- **Checked, clean — payment admission:** print queuing is payment-gated; admin retry independently verifies payment/discount eligibility; focused payment suites pass.
- **Checked, clean — #502 merch retry parity:** V2 merch branch and poster V1 exclusion exist; missing destination becomes an explicit problem record.
- **Checked, clean — #505 ordinary failure/completion merges:** helper tests cover preservation/refusal; fresh recipient updates and already-sent approval stamps use their repaired paths. This does not include terminal webhook N2.
- **Checked, clean — review adapter's post-authority reread and stale delivered-stamp reconciliation:** current-record remerge exists; approval, failure, and same-pending-episode stamps are reconciled in the gate-6 tests. Hold adapter is separately flagged N3.
- **Checked, clean — hold admission and same-episode merge:** provider conflict, terminal/shipped stand-down, first-hold vs concurrent resolve, and progress-only alert merge tests pass.
- **Checked, clean — hold/review retention:** raw puts retain creation-anchored TTL; unretainable sweep records are skipped; shared persistence refuses/deletes unretainable records before callers may dispatch.
- **Checked, clean — shipping outcome merge:** outcome writes own only notification fields; later delivered success is not erased by a failure; unrecorded success returns failure rather than a false recorded-delivery claim.
- **Checked, clean — unresolved shipment correlation:** 503 remains on unresolved session. Missing tracking remains deliberate 200-ignore per #502, not re-reported.
- **Checked, clean — resolve identity requirement:** authority refuses identity-free resolve before transition; tested at authority layer. No claim about a particular HTTP status mapping beyond current source behavior.

## Previously documented residuals — not new findings

- #501/#505 final admission-check→dispatch and KV final-read→put gaps need a shared authoritative submission/resolve primitive or stronger storage for an absolute guarantee. N1 is earlier than this boundary; N2/N3 retain snapshots across substantial additional awaits.
- #502 HD-email claim-release non-atomicity is email-only, already documented, outside physical dispatch, and not a new double-print finding.
- #502's gated review sweep and #497's gated hold sweep require deliberate dashboard activation. Default-off is not proof of a production incident.
- #502's deliberate missing-tracking ACK, alternate-marker failure-alert exception, and deferred DL-1 cutover work are not re-filed.
- State projection correctness and email exactly-once delivery are separate. N4's two unstamped concurrent sends are not repaired by preserving an already-delivered stamp.

## Validation and reproducibility

Focused suites ran at initial pin `66edb0969f04c6f97dd6b00272aafed7244f5177`; the final pin changes no print pipeline or focused-suite source. Reproductions were rerun on the final pin. Node **v24.19.0**, `TZ=UTC`, no package/source edits:

1. From `star-map-app-final/`:

   `TZ=UTC node --test --test-concurrency=1 scripts/unit/printOrderAuthorityState.test.mjs scripts/unit/printOrderHoldSweep.test.mjs scripts/unit/printOrderReviewSweep.test.mjs scripts/unit/printfulWebhookOrderEvents.test.mjs scripts/unit/printWriterSlateFollowup.test.mjs scripts/unit/printRetryResolveRace.test.mjs scripts/unit/printFulfillmentIdempotency.test.mjs scripts/unit/printFulfillmentPostSubmitGate6.test.mjs`

   **99 tests passed, 0 failed.**

2. From the same root:

   `TZ=UTC node --test --test-concurrency=1 scripts/unit/printFulfillmentPostSubmit.test.mjs scripts/unit/printOrders.test.mjs scripts/unit/printPaymentGate.test.mjs scripts/unit/printRetryPaymentGate.test.mjs scripts/unit/printOrderDurableOrdering.test.mjs scripts/unit/moneyPathS94Followup.test.mjs`

   **133 tests passed, 0 failed. Total: 232/232.** Existing tests include source pins and harness mirrors as well as real-module tests; passing them alone does not disprove these findings.

3. `TZ=UTC node /workspace/work/print-audit/repro.mjs` — **four assertions reproduced** against real modules, all outbound I/O intercepted. Scratch files are outside the repository and are not part of this docs PR. Harness recipe:
   - Register the repository TS-alias/literal-alias loaders, its NextRequest stub, and local-only KV/authority fallbacks.
   - A load hook appends an export of private `queuePrintOrder` **in memory**; it does not edit source. Stub only asset TTL, alert sending, and optional file review. Keep native V1 submission and admin resolve real.
   - N1: run resolve from the asset callback; intercept native provider POST with synthetic success; assert one POST despite prior successful resolve and subsequent conflicting-ID bind refusal. Payment entry itself is tested separately; this harness invokes the post-payment queue function directly.
   - N2: start with a failed terminal mirror; inside terminal alert callback, invoke the real shipping writer using intercepted Resend acceptance; assert its shipment+notification stamps exist, then assert terminal return is updated and both stamps were erased.
   - N4: barrier two concurrent terminal alert callbacks until both entered; assert two sends for one logical terminal event.
   - N3: fake raw namespace plus authority `getState` callback that lands shipment/hold-clear; assert the real hold adapter writes the old hold and removes shipment.
   - All addresses/IDs/provider replies are synthetic. No real provider, email, checkout, or production record is involved.

4. `git diff --check` — clean on the audited source. The proposed branch adds **this Markdown document only**. Lint/typecheck/build/full application suite were not run for a documentation-only change; no such pass is claimed.

No fixes, code changes, merges, deployments, workflow dispatches, or production mutations are authorized by this document.
