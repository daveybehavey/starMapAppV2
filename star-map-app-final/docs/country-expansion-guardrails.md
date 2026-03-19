# Country Expansion Guardrails

Updated: 2026-03-19

## Objective

- Keep broad print-country coverage without reintroducing Merchant Center policy risk, negative-margin orders, or support overload.

## Hard Rules

- Source of truth for shippable countries: `data/printful-shipping.json`.
- Checkout allow-list must match `PRINT_ALLOWED_COUNTRIES` behavior in production.
- Merchant feed must exclude restricted countries by default:
  - `MERCHANT_FEED_INCLUDE_RESTRICTED=false`
  - `MERCHANT_FEED_EXCLUDED_COUNTRIES=KR` (minimum baseline)
- Never launch countries with missing shipping policy or unsupported checkout currency behavior.

## Required Checks Before Adding Countries

1. Shipping policy coverage in Google Merchant Center for every target country.
2. Margin audit passes with current payment-fee assumptions:
   - `PRINT_MARGIN_GUARD_ENABLED=true`
   - `PRINT_MIN_MARGIN_CENTS` unchanged or stricter
3. Live feed validation passes:
   - `npm run qa:merchant-feed`
   - `npm run qa:merchant-feed:live`
4. Country-specific shipping disclosure is visible and accurate on-site (`/shipping`).
5. Manual support readiness:
   - response windows
   - return/refund policy clarity
   - damaged-order replacement path

## Operational Cadence

- Weekly:
  - `npm run qa:print-margin`
  - `npm run qa:print-ops -- --hours 168 --limit 40`
  - `npm run qa:merchant-feed:live`
- Before any country-list change deploy:
  - `npm run qa:merchant-readiness`
  - `npm run qa:release-gate:live:smoke`

## Expansion Strategy

- Stage 1: English-priority countries (US, CA, GB, IE, AU, NZ).
- Stage 2: Additional high-demand countries with stable margin.
- Stage 3: Long-tail countries only if support load and margin stay within limits.

## Rollback Plan

- If diagnostics or margin regress:
  - remove affected countries from Merchant Center shipping settings
  - constrain checkout allow-list
  - regenerate and refetch merchant feed
  - rerun live merchant and print-ops checks
