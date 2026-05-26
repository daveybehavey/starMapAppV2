# Print Launch Go/No-Go Checklist

This is the production launch checklist for StarMapCo physical prints.

## Feature Flags

- `PRINT_CHECKOUT_ENABLED`: enables print checkout on the server.
- `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED`: shows print checkout UI.
- `PRINT_ORDER_SUBMISSION_ENABLED`: submits paid print orders to fulfillment.
- `PRINT_DYNAMIC_SHIPPING`: when true, checkout uses country-level shipping estimates instead of fixed Stripe shipping rate.

These flags should be aligned before launch.

## Safe Modes

### 1) Fully Off (default-safe)

- `PRINT_CHECKOUT_ENABLED=false`
- `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=false`
- `PRINT_ORDER_SUBMISSION_ENABLED=false`

Result: customers cannot start print checkout.

### 2) Test Mode (Stripe test only)

- Stripe keys/prices are test mode.
- `PRINT_CHECKOUT_ENABLED=true`
- `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=true`
- `PRINT_ORDER_SUBMISSION_ENABLED=true`
- Printful test setup verified.

Result: end-to-end test possible without live customer charges.

### 3) Live Mode (real launch)

- Live Stripe keys/prices in place.
- `PRINT_CHECKOUT_ENABLED=true`
- `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=true`
- `PRINT_ORDER_SUBMISSION_ENABLED=true`
- Fulfillment path configured:
  - Printful token + store + variant IDs, or
  - `PRINT_FULFILLMENT_WEBHOOK_URL`

Result: customers can buy prints and paid orders are fulfilled automatically.

## Required Pre-Launch Checks

Run:

```bash
npm run check:env
npm run qa:printful
npm run lint
npx tsc --noEmit
npm run qa:smoke
npm run qa:print-ops -- --hours 336 --limit 50
```

Expect:

- `check:env` has no errors.
- `qa:printful` validates store and variant IDs.
- lint and typecheck pass.
- smoke suite passes (editor/export/payment regression checks).
- print ops report runs and is readable by the operator.

## Smoke Tests (Before Go-Live)

1. Open editor and verify print options appear only when flags are enabled.
2. Complete test checkout for:
   - unframed print
   - framed print
   - print + digital add-on
3. Confirm webhook writes:
   - `stripe:session:<sessionId>`
   - `print:order:<sessionId>`
4. Confirm print order status becomes `sent` (or expected status in test flow).
5. Confirm digital entitlement behavior is correct for print + digital add-on.
6. Run `npm run qa:live-smoke` after deploy to verify production metadata/footer/API sanity.
7. Run `npm run qa:print-ops -- --hours 72 --limit 50` to verify print order status visibility.
8. **Customer shipping email:** `GET /api/printful/webhook?token=<PRINTFUL_WEBHOOK_SECRET>` returns `{"ok":true,"status":"ready"}`. Printful `package_shipped` webhook must point at that URL. Requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (domain verified). Manual backfill: `POST /api/print/orders/notify-shipping` (admin auth).

## No-Go Conditions

Do not launch live print checkout if any are true:

- `PRINT_CHECKOUT_ENABLED` and `NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED` mismatch.
- `PRINT_ORDER_SUBMISSION_ENABLED=true` but no fulfillment channel is configured.
- `qa:printful` fails.
- Stripe webhook not receiving `checkout.session.completed`.
- Shipping details validation fails on test checkout.
