# Print Operations Runbook

This runbook is for controlled StarMapCo print rollout and incident handling.

## Required env vars

- `PRINT_ADMIN_TOKEN`
- `STRIPE_SECRET_KEY`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_STORE_ID`
- `PRINTFUL_VARIANT_ID_POSTER_UNFRAMED`
- `PRINTFUL_VARIANT_ID_POSTER_FRAMED`

## Core commands

```bash
# Baseline readiness
npm run check:env
npm run qa:go-no-go
npm run qa:printful

# Release safety
npm run qa:release-gate
npm run qa:smoke

# Day-to-day targeted smoke (faster)
npm run qa:smoke:ui
npm run qa:smoke:render
npm run qa:smoke:commerce

# Live sanity
npm run qa:live-smoke
npm run qa:sitemap-health -- --sitemap https://starmapco.com/sitemap.xml --concurrency 8 --timeout-ms 15000

# Print order visibility (Stripe sessions + KV status)
npm run qa:print-ops -- --hours 168 --limit 40

# Refresh proof images from recent Printful test orders
npm run assets:printproof
```

`assets:printproof` updates `public/printproof/framed-latest.png` (and unframed if available) plus
`public/printproof/manifest.json`. The homepage proof section will use the framed proof image when present.

## Staged rollout

### Stage A: UI on, submission off

- `PRINT_CHECKOUT_ENABLED=true`
- `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=true`
- `PRINT_ORDER_SUBMISSION_ENABLED=false`

Goal: verify customer can select print options and reach checkout safely without fulfillment firing.

### Stage B: Internal fulfillment tests

- Keep real Stripe/Printful config
- Enable submission:
  - `PRINT_ORDER_SUBMISSION_ENABLED=true`

Run internal matrix:

1. Unframed print success
2. Framed print success
3. Forced failure (temporary bad Printful token)
4. Retry failed order via `/api/print/orders/retry`

Expected:

- Success orders -> KV status `sent`
- Failed order -> KV status `failed` + error
- Retry -> transitions failed order to `sent` without duplicate

### Stage C: Soft live

- Keep all print flags enabled
- No broad announcement for first 5-10 orders
- Monitor daily with `npm run qa:print-ops`

## Admin endpoints (token required)

- `GET /api/print/orders/status?session_id=...`
- `POST /api/print/orders/retry` with JSON body:
  - `{ "sessionId": "cs_live_..." }`

Headers:

- `x-print-admin-token: <PRINT_ADMIN_TOKEN>`
  or
- `Authorization: Bearer <PRINT_ADMIN_TOKEN>`

## Incident handling

### If order is paid but not fulfilled

1. Run:
   - `npm run qa:print-ops -- --hours 72 --limit 100`
2. Locate session status.
3. If `failed`, capture error and retry via admin endpoint.
4. Confirm new status is `sent`.
5. If still failing, disable `PRINT_ORDER_SUBMISSION_ENABLED` to stop further auto submissions and investigate Printful credentials/variant IDs.

### If unexpected order spikes happen

1. Set:
   - `PRINT_CHECKOUT_ENABLED=false`
   - `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=false`
2. Redeploy.
3. Existing paid orders remain traceable in KV and can be handled manually.
