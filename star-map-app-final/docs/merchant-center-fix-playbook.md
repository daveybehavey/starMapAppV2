# Merchant Center Fix Playbook

Use this whenever Google Merchant Center shows `Limited`, `Not approved`, or shipping currency mismatches.

## 1) Refresh local feed artifacts

From `star-map-app-final/`:

```bash
npm run assets:commerce-refresh:with-proof
npm run merchant:shipping-reference
npm run merchant:shipping-groups
# one-shot local readiness run
npm run qa:merchant-readiness
```

Outputs:

- `public/merchant-feed.xml`
- `docs/merchant-shipping-reference.csv`
- `docs/merchant-shipping-groups.md`
- `public/printproof/framed-latest.png` (if recent framed order exists)

## 2) Verify feed source in Merchant Center

In Merchant Center:

1. Go to **Products > Data sources**
2. Open your feed source (URL feed)
3. Feed URL should be:
   - `https://starmapco.com/merchant-feed.xml`
4. Trigger **Fetch now**

## 3) Fix shipping configuration (most common blocker)

The feed publishes prices in **USD**, so shipping services in Merchant Center must also be USD for matching countries.

1. Go to **Products & store > Shipping and returns**
2. Create/update one shipping service for `shipping_label=print`:
   - Currency: `USD`
   - Countries: use `docs/merchant-shipping-reference.csv` list
   - Add rates per country (or grouped regions) from CSV/`docs/merchant-shipping-groups.md`
3. Create/update one shipping service for `shipping_label=digital`:
   - Currency: `USD`
   - Countries: same as feed countries
   - Flat shipping: `0.00 USD`

## 4) Countries and exclusions

- Feed includes all supported countries from `data/printful-shipping.json`
- Feed excludes restricted countries via env:
  - `MERCHANT_FEED_EXCLUDED_COUNTRIES=KR`
- Feed also hard-excludes `KR` in code as a guardrail because Google Merchant currently flags unsupported currency there for this catalog.
- If you need to override:
  - `MERCHANT_FEED_COUNTRIES=US,CA,...`

## 5) Why Search Console may still show fewer products

Search Console **Merchant listings** is downstream reporting and can lag Merchant Center by 24–72 hours.

Source of truth for approval/debugging is Merchant Center diagnostics.

## 6) Safe deploy checklist

Before deploying feed updates:

```bash
npm run assets:commerce-refresh
npm run qa:merchant-feed -- --file public/merchant-feed.xml
```

After deploying:

1. Re-fetch feed in Merchant Center
2. Wait for diagnostics refresh
3. Re-check **Needs attention** tab and resolve remaining account-level policy issues
4. Verify live feed health:

```bash
npm run qa:merchant-feed:live
```
