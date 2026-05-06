# Global Pricing and Margin Policy

Updated: 2026-05-06

## Current operating defaults

- Print checkout is globally available from the editor flow.
- Shipping is country-based (`PRINT_DYNAMIC_SHIPPING=true`) using `data/printful-shipping.json`.
- Print margin guard is enabled:
  - `PRINT_MARGIN_GUARD_ENABLED=true`
  - `PRINT_MIN_MARGIN_CENTS=1000` (~\$10 minimum estimated profit; source of truth: `wrangler.toml` `[vars]`)
  - Stripe cost assumptions: `2.9% + 30c`
- Merchant feed targeting is controlled separately from checkout targeting:
  - `MERCHANT_FEED_COUNTRIES` (optional explicit include list)
  - `MERCHANT_FEED_EXCLUDED_COUNTRIES=KR` (default restricted exclusion)
  - `MERCHANT_FEED_INCLUDE_RESTRICTED=false`

## Why checkout countries and Merchant countries are split

Checkout and fulfillment can support more countries than Google Merchant can approve in one pass due to local business or currency requirements.  
We intentionally keep checkout broad and merchant targeting filtered.

## Digital geo-pricing (staged)

Geo-priced digital single-map checkout is wired but disabled by default:

- `GEO_DIGITAL_SINGLE_PRICING_ENABLED=false`
- `GEO_DIGITAL_SINGLE_MIN_CENTS=300`
- `GEO_DIGITAL_SINGLE_PRICING_JSON` includes a conservative starter map

Enable only after a 14-day baseline comparison of:

- single-map conversion rate by country
- average order value by country
- refund/dispute rate by country

## Weekly operating checks

1. `npm run qa:print-margin`
2. `npm run qa:print-ops -- --hours 168 --limit 40`
3. `npm run qa:funnel-reconcile -- --days 14`
4. `npm run qa:merchant-feed -- --file public/merchant-feed.xml`

## Expansion rule

Add countries in this order:

1. Checkout countries (if Printful supports shipping and margin stays above threshold)
2. Merchant countries (only after local GMC diagnostics are clean for that region)
