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

## 8) `merchant:products:status` — read the traffic lights

Run from `star-map-app-final/` (needs Merchant API credentials like `merchant:api:verify`):

```bash
npm run merchant:products:status
npm run merchant:products:status -- --json
```

Writes `reports/merchant-products-status.json`.

The script prints `[PASS]`, `[WARN]`, `[FAIL]`, and `[INFO]`. Treat them as **green / yellow / red / neutral context**:

| Prefix | Color | Meaning |
| --- | --- | --- |
| `PASS` | Green | Requirement met for that line. |
| `WARN` | Yellow | Not ideal or still in transition; read the detail before ignoring. |
| `FAIL` | Red | Blocking for a “clean” Merchant Center; fix or escalate before promos depend on it. |
| `INFO` | — | Numbers, account id, or extra context; not a pass/fail by itself. |

**Exit code:** `0` only when there are **no `FAIL` lines**. Any `FAIL` makes the command exit `1` even if some lines are green.

### What each check means and what to do next

**`Program state: free-listings` / `Program state: shopping-ads`**

- **PASS** — State is `ENABLED`: the program is on for this account.
- **WARN** — State is `ELIGIBLE`: Google considers the account eligible but the program is not fully enabled yet. In Merchant Center, open the program and complete enablement, or wait if a review is in flight. Re-run after changes.
- **FAIL** — Program missing from the API response, or state is neither `ENABLED` nor `ELIGIBLE`. Open Merchant Center → Growth / programs (or equivalent) and finish onboarding or resolve account-level issues.

**`Program unmet requirements: …` (INFO)**

- Lists Google’s requirement titles. Use them as the checklist in the Merchant Center UI for that program (policy, billing, region, etc.). Not a colored status by itself.

**`Offer present in standard listings: print_poster_unframed` / `… framed`**

- **PASS** — At least one standard (non-local) product record exists for that offer id.
- **FAIL** — No standard record: confirm the live feed is fetched (`Products > Data sources` → fetch), `https://starmapco.com/merchant-feed.xml` includes the SKU, and recent deploys are live. Use sections 1–4 of this playbook.

**`Offer present in local listings: …`**

- **PASS** — Local record present (if you use local surfaces).
- **WARN** — No local record: often acceptable when standard listings and approvals are green; investigate only if you rely on local inventory or GMC calls it out.

**`… approved countries for FREE_LISTINGS` / `… for SHOPPING_ADS`**

- **PASS** — Every **target** country (from feed/shipping config the script uses) appears in that program’s approved countries for the offer.
- **FAIL** — One or more target countries missing: align **shipping services**, **shipping labels** (`print_framed` / `print_unframed`), and **feed** country lists with `docs/merchant-shipping-reference.csv` / `docs/merchant-shipping-groups.md`, then re-fetch the feed and re-check diagnostics.

**Summary line**

- If it says the account has both print offers present and approved in target countries, and nothing is `FAIL`, you are in good shape for routine checks.
- If it says to fix failed checks first, work through each **`FAIL`** line top to bottom before treating Merchant Center as ready for dependent work (for example promotions).
