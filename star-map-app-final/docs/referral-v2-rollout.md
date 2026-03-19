# Referral V2 Rollout Plan

Updated: 2026-03-19

## Goal

- Increase first-purchase conversion from referral traffic.
- Keep referral abuse and margin risk controlled.

## Offer Structure

- Referrer reward: configurable HD credits (`REFERRAL_REWARD_CREDITS`).
- Friend offer: auto-applied promo variant split between:
  - `STRIPE_REFERRAL_PROMO_CODE_ID` (primary)
  - `STRIPE_REFERRAL_PROMO_CODE_ID_ALT` (experiment)
- Variant split: `REFERRAL_AUTO_OFFER_ALT_SPLIT_PERCENT`.

## Guardrails

- Keep 24-hour cap on rewards:
  - `REFERRAL_MAX_REWARDS_PER_REFERRER_24H`
- Keep 30-day cap on rewards:
  - `REFERRAL_MAX_REWARDS_PER_REFERRER_30D`
- Reversal safety:
  - Reverse conversion + reward on refunds/disputes.

## Measurement

- Track and report by `referral_offer_variant`:
  - `referral_auto_primary`
  - `referral_auto_alt`
  - fallback/manual variants
- Weekly checks:
  - `npm run qa:commerce-digest`
  - `npm run qa:loop-scorecard -- --days 14`
  - `npm run qa:funnel-reconcile -- --days 14`

## Rollout Steps

1. Keep current referral v2 logic live with anti-abuse caps enabled.
2. Run friend-offer split test for at least 14 days.
3. Compare:
   - referral checkout start rate
   - paid conversion rate
   - refund/dispute rate
   - net margin after reward cost
4. Promote winner as default and archive losing offer code.

## Stop Conditions

- Reward reversal rate or dispute rate spikes above baseline.
- Net margin per referred order drops below policy floor.
