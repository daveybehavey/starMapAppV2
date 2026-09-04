# Print order authority Durable Object (AG-016)

Thin per-logical-order SQLite Durable Object that closes the Workers KV terminal-state race.

## Scope

Authoritative for **only**:

1. `bindProviderOrderId` — durable Printful order id before optional file review
2. `markTerminalFailed` — `order_failed` / `order_canceled` only (`order_put_hold` is not terminal)
3. `operatorRecover` — explicit admin resolve clear of terminal

KV (`print:order:*`, fulfillment index) remains a **non-authoritative mirror**. Alerts, shipping email, and file review stay outside the DO (hard cut vs rejected #244/#245 coordinator).

## Bootstrap / migration

- Lazy seed from existing KV on first DO touch (`failed` → terminal, `sent`+id → bound).
- No bulk production data mutation required.
- Local/CI without the binding uses an in-memory serialized store (`NODE_ENV=test|development`, `CI=1`, or `STARMAP_PRINT_ORDER_AUTHORITY_LOCAL=1`).
- Production without a readable DO binding **fail-closes** retry/status nonterminal mirrors.

## Rollback

Redeploy prior Worker without DO authority reads; KV mirror remains last-known projection. Keep dual-write (DO then KV) while the DO is live so rollback does not lose provider ids.

## Config

- `wrangler.toml`: `PRINT_ORDER_AUTHORITY` binding + `v1-print-order-authority` SQLite migration
- `cloudflare-worker.ts`: OpenNext custom worker exporting `PrintOrderAuthorityDO`

Deploy provisions the DO namespace — requires explicit human approval (high-risk infra). This lane does not deploy.

## AG-041 authority boundary

The per-logical-order Durable Object is the **sole authoritative source** for:

1. provider-id bind (after Printful accept)
2. terminal failed/canceled lifecycle
3. explicit operator recovery

Workers KV (`print:order:*`, fulfillment index) is a **best-effort non-authoritative projection** only.

### Required runtime behavior

- After Printful accepts an order, a failed/unread/conflicting DO bind must **not** complete Stripe processing. Surface a retryable `PrintOrderAuthorityBindError` so the Stripe event is not durably acknowledged while provider identity is unrecoverable.
- Printful terminal webhooks that cannot re-read DO authority after marking terminal must return **retryable non-2xx** (`authority_unread`). A readable mismatched revision/lifecycle may skip the KV projection as stale.
- Status / operator / retry decisions read the DO for lifecycle and provider id. A stale KV `failed` write after later operator recovery must not make those surfaces report or act as failed.
- Do **not** attempt to close cross-store races with another read-before-KV-write check. Stale projections are harmless when consumers treat the DO as sole authority.

## AG-042 boundary correction

Missing/unreadable Workers KV is a **degraded projection**, never a gate that can suppress Durable Object lifecycle authority.

1. Terminal Printful webhooks resolve the logical session and update DO authority **before** requiring KV. A successful terminal transition survives missing KV and returns `projection_missing` / reconciliation-needed (not `ignored`).
2. If authority lacks a provider id, the webhook provider id is captured atomically in `mark_terminal_failed`. Provider-id conflicts fail closed (`provider_id_conflict`).
3. Status reads DO first. Authority without KV returns a degraded reconciliation-needed payload (HTTP 200), not 404. Only uninitialized/neither-store is not-found.
4. Retry reads DO first. Authority without KV returns `reconciliation_required` and **never** resubmits to Printful.
5. When KV exists, DO lifecycle/provider identity is projected over it (including bound+pending → sent).
