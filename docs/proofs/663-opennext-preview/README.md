# OpenNext / Cloudflare local preview evidence — PR #663

Draft-only validation for `chore/next-16-4-6-security` at `0dc19edd`. No deploy, no Worker upload, no `--remote`, no production credentials.

## What ran

1. Prior local `opennextjs-cloudflare build` (Next.js 16.4.6, `@opennextjs/cloudflare` 1.20.15).
2. `npx opennextjs-cloudflare preview --remote=false` → Wrangler on `http://127.0.0.1:8787` with bindings Mode **local**.
3. Playwright smoke: `star-map-app-final/scripts/opennext-preview-smoke.mjs`.

Machine-readable summary: [`report.json`](./report.json).

## Browser results

| Path | HTTP | Notes |
| --- | --- | --- |
| `/` | 200 | Marketing title/body rendered |
| `/about` | 200 | About StarMapCo |
| `/editor` | 200 | Editor create-flow copy visible |
| `/editor?force=desktop` | 200 | same |

Saved-map hydration (synthetic Paris payload):

- `POST /api/maps` → 200, synthetic id recorded in `report.json`
- `/editor?map_id=…&source=map-hub&mode=quick` → canvas visible
- `star-map-checkout-id` matched map id; draft contained Paris + “Our Paris Night”
- Console errors: 0; page errors: 0

Screenshots: `_.png` (home), `_about.png`, `_editor.png`, `_editor_force_desktop.png`, `editor-map-id-hydration.png`.

## Durable Object warnings (classified)

Local preview emitted two related warning families. Neither blocked the map/KV path exercised above.

### 1. Wrangler “internal Durable Objects” warning

Wrangler listed these same-worker DO bindings and stated they **will not work in local development** unless defined in a separate Worker / config for local DO dev:

| Binding | Class |
| --- | --- |
| `PRINT_ORDER_AUTHORITY` | `PrintOrderAuthorityDO` |
| `REVIEW_REQUEST_LEDGER` | `ReviewRequestLedgerDO` |
| `ENTITLEMENT_AUTHORITY` | `EntitlementAuthorityDO` |
| `REVIEW_REQUEST_SUPPRESSION` | `ReviewRequestSuppressionDO` |
| `REFERRAL_DISCOVERY` | `ReferralDiscoveryDO` |
| `CONSISTENCY_COORDINATOR` | `ConsistencyCoordinatorDO` |
| `GIFT_CERTIFICATE_GRANT` | `GiftCertificateGrantDO` |

**Classification:** local-dev tooling limitation for in-worker DOs, not a Next 16.4.6 application regression. Production custom entry `cloudflare-worker.ts` still exports these classes (via Sentry DO instrumentation). This preview did **not** call print/entitlement/referral DO paths.

### 2. workerd “class not exported” messages

For each class above, workerd also logged that the DurableObjectNamespace referenced a class that is not exported from the preview worker, and that attempts to call that DO would fail at runtime (historically not a startup-time error).

**Classification:** preview-bundle / local export-detection mismatch relative to the source exports in `cloudflare-worker.ts`. Treat as the same local-preview DO gap as (1). Unproven for production deploy; out of scope for this sanitized evidence packet. Map create + `map_id` hydration used KV/API paths that succeeded without those DOs.

## WSL note

Ubuntu-26.04 WSL was available. Node was not successfully installed for a WSL preview in that session (`sudo apt` timed out; nvm repo cloned under the WSL user home but no Node version landed). Runtime evidence above is from the Windows local preview path. OpenNext warns WSL is preferred; this packet does not claim a WSL workerd run.
