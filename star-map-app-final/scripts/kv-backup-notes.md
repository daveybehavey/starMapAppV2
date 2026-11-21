# Manual KV (+ slice-2 Durable Object) backup (C18 / backup slice 2)

From `star-map-app-final/`, run `node scripts/export-kv-backup.mjs` with the existing
`CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL` environment variables supplied securely.
Do not put credentials in command arguments. The account and STAR_MAP_KV namespace
are pinned to the existing wrangler binding; no config is changed. The script uses
only Cloudflare API GET list/value requests for KV. It does not import application
business logic for KV reads.

To also dump GiftCertificateGrantDO and PrintOrderAuthorityDO authority rows in the
same snapshot, supply `STARMAP_DO_BACKUP_BASE_URL` (site origin hosting
`/api/ops/durable-objects/export`) and `PRINT_ADMIN_TOKEN`. The runner then:

1. Censuses those two Durable Object classes via the Workers API (namespaces +
   objects list; empty namespaces are recorded as zero instances).
2. Calls the authenticated, fail-closed ops export endpoint once per instance
   (`exportState()` RPC; read-only).
3. Writes per-class JSONL under `durable-objects/` with the same `.partial`
   staging + rename discipline and 0700/0600 permissions as the KV exporter.
4. Records per-class instance counts + SHA-256 in the manifest, plus a
   PrintOrderAuthority census-vs-KV `print:order:` reconciliation finding
   (divergence is a finding, not an export failure).

Without the ops credentials, the run stays KV-only and the manifest notes that
the Durable Object dump was skipped.

Alternatively, manually dispatch **Manual KV data backup** on a reviewed trusted
ref. There is no schedule. This task does not dispatch it or access live data.
The workflow uses only Node built-ins, runs fixture tests before exposing secrets
to the export step, and uploads only after successful export. A failure requires
investigation and a new manual run; it must not be treated as a backup.

`kv-backups/kv-<UTC timestamp>/` contains `records.jsonl`, `manifest.json`, and
(when DO dump credentials are present) `durable-objects/*.jsonl`. Each KV JSONL
line has the exact key, base64-encoded raw value bytes, and any listed
metadata/absolute expiration. Each DO JSONL line has class, instance id,
captured-at, and the state row. Missing KV expiration stays missing: the exporter
introduces no entitlement expiry. The manifest hashes the exact JSONL file bytes
with SHA-256 and counts records by fixed prefix / DO class. Logs contain only
count/hash or a fixed failure message. Partial exports are removed and never
marked complete. Files are created with owner-only local permissions; the
directory is gitignored.

The covered KV prefixes are `stripe:` (including grants, settlement/revocation and
indexes), `claim:`, `entitlement:` (including KV projections), and `print:order:`.
Covered DO classes in this slice: GiftCertificateGrantDO and PrintOrderAuthorityDO.
Other Durable Object classes, R2 archives/assets, map recipes and unrelated KV
keyspaces remain excluded. Gift-certificate population may be zero while
certificates stay dark — a zero-instance census is a correct result. KV
enumeration is eventually consistent and non-atomic. DO census and per-instance
`exportState` reads are point-in-time. Changes made during a run may be absent or
inconsistent. A listed KV key disappearing before its read fails the export
rather than being skipped.

Artifacts contain customer data and credentials even though manifests/logs do not.
Restrict access under the repository's artifact access controls. They expire after
seven days; the owner must download them to access-controlled durable backup storage
before expiry and validate the manifest checksum. This workflow alone is not a
permanent backup service. Never commit, paste, or publish snapshot contents.

## Restore planning (manual, separately authorized)

Verify SHA-256 over `records.jsonl` and validate total/per-prefix counts first.
After owner approval and confirming the correct replacement namespace, read each
line privately, decode `valueBase64`, and PUT that byte sequence to the Cloudflare
KV value endpoint for the URL-encoded `key`, preserving `metadata` and absolute
`expiration` where present. Omit expiration for non-expiring records; skip and
report already-expired records rather than resurrecting them. Restore into an
empty namespace to avoid overwriting newer data, then verify counts and byte hashes
by reading back. Do not log raw keys/values. Rebinding production and rebuilding
Durable Object/R2 state require separate recovery plans and owner authorization —
there is intentionally no DO restore importer in this tool.
