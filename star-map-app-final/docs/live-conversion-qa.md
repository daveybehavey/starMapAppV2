# Live Conversion QA

Runs a full live funnel check:

1. Homepage form -> editor
2. Editor -> paywall -> Stripe Checkout
3. Applies temporary one-time 100% promo code
4. Completes checkout
5. Verifies success -> download redirect
6. Checks `/api/stripe/verify`
7. Checks Stripe webhook endpoint + latest `checkout.session.completed` delivery state

## Run

```bash
npm run qa:live-conversion
```

Use a fixed existing promo code (recommended for stable live runs):

```bash
npm run qa:live-conversion -- --promo-code YOUR_LIVE_QA_CODE
```

You can also set `QA_PROMO_CODE` in `.env.local` to avoid passing it each run.

Optional:

```bash
npm run qa:live-conversion -- --headed
```

Output report:

- `reports/live-conversion-qa.json`
