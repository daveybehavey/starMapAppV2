# Upsell Rollout Policy

Use this policy before adding any new physical upsell SKU.

## Goal

Add SKUs that increase AOV without increasing support burden or margin risk.

## Hard launch gate

A candidate SKU must pass all of the following:

1. Margin target met in all scored launch countries.
   - Current default scoring markets: `US`, `CA`, `GB`.
2. Fit with the star-map gift flow is `high` or `medium`.
3. No variant-option blockers in Printful estimate-costs API for launch countries.
4. Checkout copy can explain the SKU in one sentence.
5. Damage/refund workflow is clear for that SKU type.

If any gate fails, do not launch globally.

## Action labels

- `launch_ready`
  - Margin target met in all scored countries.
  - High thematic fit.
  - No estimate blockers.
- `test_limited`
  - Margin target met, but medium fit.
  - Launch only to a limited cohort or in one funnel entry point.
- `reprice_before_launch`
  - Proposed price misses margin target in at least one scored country.
  - Reprice before launch.
- `bundle_only`
  - Keep as checkout add-on only, not standalone.
- `blocked`
  - Variant cannot be safely priced due to options/shipping/API errors.

## Pricing baseline

- Stripe fee model: use env values
  - `PRINT_MARGIN_STRIPE_PERCENT`
  - `PRINT_MARGIN_STRIPE_FIXED_CENTS`
- Use Printful estimate-costs API by market.
- Convert CAD estimates to USD using Bank of Canada FX feed.

## Command

Run this before every SKU rollout decision:

```bash
npm run qa:upsell-matrix
```

Optional:

```bash
npm run qa:upsell-matrix -- --countries US,CA,GB --json
```

## Operational rule

After launch, kill a new SKU quickly if:

- attach rate is weak, or
- margin underperforms target, or
- support/refund burden rises.
