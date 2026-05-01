# Merchant Center + Ads launch checklist (StarMapCo)

This repo can generate a Merchant feed and sync shipping services via the Google Merchant API. This checklist is the fastest path to “green” Merchant Center + Shopping ads readiness without guessing.

## 1) Feed health (repo-controlled)

- Generate the feed:

```bash
cd star-map-app-final
node scripts/generate-merchant-feed.mjs
```

- Validate the feed locally:

```bash
node scripts/merchant-feed-health.mjs --file public/merchant-feed.xml
```

- Validate the live feed (after deploy):

```bash
node scripts/merchant-feed-health.mjs --feed https://starmapco.com/merchant-feed.xml
```

## 2) Shipping services match the feed (label-based)

Your feed uses:

- `shipping_label=print_unframed`
- `shipping_label=print_framed`

Merchant Center shipping services should apply using **shipping labels**, not “specific products”, to avoid coverage gaps and Store Quality “Incomplete” states.

- Apply managed shipping services (Merchant API):

```bash
node scripts/merchant-shipping-sync.mjs --apply --replace-all-services
```

- Verify coverage (fails if any country/label is missing):

```bash
node scripts/merchant-shipping-verify.mjs --country CA
```

If you get a missing credentials error, set `GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH` to a valid file on this machine.

## 3) Returns policy facts (Merchant Center UI)

StarMapCo policy (`/returns`) is custom-order:

- Change-of-mind print returns: not accepted after production starts
- Damage/defect claims: contact within 7 days

In Merchant Center “Return cost”, choose a setting consistent with this (usually **customer-paid** / not “free returns”).

## 4) eWallet (Store Quality) reality

Stripe wallets can be fully enabled and still take time for Merchant Center to reflect. Google’s Store Quality program may take **up to ~30 days** after StoreBot observes wallets on a guest-checkout flow.

To prove Stripe wallet configuration:

```bash
npm run qa:stripe-payment-methods -- --json
```

## 5) One command summary (copy/paste safe)

```bash
npm run merchant:store-quality:facts
```

Prints the exact “facts and numbers” we publish/recommend (handling time, return-cost semantics, countries, shipping labels).

