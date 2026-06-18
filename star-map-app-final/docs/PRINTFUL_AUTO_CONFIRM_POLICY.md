# Printful auto-confirm policy (Tier 1.6)

**Production default (2026-06):** `PRINTFUL_AUTO_CONFIRM=true` in `wrangler.toml`

## When auto-confirm is ON

- Paid print orders submit to Printful and move toward production without a manual draft step in the Printful dashboard.
- Customer-facing copy uses `getPrintProductionReviewDisclosure()` — **not** “manual review” language.
- Post-submit file checks and failure webhooks still alert ops (`printFulfillmentPostSubmit.ts`, `order_failed`, etc.).

## When to set auto-confirm OFF

- New SKU launch (canvas, mug, magnets) until one paid proof order passes.
- Suspected asset regression or margin guard bypass investigation.
- Operator wants every order held as Printful draft during a promo test.

```toml
PRINTFUL_AUTO_CONFIRM = "false"
NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM = "false"
```

Redeploy after change. Confirmation emails and trust panels pick up the manual-review copy automatically.

## Volume gate

| Signal | Action |
|--------|--------|
| First 10 prod print orders without fulfillment failures | Keep auto-confirm ON |
| `order_failed` or post-submit file alert | Pause ads; consider OFF until root cause fixed |
| New country or SKU | One test order with OFF, then ON |

## Verify

```powershell
cd star-map-app-final
npm run qa:print-margin
npm run qa:live-critical
```

Operator reference: `docs/operator-quick-reference.md`, `docs/print-ops-runbook.md`.
