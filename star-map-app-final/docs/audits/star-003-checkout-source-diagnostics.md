# STAR-003 Checkout Source Diagnostics

Status: Completed
Date: 2026-06-27
Scope: Server-side checkout session volume, unique-vs-raw Stripe Checkout sessions, safe source diagnostics, and paid-ads readiness.

## 1. Executive summary

Confirmed: The high server-side checkout volume is real Stripe Checkout session creation volume, not a reporting-only artifact.

Confirmed: In the current rolling 14-day window, Stripe sessions reconcile exactly with funnel `checkout_session_created`.

- `checkout_session_created=117`
- Stripe Checkout sessions found for StarMapCo in the same window: `117`
- Coverage: `100%`

Likely: The sessions are mostly unique abandoned digital checkout attempts, not duplicate-click session spam.

- Raw Stripe Checkout sessions: `117`
- Unique safe context IDs: `117`
- Duplicate context clusters detected: `0`
- Digital sessions: `114`
- Print sessions: `3`
- Expired sessions: `112`
- Open sessions: `4`
- Paid sessions: `1`
- Unpaid sessions: `116`

Blocked: Historical sessions do not include route/method/source metadata, so this audit cannot prove whether those unique checkout sessions came from normal browser users, bots, probes, QA/internal testing, or another source. Future sessions now include sanitized `checkout_source` metadata to make that breakdown possible.

Paid ads remain no-go for scaling.

## 2. Data sources inspected

Confirmed:

- `src/app/api/checkout/route.ts`
- `src/lib/funnel.ts`
- `src/lib/checkoutDiagnostics.ts`
- `src/app/api/analytics/funnel/route.ts`
- `scripts/commerce-digest.mjs`
- `scripts/checkout-ratio-sanity.mjs`
- Stripe Checkout Sessions API via a read-only diagnostics script
- Live funnel endpoint: `/api/analytics/funnel?days=14`
- `docs/audits/star-002-checkout-funnel-semantics.md`
- `docs/operator-quick-reference.md`

Confirmed limits:

- Existing checkout diagnostics track failure reasons, not successful session source details.
- Existing funnel source dimensions are useful for counters, but the public dashboard endpoint does not expose per-source checkout session breakdown.
- Legacy Stripe Checkout sessions did not store a route/method source label.

## 3. Best current explanation for the 151/117 server sessions

Confirmed:

- STAR-001/STAR-002 saw `151` server checkout sessions in the then-current 14-day window.
- The current rolling 14-day window now shows `117` server checkout sessions.
- The number changed because the audit window is rolling, not because STAR-003 altered live data.
- Current Stripe Checkout sessions reconcile exactly with funnel `checkout_session_created`.

Likely:

- The high session volume represents many unique checkout contexts that reached Stripe Checkout but did not pay.
- It is not currently explained by duplicate sessions for the same safe map/order context.

Unknown:

- Whether those unique contexts came from real buyers, bots, probes, QA/internal testing, reloads, or other traffic.
- Whether abandoned sessions are expected exploratory behavior or low-quality traffic.

## 4. Unique vs raw checkout counts

Confirmed from `qa:checkout-source-diagnostics -- --days 14`:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 117 |
| Unique safe context IDs | 117 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 1 |
| Unpaid sessions | 116 |
| Funnel `checkout_started` | 3 |
| Funnel `checkout_request_received` | 117 |
| Funnel `checkout_session_created` | 117 |
| Funnel `payment_verified` | 1 |

Interpretation:

- Passed: Raw Stripe sessions match funnel session-created counts.
- Passed: Raw sessions match unique safe context IDs in the current window.
- Confirmed: The earlier semantics issue is fixed; server sessions are no longer treated as browser checkout intent.
- Unknown: Unique safe context does not prove unique human buyer.

## 5. Duplicate/retry/bot/internal/unknown breakdown

| Category | Status | Evidence |
| --- | --- | --- |
| Duplicate sessions | Passed | `0` duplicate context clusters detected |
| Retry/session spam | Needs manual check | No duplicate context clusters, but route/method source was missing on legacy sessions |
| Bots/probes | Unknown | No user agent, IP class, or bot-safe metadata is available in legacy Stripe sessions |
| QA/internal testing | Unknown | Legacy sessions do not identify source as QA/internal |
| Real unique buyer attempts | Likely | `117` raw sessions and `117` unique safe context IDs |
| Abandoned checkout attempts | Likely | `112` expired and `4` open sessions, with only `1` paid session |

## 6. Privacy-safe fields used

Confirmed: The diagnostic script uses only aggregate, privacy-conscious fields:

- Stripe Checkout session status
- Stripe payment status
- Stripe mode
- metadata `order_type`
- metadata `plan`
- metadata `print_variant`
- metadata `print_include_digital`
- metadata `print_shipping_country`
- metadata `checkout_source` when present
- presence of `promotion_code_id` and `referral_code`
- safe context uniqueness from `map_id` / `client_reference_id`, without printing raw values
- UTC hour buckets

Not used or exported:

- full customer emails
- full IP addresses
- card data
- payment details
- secrets
- raw map IDs in report output

## 7. Files changed

- `src/app/api/checkout/route.ts`
- `scripts/checkout-source-diagnostics.mjs`
- `package.json`
- `docs/operator-quick-reference.md`
- `docs/audits/star-003-checkout-source-diagnostics.md`

## 8. Tests/checks run

Passed:

- `node --check scripts\checkout-source-diagnostics.mjs`
- `npm.cmd run qa:checkout-source-diagnostics -- --days 14`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`

## 9. Checkout volume health

Status: Still unknown, but more constrained.

Confirmed healthy:

- Funnel session-created counts reconcile to Stripe sessions.
- No duplicate context clusters were detected in the current rolling window.
- Existing POST checkout idempotency should reduce repeated session creation for the same map/order context.

Confirmed concerning:

- Only `1` paid session out of `117` Stripe Checkout sessions in the current 14-day window.
- `checkout_started` remains far below server checkout session volume.
- Historical sessions lack source metadata, blocking route/method/user-quality diagnosis.

Likely:

- The issue is not duplicate-click spam.
- The issue is either low-quality/unknown checkout traffic, missing source attribution, or real abandoned checkout attempts.

## 10. Paid ads recommendation

No-go for scaling paid ads.

Reason:

- The site can create Stripe sessions and capture payment.
- Server session volume is reconciled and mostly unique.
- But the source quality of those sessions is still unknown, and the paid conversion from server sessions is weak in the current rolling window.

Small diagnostic traffic may be acceptable only if it is explicitly used to observe source-labeled checkout behavior after deployment.

## 11. Recommended next ticket

STAR-004: Deploy-safe checkout source observation window.

Recommended scope:

- Deploy the `checkout_source` metadata label after review.
- Run `qa:checkout-source-diagnostics -- --days 1` daily for 7 days.
- Confirm whether new sessions are mostly `checkout_api_digital_post`, `checkout_api_digital_get`, print flows, QA/internal, or unknown.
- Compare source-labeled sessions against paid sessions.
- Only then decide whether the next implementation should be cancel recovery, bot/probe filtering, stronger checkout entry rules, or conversion UX work.

Do not scale paid ads until the observation window explains source quality.
