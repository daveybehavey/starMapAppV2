# Print fulfillment pipeline

**Verified against source on `main` at Phase 4 head.** Describes the order → Printful fulfillment data flow as implemented. Payload/idempotency commercial behaviour is documented as-is; this pass does not change it.

## End-to-end stages

```
Stripe print checkout session
  → PrintOrderRecord (KV mirror key print:order:{sessionId})
  → submit to Printful (v1 and/or v2 catalog helpers)
  → bind provider order id on PrintOrderAuthority DO
  → optional post-submit file review + alerts
  → Printful webhooks mark terminal failed/canceled on the DO
  → KV / fulfillment index projected for ops UI (non-authoritative)
```

## Module map

| Module | Kind | Inputs | Outputs / boundary |
| --- | --- | --- | --- |
| `src/lib/printOrders.ts` | Pure helpers + KV persist | Stripe session fields, prior `PrintOrderRecord` | `PrintOrderRecord` shape; `persistPrintOrderRecord`; retention TTL; alternate-fulfillment dispatch markers; recipient helpers |
| `src/lib/printOrderAuthorityState.ts` | Pure FSM | Bind / terminal / recover / claim ops | Authoritative lifecycle for provider id + terminal states |
| `src/lib/printOrderAuthority.ts` | DO client | Session id, bind/terminal ops | Fail-closed without DO in production; local memory fallback gated |
| `src/durable-objects/PrintOrderAuthorityDO.ts` | DO host | Serialized state | Sole authority for bind + terminal + operator recover (see `docs/print-order-authority-do.md`) |
| `src/lib/printful.ts` | **Live** HTTP | `externalId`, variant, file URL(s), recipient | Create/reconcile Printful order; may reuse existing non-editable order (`reconciled`) |
| `src/lib/printfulV2Orders.ts` | **Live** HTTP | Catalog order input | v2 catalog submit when configured (`isPrintfulV2Configured`) |
| `src/lib/printFulfillmentPostSubmit.ts` | Orchestration | Accepted Printful identity + current record | DO bind → KV mirror/index → optional file review/alerts |
| `src/lib/printfulOrderReview.ts` | Live review helpers | Provider order id | File review disposition for post-submit |
| `src/lib/printFulfillmentIndex.ts` | KV index | Session / provider ids | Ops lookup index (projection) |
| `src/lib/printOrderAlerts.ts` | Side effects | Failure/approval contexts | Ops alerts (not authority) |

Deeper DO lifecycle rules: **`docs/print-order-authority-do.md`** (already the detailed FSM/ops doc). This file covers the **pipeline** around it.

## `PrintOrderRecord` (KV mirror)

Defined in `printOrders.ts`. Status is `"pending" | "sent" | "failed"`. Holds session id, variant, optional merch fields, Printful order id, errors, file-review annotations, alternate-fulfillment dispatch marker, hold annotations, etc.

KV key: `print:order:{sessionId}` (`printOrderKey`).

**Important:** Workers KV is a **best-effort non-authoritative projection**. After Printful accepts an order, bind must succeed on the DO before Stripe processing is considered complete (`PrintOrderAuthorityBindError` / retryable paths — see print-order-authority doc). Terminal webhooks update the DO first.

## Live-service boundary

- **Inside live submit:** request body construction for Printful currently lives **inside** `printful.ts` / `printfulV2Orders.ts` submit functions (not a separate pure “payload builder” module on `main`). Inputs are typed (`SubmitPrintfulOrderInput` / v2 catalog input); outputs are typed result objects (`ok`, `status`, `orderId`, `error`, optional `reconciled`).
- **Idempotency:** Printful `externalId` reuse / reconcile-on-duplicate behaviour is implemented in those submit paths — document and test it; do not “simplify” payload or idempotency semantics in drive-by edits.
- **Post-submit review** (`applyPrintfulPostSubmitReview`): runs only after provider identity is bound/mirrored. Confirmed failed files annotate + alert; they do **not** flip authority/KV to terminal `failed` — authoritative terminal transitions come from Printful webhooks via the DO.
- **Primary orchestration entry:** `bindAcceptedPrintfulIdentityThenReview` in `printFulfillmentPostSubmit.ts`.

## Alternate fulfillment

`printOrders.ts` defines `AlternateFulfillmentDispatch` for a non-Printful destination. Dispatch is replay-safe: a **present** marker blocks redispatch in every state (`alternateDispatchBlocksRedispatch`) until an operator reconciles. That path has no provider-side order identity bind comparable to Printful.

## Ops / backup

KV backup on `main` includes the `print:order:` prefix (values + counts/hashes). PrintOrderAuthority **DO** export is **not** on `main` (open backup PR #610). Restoring print authority from KV alone is insufficient.

## Code vs existing documentation

1. `docs/print-order-authority-do.md` matches the DO boundary as implemented — preferred reference for bind/terminal/recover.
2. No separate pure “payload transform” module exists on `main`; any doc that implies a standalone builder outside `printful.ts` / `printfulV2Orders.ts` would be aspirational — **not** claimed here.
