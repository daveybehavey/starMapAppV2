# Entitlement authority (DL-1)

**Verified against source on `main` at Phase 4 head.** This document describes behaviour as implemented in code. Where older docs disagree, **code wins**; disagreements are listed at the end.

## Modules

| Path | Role |
| --- | --- |
| `src/lib/entitlementAuthorityState.ts` | Pure ledger state machine (journal, folds, validity, ops, projection). Sole place accounting decisions are computed. |
| `src/lib/entitlementAuthority.ts` | DO client + best-effort KV projection republish. Fail-closed (`null`) when production has no DO binding. |
| `src/durable-objects/EntitlementAuthorityDO.ts` | Thin SQLite DO host: one instance per Stripe checkout `sessionId`; read → apply pure op → upsert JSON row. |
| `src/lib/entitlementMigration.ts` | Legacy KV → baseline/fence bridge into the authority. |
| `src/lib/entitlementsStore.ts` | Shared KV shapes, claim/access helpers, session record I/O — **not** the accounting authority under DL-1. |
| `src/lib/giftCertificates.ts` | Certificate code mint/redeem; grants an ordinary entitlement on successful redeem. |

Editor canvas **ANCHOR** semantics (a stored text position is an alignment anchor; `drawText` uses `ctx.textAlign = box.align`) are unrelated to entitlement accounting. Download/ops tooling must not reinterpret map recipe positions.

## Authority boundary

- **Authoritative:** Durable Object state for that `sessionId`, mutated only through `applyEntitlementAuthorityOp`.
- **Non-authoritative:** KV projection at `entitlement:projection:{sessionId}` (`ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY`). A failed or stale projection write never changes accounting.
- **Grant-side facts** (`plan` / `paid` / `revoked` / `subscriptionActive` / `mapId`) are **inputs** recorded via `sync_facts` from the Stripe session record. The authority does not invent grant state.

Production without a readable DO binding returns `null` from the client (fail closed). Local/unit use requires `STARMAP_ENTITLEMENT_AUTHORITY_LOCAL=1` (or development/test `NODE_ENV`); bare `CI=1` alone does **not** enable the in-memory fallback.

## Journal and `includedThroughSeq`

- State carries an optional `journalHead` (absent on pre-journal documents → treated as `0` via `journalHeadOf`).
- `buildEntitlementAuthorityProjection` sets:
  - `includedThroughSeq = journalHeadOf(state)`
  - `authorityStateVersion = journalHeadOf(state)` (diagnostics)
- **Watermark guarantee:** a projection image’s `includedThroughSeq` is the journal head at publish time. Verifiers may normalize only against journal identities **at or below** that watermark. An image without a verifiable watermark is refused (`projection_unwatermarked`); the verifier falls back to the creation snapshot (see comments on `EntitlementAuthorityProjection` in source).

Ops/backup surfaces that only hold KV projections **cannot** restore DO journals. On `main`, EntitlementAuthority has **no** `exportState` / ops export route yet — those land in open backup slice PRs (see `docs/backup-export.md`).

## DL-1 rules as implemented

### Paid downloads do not expire

- Entitlement **age expiry was rejected** (David, 2026-10-22). State carries **no** entitlement expiry timestamp.
- `evaluateEntitlementValidity` refuses on `no_facts` / `revoked` / `not_paid` / `subscription_inactive` only — **not** on age.
- Credentials (claim tokens, read capabilities) still expire and rotate; `capabilityGeneration` increments on `rotate_capability` so old capabilities die. Credential renewal does **not** extend an entitlement term.

### Revocation

- **Stripe session entitlements:** revocation is an affirmative fact (`facts.revoked` / session `revoked`), typically from refund/dispute paths, evaluated at access time via validity — not a TTL.
- **Gift certificates (`giftCertificates.ts`):** two clocks that must not be conflated:
  1. The **code** expires 12 calendar months after issuance (`giftCertificateExpiresAt`, UTC month-end clamp). An expired code cannot be redeemed.
  2. The **entitlement granted on redemption** has **no** expiry (same paid-download policy).
  - At redeem time, a certificate whose payment was revoked is rejected with `payment_revoked` **before** granting access — revocation is enforced at redemption, not as download TTL after grant.

## Op surface (high level)

`EntitlementAuthorityOp` includes (non-exhaustive; see the union in source): `sync_facts`, `capture_baseline`, `commit`, `compensate` / `compensate_debit`, `grant` / `purchase_grant` / `grant_reward` / `reverse_reward`, accounting lease acquire/seal/release, `rotate_capability`, `record_checkpoint`, `resolve_grant_inclusion`, Slice 4 publication register/finalize, archive email claim/record.

Reward-bucket invariant (R1-A): referral credits live apart from purchased allowance; clawbacks may remove only unspent reward-bucket credits — never purchased credits or owned files.

## What ops / backup may and may not do

| May | Must not |
| --- | --- |
| Read KV projections for display/support with watermark awareness | Treat KV projection as restorable authority |
| Apply ops only through the DO client / DO apply path | Patch `entitlement:projection:*` or legacy session accounting fields as if they were the ledger |
| Export KV prefixes listed in the KV backup tool | Assume DO journals are covered by KV backup on `main` |

## Code vs existing documentation (findings)

1. **`docs/post-purchase-access-architecture.md`** still recommends keeping **Stripe checkout session KV records as the entitlement ledger**. Under DL-1 as shipped, the **DO + `entitlementAuthorityState`** is the accounting authority; session KV is grant evidence / legacy bridge, and `entitlement:projection:*` is display-only. This README is the current ledger description; the architecture note remains useful for identity/magic-link direction but is **outdated on ledger authority**.
2. **`src/lib/entitlementsStore.ts`** type comment still says Stripe session entitlement is “source of truth for digital access.” Callers that need accounting must go through the authority; the store remains shared shapes and access helpers.
3. **Backup DO export** for EntitlementAuthority is **not on `main`** (open drafts #608/#609/#610). Do not document branch-only `exportState` as if it were production.
