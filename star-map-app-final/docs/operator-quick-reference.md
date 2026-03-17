# StarMapCo Operator Quick Reference

Use this page when you need to check sales, analytics, print ops, or coupons quickly.

## 1) Analytics and funnel

- **GA4 realtime**: `https://analytics.google.com/analytics/web/`
  - Property: `G-N4PPJ50JQ7`
  - Check `page_view`, `funnel_step`, and checkout-related events.
- **Current live baseline (last verified on 2026-03-14)**:
  - `npm run qa:commerce-digest -- --days 7`
  - Latest snapshot: `landing_view=151`, `preview_started=111`, `checkout_started=110`, `payment_verified=0`
- **Quick local verification**:
  - `npm run qa:ga4-smoke`
  - `npm run qa:funnel-reconcile -- --days 14`
  - `npm run qa:commerce-digest -- --days 7`

## 2) Stripe revenue and checkout

- **Stripe dashboard**: `https://dashboard.stripe.com/payments`
- **Print checkout sessions** (metadata includes `orderType=print`): `https://dashboard.stripe.com/checkout/sessions`
- **Promo codes**: `https://dashboard.stripe.com/coupons`
- **Wallet/payment-method audit**:
  - `npm run qa:stripe-payment-methods`
  - Confirms current Stripe payment-method configuration for `card`, `Apple Pay`, `Google Pay`, `Link`, and `PayPal`
- **Two-sided referral offer controls**:
  - `STRIPE_REFERRAL_PROMO_CODE_ID` = promo code auto-applied for referred buyers
  - `REFERRAL_REWARD_CREDITS` = HD credits granted to the referrer per qualified conversion
  - `NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL` = user-facing text shown in referral share cards (example: `a free HD download`)
  - For "free HD for both sides":
    - Set `STRIPE_REFERRAL_PROMO_CODE_ID` to a 100% single-HD promo in Stripe
    - Keep `REFERRAL_REWARD_CREDITS=1`

### Run social referral posts

1. Complete a paid order and open `/success` or `/download`.
2. In **Referral bonus**, click:
   - `Copy social link` for the tracking link only, or
   - `Copy post text` for ready-to-paste social caption + link.
3. Share to X/Facebook/Pinterest directly from those same buttons.
4. Watch source breakdown in the same card:
   - `Top social traffic` (visit sources)
   - `Top referral sales` (conversion sources)

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
- **Operator alert inbox**:
  - New sent/draft print orders and failed fulfillment attempts use:
    - `PRINT_ORDER_ALERT_TO`
    - `PRINT_ORDER_ALERT_FROM`
    - `PRINT_ORDER_ALERT_REPLY_TO`
  - Delivery provider env:
    - `RESEND_API_KEY` or `SENDGRID_API_KEY`
- **Ops check**:
  - `npm run qa:print-ops -- --hours 168 --limit 40`
  - `npm run qa:commerce-digest -- --days 7`
- **Upsell rollout scoring**:
  - `npm run qa:upsell-matrix`
  - Output: `docs/upsell-rollout-matrix.md`
  - Launch policy: `docs/upsell-rollout-policy.md`
- **Admin endpoints** (token-protected):
  - `POST /api/print/orders/retry`
  - `GET /api/print/orders/status?sessionId=...`
- **Testimonial intake**:
  - `docs/testimonial-intake-template.md`
  - publish approved quotes only into `src/data/testimonials.ts`
- **Real-proof collection surfaces**:
  - `/success`
  - `/download`
  - both now include a non-public-facing proof request card that asks buyers to email a photo + short note with permission before anything is published

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

## 6) Current production notes

- Print checkout is visible in production.
- `PRINT_ORDER_SUBMISSION_ENABLED=true`
- `PRINTFUL_AUTO_CONFIRM=false`
- Meaning: paid print orders can submit into Printful, but remain in manual-approval mode until you approve them in Printful.
- Current marketing promo:
  - `PROMOTION_COUPON_CODE=FIRST50`
  - `PROMOTION_COUPON_PERCENT=50`
  - intended for the first single HD digital file
