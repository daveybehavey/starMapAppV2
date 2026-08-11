# Print order coordinator (Durable Object) — migration / rollback / bootstrap

Issue: [#243](https://github.com/daveybehavey/starMapAppV2/issues/243)

## What ships

- New **SQLite-backed** Durable Object class `PrintOrderCoordinator`
- Wrangler binding: `PRINT_ORDER_COORDINATOR`
- Migration tag: `v1_print_order_coordinator` (`new_sqlite_classes = ["PrintOrderCoordinator"]`)
- Worker entry: `star-map-app-final/worker.entry.ts` (re-exports OpenNext worker + this DO)
- **No** R2 business-state bucket (`print-order-state` / `PRINT_ORDER_STATE_R2` are rejected)

## Authority model

- Per logical print order (opaque `idFromName` from hashed session id) — **not** a global singleton
- DO state is authoritative for terminal failure + failure-alert workflow
- Workers KV `print:order:*` remains an ordinary read-model mirror
- Stale KV healthy/`sent` writes cannot erase or mask a DO terminal failure
- Provider (Printful / Resend) network I/O stays **outside** DO storage transactions

## Bootstrap (existing orders)

When a coordinator object has no rows yet:

1. `bootstrap_from_kv` reads the KV mirror once
2. If KV `status === "failed"` → DO becomes `failed` (never invent healthy over known failure)
3. If KV has `printfulFileReviewPendingAt` → DO becomes `pending_files`
4. If KV `status === "sent"` without pending/failure → DO becomes `healthy`
5. Otherwise → `uninitialized` until the next write path

Healthy transitions **fail closed** when the coordinator binding is unavailable/corrupt in production.

## Failure alerts

- Resend-only for failure alerts (deterministic opaque `Idempotency-Key`)
- Safe retry window: **20h** from first terminal-failure recording (24h Resend retention − 4h margin)
- After the window: `operator_action_required` — no risky duplicate send
- SendGrid is **not** used for this failure-alert path

## Deploy notes

1. Merge only after CI + independent Codex review + human approval
2. Production deploy applies the `v1_print_order_coordinator` migration automatically with the Worker
3. No live customer/order mutation during implementation tests
4. Do **not** provision an R2 `print-order-state` bucket

## Rollback

1. Redeploy previous Worker version **without** relying on DO writes for healthy paths, **or** roll forward with DO reads still authoritative
2. Removing the DO binding while old code expects it will fail closed on healthy transitions (safer than silent KV-only)
3. Do not delete the SQLite migration tag from Wrangler history after it has been applied in production — follow Cloudflare DO migration rules for any later rename/delete
4. KV mirrors remain readable for ops; terminal failures recorded only in KV before this ship stay bootstrapable on first touch

## Local / CI

- Without the Cloudflare binding, local/CI uses an in-process memory coordinator (`STARMAP_KV_ALLOW_LOCAL` / `CI` / development)
- Unit tests cover the pure state machine and post-submit scenarios without live Printful/Resend calls
