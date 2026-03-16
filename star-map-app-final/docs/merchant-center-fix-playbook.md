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

Current feed policy:

- For Merchant Center review, keep the feed focused on the two physical print products.
- The digital download SKU is intentionally excluded by default with `MERCHANT_FEED_INCLUDE_DIGITAL=false` until the account is stable.

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
2. Create/update shipping services for:
   - `shipping_label=print_framed`
   - `shipping_label=print_unframed`
   - Currency: `USD`
   - Countries: use `docs/merchant-shipping-reference.csv` list
   - Add rates per country (or grouped regions) from CSV/`docs/merchant-shipping-groups.md`
3. Only create/update a shipping service for `shipping_label=digital` if you intentionally turn the digital SKU back on in the feed.
   - Currency: `USD`
   - Countries: same as feed countries
   - Flat shipping: `0.00 USD`

## 4) Countries and exclusions

- Checkout can include all supported countries from `data/printful-shipping.json`
- Feed excludes restricted countries via env:
  - `MERCHANT_FEED_EXCLUDED_COUNTRIES=KR`
- Feed also hard-excludes `KR` in code as a guardrail because Google Merchant currently flags unsupported currency there for this catalog.
- Current review-safe feed targeting:
  - `MERCHANT_FEED_COUNTRIES=US,CA,GB,IE,AU,NZ`
- If you later need to widen it:
  - `MERCHANT_FEED_COUNTRIES=US,CA,...`

If you keep a broad country set live in Merchant Center:

1. Every targeted country must be covered by the `print` shipping service.
2. Shipping rates and delivery expectations should match:
   - `public/merchant-feed.xml`
   - `docs/merchant-shipping-reference.csv`
   - `docs/merchant-shipping-groups.md`
   - `https://starmapco.com/shipping`
3. Broad international targeting with one English site/feed is possible, but it is higher review risk than an
   English-core country set. If review fails again, trim countries before making random site changes.

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

## 7) Merchant API automation

If you want terminal-driven shipping setup instead of manual GMC editing:

```bash
npm run merchant:api:verify
npm run merchant:shipping:plan
npm run merchant:shipping:get
npm run merchant:shipping:preview
npm run merchant:shipping:apply -- --replace-all-services
```

Required env:

- `GOOGLE_MERCHANT_ACCOUNT_ID`
- `GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`
