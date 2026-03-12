# StarMapCo Operator Quick Reference

Use this page when you need to check sales, analytics, print ops, or coupons quickly.

## 1) Analytics and funnel

- **GA4 realtime**: `https://analytics.google.com/analytics/web/`
  - Property: `G-N4PPJ50JQ7`
  - Check `page_view`, `funnel_step`, and checkout-related events.
- **Quick local verification**:
  - `npm run qa:ga4-smoke`
  - `npm run qa:funnel-reconcile -- --days 14`

## 2) Stripe revenue and checkout

- **Stripe dashboard**: `https://dashboard.stripe.com/payments`
- **Print checkout sessions** (metadata includes `orderType=print`): `https://dashboard.stripe.com/checkout/sessions`
- **Promo codes**: `https://dashboard.stripe.com/coupons`
- **Two-sided referral offer controls**:
  - `STRIPE_REFERRAL_PROMO_CODE_ID` = promo code auto-applied for referred buyers
  - `REFERRAL_REWARD_CREDITS` = HD credits granted to the referrer per qualified conversion
  - For "free HD for both sides":
    - Set `STRIPE_REFERRAL_PROMO_CODE_ID` to a 100% single-HD promo in Stripe
    - Keep `REFERRAL_REWARD_CREDITS=1`

### Update the signup promo code safely

1. Set env in shell (example):
   - `export PROMOTION_COUPON_CODE=FIRST50`
   - `export PROMOTION_COUPON_PERCENT=50`
2. Run:
   - `npm run promo:setup`
3. Confirm `.env.local` has updated:
   - `PROMOTION_COUPON_CODE`
   - `STRIPE_PROMO_CODE_ID`

## 3) Print operations

- **Printful orders**: `https://www.printful.com/dashboard/default/orders`
- **Manual review mode is ON** if `PRINTFUL_AUTO_CONFIRM=false`.
- **Ops check**:
  - `npm run qa:print-ops -- --hours 168 --limit 40`
- **Admin endpoints** (token-protected):
  - `POST /api/print/orders/retry`
  - `GET /api/print/orders/status?sessionId=...`

## 4) Merchant Center feed

- Feed URL: `https://starmapco.com/merchant-feed.xml`
- Merchant Center (source of truth): `https://merchants.google.com/`
- Search Console "Merchant listings" can lag behind Merchant Center eligibility by 24-72 hours.
- Regenerate locally:
  - `node scripts/generate-merchant-feed.mjs`
- Feed sanity:
  - `npm run qa:merchant-feed`
- Generate shipping reference CSV for Merchant Center setup:
  - `npm run merchant:shipping-reference`
  - output: `docs/merchant-shipping-reference.csv`
- Generate grouped shipping rates for faster setup:
  - `npm run merchant:shipping-groups`
  - output: `docs/merchant-shipping-groups.md`
- Full fix workflow:
  - `docs/merchant-center-fix-playbook.md`

## 5) Release gate commands (minimum safe set)

Run from `star-map-app-final/`:

- `npx tsc --noEmit`
- `npm run qa:smoke:ui`
- `npm run qa:smoke:commerce`
- `npm run qa:live-smoke`
- `npm run deploy`
