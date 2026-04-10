# Google Merchant Center Promotions Playbook

Use this when running Shopping/merchant promotions for StarMapCo print products.

## Current policy

- Merchant feed is currently focused on the two physical print products only.
- Digital HD is intentionally excluded from the Merchant feed by default.
- Current feed items:
  - `print_poster_unframed`
  - `print_poster_framed`

Source:
- [scripts/generate-merchant-feed.mjs](/home/davidheslop/starMap/star-map-app-final/scripts/generate-merchant-feed.mjs)

## Recommended first promotion

- Code: `PRINT10`
- Offer: `10% off any print`
- Scope: `any_print`
- Countries: `US` only for the first run
- Duration: `14 days`

Why this is the right first test:
- aligns with the physical products actually in the feed
- low enough discount to protect margin
- simple to explain in Merchant Center
- simpler than shipping-based promotions

## Important product note

The public checkout flow now supports saved promo codes and a generic `Have a code?` field in the paywall.

That means buyers coming from Merchant Center can:
1. reach the site from the print listing
2. create/open the map
3. enter `PRINT10` in the paywall
4. have checkout validate it against the print route

Without this, a coupon-led Merchant promotion would be weak because there was no clean public code-entry surface.

## Scope note

The current local env does not expose fixed Stripe print price IDs, so `PRINT10` is also protected by a site-side promotion rule:

- `PRINT10` = print only
- `REDDIT50` = single HD digital only
- `TIKTOK50` = single HD digital only

That keeps route-specific offers clean even when Stripe cannot scope the print coupon to a stored print price ID in this shell.

## Merchant Center setup

1. Open Merchant Center:
   - `https://merchants.google.com/`
2. Go to:
   - `Marketing -> Promotions`
3. Create a new online promotion
4. Configure:
   - promotion title: `10% off custom star map prints`
   - redemption type: coupon code
   - code: `PRINT10`
   - target products: the two print products
   - countries: `US`
   - dates: `14-day` test window
5. Keep redemption details simple:
   - `10% off print orders`
6. Submit and watch diagnostics

## Feed / product mapping

Current product IDs in the feed:
- `print_poster_unframed`
- `print_poster_framed`

Feed URL:
- `https://starmapco.com/merchant-feed.xml`

## Verification steps

Before launch:
1. `npm run qa:merchant-feed:live`
2. confirm the promotion code exists in Stripe
3. open the site and verify the paywall promo field accepts the code

After launch:
1. fetch the feed again in Merchant Center
2. check Merchant Center diagnostics after 24-72h
3. watch:
   - `checkout_started`
   - `checkout_session_created`
   - `payment_verified`
4. manually verify one live print path with the code before spending on traffic

## Guardrails

1. do not use `50% off` for print as the first GMC test
2. do not add digital HD to the Merchant feed just to reuse a social offer
3. do not run a multi-country promotion before the US-only test is stable
