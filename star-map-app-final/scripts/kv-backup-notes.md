# Manual KV backup (C18)

Cross-module overview (covered/excluded keyspaces, evidence rule, DO pending
slices): `docs/backup-export.md`.

From `star-map-app-final/`, run `node scripts/export-kv-backup.mjs` with the existing
`CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL` environment variables supplied securely.
Do not put credentials in command arguments. The account and STAR_MAP_KV namespace
are pinned to the existing wrangler binding; no config is changed. The script uses
only Cloudflare API GET list/value requests. It does not import application code.

Alternatively, manually dispatch **Manual KV data backup** on a reviewed trusted
ref. There is no schedule. This task does not dispatch it or access live data.
The workflow uses only Node built-ins, runs fixture tests before exposing secrets
to the export step, and uploads only after successful export. A failure requires
investigation and a new manual run; it must not be treated as a backup.

`kv-backups/kv-<UTC timestamp>/` contains `records.jsonl` and `manifest.json`.
Each JSONL line has the exact key, base64-encoded raw value bytes, and any listed
metadata/absolute expiration. Missing expiration stays missing: the exporter
introduces no entitlement expiry. The manifest hashes the exact JSONL file bytes
with SHA-256 and counts records by fixed prefix. Logs contain only count/hash or
a fixed failure message. Partial exports are removed and never marked complete.
Files are created with owner-only local permissions; the directory is gitignored.

The covered prefixes are `stripe:` (including grants, settlement/revocation and
indexes), `claim:`, `entitlement:` (including KV projections), and `print:order:`.
This is not a whole-application disaster recovery backup: Durable Object authority
journals/state, R2 archives/assets, map recipes and unrelated KV keyspaces are
excluded. Current source uses Durable Objects as accounting/fulfillment authorities;
KV projections alone cannot restore those authorities. KV enumeration is eventually
consistent and non-atomic. Changes made during a run may be absent or inconsistent.
A listed key disappearing before its read fails the export rather than being skipped.

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
Durable Object/R2 state require separate recovery plans and owner authorization.
There is intentionally no importer or KV mutation path in this tool.
