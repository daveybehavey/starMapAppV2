# StarMapCo Loop Marketing Playbook

Updated: 2026-03-18

## Goal

Build repeatable growth loops that compound:

1. Buyer -> share -> new visitor -> new buyer
2. Buyer -> proof submission -> public proof content -> new visitor -> new buyer
3. Visitor -> promo signup -> lifecycle email -> buyer -> referral share

## Loop 1: Referral Share Loop (active)

Flow:

1. Paid customer lands on `/success` or `/download`
2. Customer creates referral link and shares to social
3. Friend lands with attribution and checks out
4. Friend gets offer, referrer gets reward credits
5. Referrer shares again

Current implementation status:

- Referral links + attribution are live
- Social share buttons and “copy post text” are live
- Anti-abuse cap + refund/dispute reversal are live
- Source breakdown is visible in referral stats

Primary KPIs:

- `referral_link_created`
- `referral_link_shared`
- referred visits
- referral-qualified paid checkouts
- reward reversals

## Loop 2: Proof/UGC Trust Loop (active, early)

Flow:

1. Buyer receives order and sees proof request on `/success` and `/download`
2. Buyer sends photo + short quote + permission
3. Team approves and publishes proof on-site
4. New visitors see proof and convert at higher rate
5. More buyers generate more proof

Current implementation status:

- Proof-request prompts are live
- Testimonial rendering scaffolding is live
- Publishing remains manual by design (permission-first)

Primary KPIs:

- proof requests sent
- approved proof submissions
- published proof items
- conversion lift on pages with proof blocks

## Loop 3: Promo Capture Lifecycle Loop (active, basic)

Flow:

1. Visitor signs up for promo/news capture
2. Lifecycle follow-up drives return visit
3. Visitor checks out
4. Post-purchase success/download prompts push referral sharing

Current implementation status:

- Signup capture + honeypot + unsubscribe flow are live
- Admin subscriber endpoint is live
- 3-email lifecycle sequence is now live:
  - immediate welcome/coupon email
  - objection-handling follow-up
  - final reminder follow-up
- Queue dispatch remains operator-run unless automated externally

Primary KPIs:

- active promo subscribers
- unsubscribe rate
- subscriber-to-checkout rate
- checkout-to-share rate
- due follow-ups by step (`objection`, `urgency`)

## Weekly Operator Cadence

Run once per week:

1. `npm run qa:loop-scorecard -- --days 14`
2. `npm run qa:commerce-digest -- --days 14`
3. `npm run qa:funnel-reconcile -- --days 14`
4. Review referral source breakdown on `/download` and `/success`
5. Process pending proof submissions and move approved items to publishing queue
6. Export promo subscriber snapshot (`/api/promotions/subscribers`) and review unsubscribe trend

## 30-Day Implementation Plan

1. Standardize loop scorecard:
   - one weekly table in `docs/roadmap-status.md` with loop KPIs
2. Referral v2 completion:
   - launch friend-offer variant test (`free HD` vs `% off`)
3. Proof loop operationalization:
   - publish first approved proof set on top-intent pages
4. Lifecycle loop upgrade:
   - monitor the new 3-email sequence (welcome, objection handling, urgency)
5. Tighten instrumentation:
   - ensure every loop transition has one canonical event

## Guardrails

1. Do not publish testimonials/photos without explicit permission.
2. Keep referral abuse controls enabled while testing stronger offers.
3. Keep margin guard checks active for any offer that touches print checkout.
