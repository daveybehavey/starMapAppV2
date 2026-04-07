# StarMapCo Operator Quick Reference

Use this page when you need to check sales, analytics, print ops, or coupons quickly.

## 1) Analytics and funnel

- **GA4 realtime**: `https://analytics.google.com/analytics/web/`
  - Property: `G-N4PPJ50JQ7`
  - Check `page_view`, `funnel_step`, and checkout-related events.
- **Current live baseline (last verified on 2026-03-14)**:
  - `npm run qa:commerce-digest -- --days 7`
  - Latest snapshot: `landing_view=151`, `preview_started=111`, `checkout_started=110`, `payment_verified=0`
- **Funnel truth note**:
  - treat `checkout_started` as checkout intent
  - treat `checkout_request_received` as requests that actually reached `/api/checkout`
  - treat `checkout_session_created` as successful Stripe session creation
  - treat `payment_verified` as the paid truth metric
  - On March 18, 2026, `checkout_started` was tightened to client intent only (before `/api/checkout`), so expect one transition window of skew while old counts roll out of 14-day comparisons
  - if `checkout_started` is high but `checkout_request_received` is low, the drop is before the checkout API handoff
  - if `checkout_request_received` is healthy but `checkout_session_created` is low, the drop is inside checkout preparation
  - if `checkout_session_created` is healthy but `payment_verified` is low, the drop is inside or after Checkout
- **Map-first checkout rule (live)**:
  - digital checkout now requires a saved `map_id` (preview-first flow)
  - direct digital checkout without a map returns `map_required`
  - if a map link is stale, checkout returns `map_not_found` and user should regenerate preview
- **Checkout blocker split**:
  - `qa:commerce-digest` now separates checkout blockers into:
    - `client_*` reasons (drop-off before checkout API response)
    - server reasons (failures returned by `/api/checkout`)
  - watch `client_network_error` / `client_request_aborted` for handoff reliability issues
- **Quick local verification**:
  - `npm run qa:ga4-smoke`
  - `npm run qa:funnel-reconcile -- --days 14`
  - `npm run qa:commerce-digest -- --days 7`
  - `qa:commerce-digest` now includes paid `referral_offer_variant` mix to validate referral offer tests
  - `GET /api/analytics/checkout-diagnostics` is now available behind `PRINT_ADMIN_TOKEN` for checkout blocker counts

## 2) Stripe revenue and checkout

- **Stripe dashboard**: `https://dashboard.stripe.com/payments`
- **Print checkout sessions** (metadata includes `orderType=print`): `https://dashboard.stripe.com/checkout/sessions`
- **Promo codes**: `https://dashboard.stripe.com/coupons`
- **Support sender setup** (`support@starmapco.com` outbound via Gmail SMTP): `docs/support-email-send-as-setup.md`
- **Wallet/payment-method audit**:
  - `npm run qa:stripe-payment-methods`
  - Confirms current Stripe payment-method configuration for `card`, `Apple Pay`, `Google Pay`, and `Link`
  - Keep `PayPal` off unless we intentionally expand checkout methods and fulfillment handling
  - `npm run qa:commerce-digest -- --days 14` now shows paid payment-method mix (overall + digital + print)
- **Customer download recovery lookup**:
  - `npm run support:order-lookup -- --receipt 1384-7338`
  - `npm run support:order-lookup -- --receipt 1384-7338 --name Christie`
  - `npm run support:order-lookup -- --session cs_live_...`
  - `npm run support:order-lookup -- --email customer@example.com`
  - This returns:
    - exact checkout session ID
    - whether it was refunded
    - the only valid success-link format (`/success?session_id=...`)
    - a ready-to-send customer reply template (active access / refunded / payment incomplete)
    - explicit next action + copy-ready follow-up command for courtesy replacement when needed
    - optional personalized greeting when you pass `--name`
    - for `--email` lookups, it now prefers the most recent paid session (faster lost-files recovery when a newer unpaid attempt exists)
    - reminder that download filenames now start with `starmap-` (easier mobile lookup)
  - Rule: if order is refunded, do not send a download restore link (access is intentionally revoked).
  - If you need to issue a free replacement access:
    - Dry-run first (safe default):
      - `npm run support:courtesy-replacement -- --receipt 1384-7338 --reason refunded_lost_files`
    - Then confirm only when approved:
      - `npm run support:courtesy-replacement -- --receipt 1384-7338 --reason refunded_lost_files --confirm`
    - You can also use `--session cs_live_...` or `--email customer@example.com`.
    - Safety guards:
      - script now requires `--reason`
      - script is dry-run unless `--confirm`
      - script blocks non-refunded source orders unless `--force` is explicitly set
      - script now blocks duplicate courtesy issuance for the same source session unless `--allow-duplicate` is explicitly set
    - Output still includes a ready-to-send customer template + short Checkout URL.
  - HD export credits are now consumed only after file generation succeeds (failed generation should not burn credits).
  - Stripe receipt wording: ensure the Pack product label in Stripe dashboard says `3 HD export credits` (not `3 files`) to reduce support confusion.
- **Account-lite foundation lookup (admin-only)**:
  - `GET /api/account/sessions?email=<customer_email>&limit=20`
  - Auth required via `x-admin-token` / `x-print-admin-token` / `Authorization: Bearer`
  - Returns recent paid session index entries for that email plus current session state from KV.
- **Self-serve customer recovery flow**:
  - Download page now includes an `Email recovery links` form.
  - Public endpoint: `POST /api/account/recover` with `{ "email": "customer@example.com" }`
  - Behavior:
    - always returns a generic success message (no account enumeration)
    - if matching paid sessions exist, sends fresh `/download?token=...` links by email
    - requires outbound provider config (`RESEND_API_KEY` or `SENDGRID_API_KEY`, plus sender address)
  - Optional sender overrides:
    - `ACCOUNT_RECOVERY_EMAIL_FROM`
    - `ACCOUNT_RECOVERY_EMAIL_REPLY_TO`
- **Passwordless My Downloads flow**:
  - Customer page: `/my-downloads` (noindex).
  - Request sign-in link: `POST /api/account/magic/request` with `{ "email": "customer@example.com" }`
  - Claim sign-in link: `POST /api/account/magic/claim` with `{ "token": "..." }`
  - List recent sessions for signed-in email: `GET /api/account/my-sessions`
  - Sign out and clear account cookie: `POST /api/account/magic/logout`
- **One-click access-link email resend**:
  - Authenticated endpoint: `POST /api/account/access-email`
  - Used by success/download UI button `Email me link`.
  - Requires active premium cookie and customer email on the Stripe session record.
  - Returns `401/403` when access is not currently verified on that device.
- **Automatic post-payment access email**:
  - On first paid webhook verification (digital entitlement only), StarMapCo now auto-sends one secure `/download?token=...` link email.
  - Delivery metadata is stored on the session record (`accessEmailSentAt`, provider/error fields).
- **Two-sided referral offer controls**:
  - `STRIPE_REFERRAL_PROMO_CODE_ID` = promo code auto-applied for referred buyers
  - `STRIPE_REFERRAL_PROMO_CODE_ID_PRINT_FRAMED` = optional framed-print friend-offer promo (applies only on framed print checkout with referral code)
  - `REFERRAL_REWARD_CREDITS` = HD credits granted to the referrer per qualified conversion
  - `REFERRAL_MAX_REWARDS_PER_REFERRER_24H` = fast-repeat anti-abuse cap per referrer in a rolling 24-hour window (`0` disables)
  - `REFERRAL_MAX_REWARDS_PER_REFERRER_30D` = anti-abuse cap for how many rewards a single referrer can earn in a rolling 30-day window (`0` disables)
  - `STRIPE_REFERRAL_PROMO_CODE_ID_ALT` = optional alternate friend-offer promo for referral experiment
  - `REFERRAL_AUTO_OFFER_ALT_SPLIT_PERCENT` = optional deterministic split (0-100) for the alternate friend-offer promo
  - `NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL` = user-facing text shown in referral share cards (example: `a free HD download`)
  - For "free HD for both sides":
    - Set `STRIPE_REFERRAL_PROMO_CODE_ID` to a 100% single-HD promo in Stripe
    - Keep `REFERRAL_REWARD_CREDITS=1`
  - Refund/dispute behavior:
    - referral conversions are reversed on `charge.refunded` / dispute-withdrawn webhooks
    - granted referrer reward credits are reclaimed when available

### Run social referral posts

1. Complete a paid order and open `/success` or `/download`.
2. In **Referral bonus**, click:
   - `Copy social link` for the tracking link only, or
   - `Copy post text` for ready-to-paste social caption + link.
3. Share to X/Facebook/Pinterest directly from those same buttons.
4. Watch source breakdown in the same card:
   - `Top social traffic` (visit sources)
   - `Top referral sales` (conversion sources)
5. For deeper referral diagnostics (skip reasons, reversal counts, offer-variant breakdown), query:
   - `GET /api/referrals/status` (requires active premium session cookie)

### Update the signup promo code safely

1. Set env in shell (example):
   - `export PROMOTION_COUPON_CODE=FIRST50`
   - `export PROMOTION_COUPON_PERCENT=50`
   - `export PROMOTION_TARGET_SCOPE=single_digital`
   - `export PROMOTION_TARGET_LABEL="your first single HD digital checkout"`
   - `export PROMOTION_OFFER_NAME="HD starter code"`
2. Run:
   - `npm run promo:setup`
3. Confirm `.env.local` has updated:
   - `PROMOTION_COUPON_CODE`
   - `STRIPE_PROMO_CODE_ID`
4. If you want to pivot the promo later without rewriting copy, update:
   - `PROMOTION_TARGET_SCOPE`
   - `PROMOTION_TARGET_LABEL`
   - `PROMOTION_OFFER_NAME`
   - `NEXT_PUBLIC_PROMOTION_TARGET_LABEL`
   - `NEXT_PUBLIC_PROMOTION_TARGET_SCOPE`
   - `NEXT_PUBLIC_PROMOTION_OFFER_NAME`

### Internal funnel page

- Open `/funnel?token=<FUNNEL_DASHBOARD_TOKEN>`
- The page now shows:
  - landing conversion
  - checkout handoff (`checkout_started` -> `checkout_request_received`)
  - Stripe session creation (`checkout_request_received` -> `checkout_session_created`)
  - paid-after-Stripe conversion
  - promo signup counts
  - top checkout blockers

### Inspect captured promo signups

1. Use the admin token with the live API:
   - `curl -H "x-admin-token: $PRINT_ADMIN_TOKEN" "https://starmapco.com/api/promotions/subscribers?limit=100"`
2. Add `include_unsubscribed=true` if you need the full list including opted-out records.
3. Treat this as the source of truth for promo signup capture until signups are moved into a dedicated ESP/list.
4. `npm run qa:commerce-digest -- --days 14` now also shows:
   - active vs unsubscribed promo signup totals
   - checkout blockers from server-side checkout failures

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
  - both also support a direct opt-in for StarMapCo to review the purchased map for possible website examples
  - list current review opt-ins:
    - `npm run ops:proof-consents`
    - `npm run ops:proof-consents -- --all`
    - `npm run ops:proof-consents -- --json`
    - `npm run ops:proof-consents -- --status new`
  - update operator workflow status:
    - `npm run ops:proof-consents -- --set-status contacted --map <mapId>`
    - `npm run ops:proof-consents -- --set-status approved --session <sessionId>`
    - statuses: `new`, `contacted`, `approved`, `published`, `rejected`
  - generate a publish-ready testimonial intake stub from a consented record:
    - `npm run ops:proof-consents -- --template --map <mapId>`
    - `npm run ops:proof-consents -- --template --session <sessionId>`
  - generate a ready-to-paste testimonial object snippet with optional approved-example link:
    - `npm run ops:proof-consents -- --snippet --map <mapId>`
    - `npm run ops:proof-consents -- --snippet --session <sessionId>`
  - saved buyer notes now appear in the proof-consent report under `context` and `note`
  - success-page proof requests now include the Stripe session reference in the email draft for easier support follow-up
  - review-consent KV keys:
    - `proof:consent:map:<mapId>`
    - `proof:consent:session:<sessionId>`
- **Promo signup hardening**:
  - promo emails now include a signed unsubscribe link
  - `/unsubscribe` updates promo signup state server-side
  - signup capture includes a hidden honeypot field to cut obvious bot submissions

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

## 5) Loop Marketing Ops

- Playbook:
  - `docs/loop-marketing-playbook.md`
- Weekly loop review commands:
  - `npm run qa:loop-scorecard -- --days 14`
  - `npm run qa:commerce-digest -- --days 14`
  - `npm run qa:funnel-reconcile -- --days 14`
- Loop surfaces to review every week:
  - `/success` referral + proof request cards
  - `/download` referral + proof request cards
- Loop data touchpoints:
  - referral stats: `GET /api/referrals/status` (authenticated session)
  - promo subscribers: `GET /api/promotions/subscribers` (admin token)
  - proof publishing source-of-truth: permissioned submissions only
  - weekly executive snapshot endpoint (admin token):
    - `GET /api/ops/loop-scorecard?days=14`
    - includes referral share, proof opportunities (paid print sessions), promo lifecycle, and top client checkout blocker
  - promo follow-up queue dispatch:
    - dry run: `npm run ops:promotion-followup -- --dry-run`
    - send due follow-ups: `npm run ops:promotion-followup -- --limit 100`
    - API equivalent: `POST /api/promotions/followup-dispatch` (admin token)
    - sequence now runs in 3 steps:
      - welcome email sends immediately on signup
      - `objection` follow-up queues first
      - `urgency` follow-up queues after `objection`
    - subscriber admin payload now exposes:
      - `followupNextStep`
      - `followupHistory`

## 6) Release gate commands (minimum safe set)

Run from `star-map-app-final/`:

- `npx next typegen`
- `npx tsc --noEmit`
- `npm run qa:links`
- `npm run qa:smoke:ui`
- `npm run qa:smoke:commerce`
- `npm run qa:live-smoke`
- `npm run qa:content-consistency`
- `npm run deploy`

## 7) Current production notes

- Print checkout is visible in production.
- `PRINT_ORDER_SUBMISSION_ENABLED=true`
- `PRINTFUL_AUTO_CONFIRM=false`
- Meaning: paid print orders can submit into Printful, but remain in manual-approval mode until you approve them in Printful.
- Current marketing promo:
  - `PROMOTION_COUPON_CODE=FIRST50`
  - `PROMOTION_COUPON_PERCENT=50`
  - intended for the first single HD digital file
