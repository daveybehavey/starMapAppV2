# Promotion Automation Setup

This project now includes a complete "email-for-20%-off" system:

- Homepage signup block (`PromotionSignup`)
- Auto-popup signup modal (`PromotionEmailPopup`)
- API endpoint at `/api/promotions/subscribe`
- Coupon delivery automation (Resend, SendGrid, or custom webhook)
- Stripe promo-code bootstrap script (`npm run promo:setup`)

## 1) Configure env vars

In `.env.local`, set:

```env
PROMOTION_COUPON_CODE=20OFF
PROMOTION_COUPON_PERCENT=20
PROMOTION_COUPON_FIRST_TIME_ONLY=true
PROMOTION_COUPON_MAX_REDEMPTIONS=0
PROMOTION_EMAIL_SUBJECT=Your 20% off StarMapCo code
PROMOTION_EMAIL_FROM=StarMapCo <hello@updates.starmapco.com>
PROMOTION_EMAIL_REPLY_TO=support@starmapco.com
```

Choose exactly one delivery path:

### Option A (recommended): Resend

```env
RESEND_API_KEY=re_xxx
```

### Option B: SendGrid

```env
SENDGRID_API_KEY=SG.xxx
```

### Option C: Your own automation endpoint

```env
PROMOTION_AUTOMATION_WEBHOOK_URL=https://your-hook-url
```

## 2) Create or sync Stripe promo code

Run:

```bash
npm run promo:setup
```

This script will:

- Reuse an existing active Stripe promotion code if one already matches `PROMOTION_COUPON_CODE`
- Otherwise create a new Stripe coupon + promotion code
- Write `STRIPE_PROMO_CODE_ID` and `PROMOTION_COUPON_CODE` to `.env.local`

## 3) Validate

```bash
npm run check:env
npm run lint
```

Then run the app and test signup:

1. Open the homepage.
2. Wait for the popup (or use the inline form).
3. Submit an email.
4. Confirm:
   - success message with coupon code
   - email arrives (or webhook receives payload)
   - checkout accepts the promo code

## Payload sent to webhook fallback

If using `PROMOTION_AUTOMATION_WEBHOOK_URL`, POST body is:

```json
{
  "email": "user@example.com",
  "couponCode": "20OFF",
  "list": "20_percent_waitlist",
  "source": "promotion_signup",
  "timestamp": "2026-02-04T00:00:00.000Z"
}
```
