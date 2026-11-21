# Backup / export (KV on `main`; DO slices pending)

**Verified against source on `main` at Phase 4 head.** Sibling draft PRs #608 / #609 / #610 add Durable Object census/export; those modules are **not** merged and are summarized only as pending — not as current behaviour.

## What exists on `main`

| Artifact | Role |
| --- | --- |
| `scripts/export-kv-backup.mjs` | Read-only Cloudflare KV export (GET list/value only) |
| `scripts/kv-backup-notes.md` | Operator notes: credentials, artifacts, restore planning |
| `.github/workflows/` Manual KV data backup | Manual dispatch on a reviewed trusted ref (no schedule); see notes |

There is **no** DO backup exporter script or ops export route for Durable Objects on `main`.

## KV keyspaces covered / excluded

**Covered prefixes** (`KEYSPACES` in `export-kv-backup.mjs`):

- `stripe:` (grants, settlement/revocation, indexes, …)
- `claim:`
- `entitlement:` (includes KV projections such as `entitlement:projection:*`)
- `print:order:`

**Deliberately excluded (non-exhaustive):** Durable Object authority journals/state, R2 archives/assets, map recipes (`map:`), account keyspaces, and other unrelated KV prefixes. Manifest `scope` text states: KV only; excludes DO authority state, R2 assets and map recipes.

This is **not** whole-application disaster recovery. Current product accounting/fulfillment authorities live in Durable Objects; KV projections alone cannot restore them.

## Census / export mechanism

1. Create owner-only directory mode **`0o700`** under `kv-backups/` (gitignored).
2. Stage into `kv-<UTC stamp>.partial` (exclusive mkdir — never overwrite a completed snapshot).
3. For each prefix: paginate keys, read each value, write JSONL lines `{ key, valueBase64, expiration?, metadata? }`.
4. File mode **`0o600`** for `records.jsonl` and `manifest.json`.
5. Manifest records per-prefix counts, total `recordCount`, and **SHA-256 of the exact JSONL file bytes**.
6. Atomic rename staging → `kv-<stamp>/` only on success; partial trees are deleted and never marked complete.
7. Process stdout on success: **counts and sha256 only** (`recordCount` + `snapshot.sha256`). Failures print a fixed failure message — no keys/values.

### Evidence rule

Logs and CI-facing evidence are **counts-and-hashes-only**. Artifacts themselves contain customer data and credentials even when manifests/logs do not — treat under artifact access controls; never commit, paste, or publish snapshot contents.

### Consistency limits (as coded)

- KV enumeration is eventually consistent and non-atomic.
- Concurrent changes during a run may be absent or inconsistent.
- A listed key that disappears before its value read **fails the export** (no skip).
- Missing expiration stays missing — the exporter introduces **no** entitlement expiry.

## Snapshot permission discipline (`0700` / `0600`)

As implemented in `exportSnapshot`:

- Backup root and staging directories: `mode: 0o700`
- `records.jsonl` / `manifest.json`: open with `0o600`

Operator notes restate this as “owner-only local permissions.”

## Pending sibling backup PRs (not on `main`)

Documented so agents do not mistake open branches for shipped behaviour:

| PR | Intended slice (from PR titles/files) | Not on `main` yet |
| --- | --- | --- |
| **#608** | Slice 1 — DO census + EntitlementAuthority export + KV keyspace widening | `scripts/export-do-backup.mjs`, EntitlementAuthority `exportState` / ops export route, KV exporter edits |
| **#610** | Slice 2 — GiftCertificateGrantDO + PrintOrderAuthorityDO export | `scripts/lib/durableObjectBackup.mjs`, `src/lib/durableObjectExport.ts`, DO export route |
| **#609** | Slice 3 — ReferralDiscovery + ConsistencyCoordinator + ReviewRequest ledger/suppression export | `src/lib/doBackupExport.ts`, multi-DO export route, further KV notes |

Those drafts diverge on the same `export-kv-backup.mjs` / notes files — merge order matters. Until merge, operators have **KV-only** automated backup as above.

## Entitlement projection watermark (ops awareness)

When inspecting `entitlement:projection:*` records from a KV snapshot, `includedThroughSeq` is the publisher’s journal watermark (`journalHeadOf` at publish time). It does **not** replace DO journal export. See `docs/entitlement-authority.md`.

## Code vs existing documentation

1. `scripts/kv-backup-notes.md` matches `export-kv-backup.mjs` on `main` for the four prefixes and permission/evidence rules — keep both in sync when slices merge.
2. Any doc claiming DO backup is already production-ready on `main` would be wrong until #608/#609/#610 land.
