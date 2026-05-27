# Purchase funnel audit (2026-05-26)

## P0 — blocks revenue or access after paid

| Issue | Status | Notes |
| --- | --- | --- |
| Download shows "Confirm access first" after success redirect (cookie/verify race) | Fixed | Trust `paidRef` after `/api/stripe/verify`; pass `session_id` on redirect; poll recovery when pending |
| QA discounted checkout used `qa-live-conversion` as fake `map_id` | Fixed | QA reads real `star-map-checkout-id`; metadata includes `credits: 1` |
| Stripe Checkout URL missing `#fid` fragment | Fixed (95bf8fd) | `isValidStripeCheckoutUrl` + HTML handoff on GET checkout |

## P1 — bad UX / confusion

| Issue | Status | Notes |
| --- | --- | --- |
| Flashing success → not-paid → download | Mitigated | Faster redirect (1.2s); download avoids false not-paid when verify succeeded |
| Print promo auto-apply rejected (`discountRejected`) | Mitigated | API retries without discount; client explains manual entry on Stripe |
| Long undifferentiated "Opening secure checkout…" on print | Mitigated | "Preparing your print file…" phase before API handoff |
| Success redirect without `session_id` | Fixed | `buildDownloadPath` includes session + valid map UUID only |

## P2 — tech debt / QA footguns

| Issue | Status | Notes |
| --- | --- | --- |
| `client_reference_id` non-UUID treated as map | Fixed | `resolveCheckoutMapIdFromStripeSession` |
| Live QA placeholder map ids | Fixed | `readCheckoutMapId` + discounted session metadata |
| Entitlement verify polling vs premium cookie | Improved | Shared `stripeVerifyClient`; download re-init on recovery (multi-round poll when `session_id` on `/download`) |
| `begin_checkout` fired after Stripe URL returned (download/success print) | Fixed | `trackBeginCheckout` before `/api/checkout` handoff |
| POST `/api/checkout` could return URL without `#fid` fragment | Fixed | Reject with `invalid_checkout_url` before JSON response |

## Analytics (2026-05-26)

See **`docs/PURCHASE_ANALYTICS.md`** for GA4 / PostHog / QA exclusion / attribution.

| Issue | Status | Notes |
| --- | --- | --- |
| QA live conversion counted in GA4 / funnel | Fixed | `isQaStripeSession` skips MP, `payment_verified`, client purchase |
| PostHog missing `revenue` / `transaction_id` on purchase | Fixed | `purchase` event on success with revenue props |
| `begin_checkout` GA4-only (no PostHog) | Fixed | `trackBeginCheckout` also sends `checkout_started` |
| UTM cookie only on referral checkouts | Fixed | `marketing_*` metadata on all Stripe sessions |
| GA4 MP wrong item for mug/canvas print | Fixed | Aligned print variant catalog with client analytics |

## Retest

1. Editor → HD single → $0 promo checkout → success → download (unlocked, draft or saved map).
2. Print upsell from download with promo: checkout opens; if auto-apply fails, message + manual code on Stripe.
3. GA4 Realtime `purchase` on paid test; PostHog `purchase` with `transaction_id`; `npm run qa:live-conversion` does **not** spike production purchases.
