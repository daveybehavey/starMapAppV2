# Social Referral Campaign Playbook

Updated: 2026-03-13

Goal: drive new paid checkouts from social posts while rewarding both sides.

## 1) Offer setup

- Friend offer: set `NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL` (example: `a free HD download`).
- Friend discount engine: set `STRIPE_REFERRAL_PROMO_CODE_ID` to the Stripe promo code ID for first-HD discount.
- Referrer reward: keep `REFERRAL_REWARD_CREDITS=1` (or higher if needed).

## 2) Link tracking standard

Referral links now auto-tag platform traffic:

- `ref_src`: `success_x`, `download_facebook`, etc.
- `utm_source`: `x`, `facebook`, `pinterest`, or `social`
- `utm_medium`: `referral_social`
- `utm_campaign`: `free_hd_referral`
- `utm_content`: same as `ref_src`

Use buttons in `/success` or `/download`:

- `Copy social link`
- `Copy post text`
- `Share on X/Facebook/Pinterest`

## 3) Weekly posting rhythm

Post from real completed maps:

1. Personal story angle ("this is where/when...")
2. Gift angle ("wedding/anniversary/birthday")
3. Utility angle ("preview free, print later")

Minimum: 3 referral posts per week.

## 4) Post templates

### X

`I turned a real moment into a custom star map. You can preview yours free in seconds. Use my link for {friend_offer}. {referral_link}`

### Facebook

`If you want a meaningful gift idea: I used StarMapCo to make a custom night sky map from a real date/location. You can try it free, and my link gives you {friend_offer}. {referral_link}`

### Pinterest pin description

`Custom star map gift idea: anniversary, wedding, birthday, memorial. Preview free and use this link for {friend_offer}. {referral_link}`

## 5) KPI targets

Track weekly from referral card + funnel:

- Referral visits
- Referral conversions
- Rewards granted
- Top social traffic sources
- Top referral sales sources

Initial benchmark targets:

- Visit -> paid conversion >= 2%
- At least 1 paid referral conversion per week by week 3

## 6) Guardrails

- Do not use low-trust spam language ("free free free").
- Keep one clear CTA per post.
- Use real outputs from your current render engine only.
- If conversion is weak but clicks are high, improve landing page trust near CTA before increasing volume.
