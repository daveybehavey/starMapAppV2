# STAR-004 Checkout Source Observation Window

Status: Started
Date started: 2026-06-28
Scope: Seven-day source-aware observation of live Stripe Checkout sessions after deployment of STAR-002 and STAR-003.

## 1. Executive summary

Confirmed: PR #136 was merged to `main` and deployed through the production Cloudflare deployment workflow before this observation window started.

Confirmed: The first post-deploy diagnostics show the new sanitized `checkout_source` metadata appearing on live Checkout sessions.

Confirmed: The first 1-day post-deploy window does not show duplicate safe context clusters or blank safe context IDs.

Paid ads remain no-go for scaling during the observation window.

## 2. Start criteria

Passed:

- PR #136 merged into `main`.
- Production deploy completed successfully through the GitHub Actions production workflow.
- Live critical smoke passed in the deployment workflow.
- Post-deploy checkout diagnostics ran successfully.
- Post-deploy commerce digest ran successfully.
- Post-deploy funnel reconciliation command exited successfully.

## 3. Day 0 post-deploy diagnostics

Commands run:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

Checkout source diagnostics:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 2 |
| Unique safe context IDs | 2 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 2 |
| Funnel `checkout_started` | 0 |
| Funnel `checkout_request_received` | 2 |
| Funnel `checkout_session_created` | 2 |
| Funnel `payment_verified` | 0 |
| Stripe sessions / funnel sessions | 100% |

Checkout sources:

| Source | Count |
| --- | ---: |
| `checkout_api_digital_post` | 1 |
| `unknown_legacy` | 1 |

Interpretation:

- Passed: New source metadata is appearing after deploy.
- Passed: Stripe sessions reconcile with funnel `checkout_session_created`.
- Passed: No duplicate safe context clusters were detected.
- Passed: No blank safe context IDs were detected.
- Expected: `unknown_legacy` can still appear for sessions created before deployment.
- Unknown: One day of data is not enough to judge traffic quality, conversion quality, bots, pricing friction, or checkout UX friction.

Commerce digest:

| Metric | Count |
| --- | ---: |
| Production paid sessions | 0 |
| Production revenue | `$0.00` |
| Landing views | 3 |
| Preview started | 2 |
| Checkout started | 0 |
| Checkout request received | 2 |
| Checkout session created | 2 |
| Payment verified | 0 |

Confirmed semantics:

- `checkout_started` is browser-side checkout intent and remains browser/DNT gated.
- `checkout_request_received` is server-side `/api/checkout` volume.
- `checkout_session_created` is server-side Stripe session creation volume.
- Server checkout volume must not be treated as buyer-intent conversion.

## 4. Day 2 daily observation

Date: 2026-06-30

Commands run:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

Checkout source diagnostics:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 3 |
| Unique safe context IDs | 3 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 3 |
| Funnel `checkout_started` | 0 |
| Funnel `checkout_request_received` | 3 |
| Funnel `checkout_session_created` | 3 |
| Funnel `payment_verified` | 0 |
| Stripe sessions / funnel sessions | 100% |

Checkout sources:

| Source | Count |
| --- | ---: |
| `checkout_api_digital_post` | 3 |

Commerce digest:

| Metric | Count |
| --- | ---: |
| Production paid sessions | 0 |
| Production revenue | `$0.00` |
| Landing views | 13 |
| Preview started | 15 |
| Checkout started | 0 |
| Checkout request received | 3 |
| Checkout session created | 3 |
| Payment verified | 0 |
| Server checkout blockers in last day | 0 |

Interpretation:

- Passed: Source breakdown is now available for all sessions in the 1-day window.
- Passed: All observed sessions were POST digital checkout sessions.
- Passed: No blank safe context IDs were detected.
- Passed: No duplicate context clusters were detected.
- Passed: Stripe sessions reconciled with funnel `checkout_session_created`.
- Confirmed: No paid sessions appeared in this 1-day window.
- Unknown: The current data does not yet distinguish real buyer abandonment from low-quality traffic, QA/internal traffic, bots/probes, pricing friction, or checkout trust friction.

## 5. Day 5 daily observation

Date: 2026-07-03

Commands run:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

Checkout source diagnostics:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 3 |
| Unique safe context IDs | 3 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 3 |
| Funnel `checkout_started` | 0 |
| Funnel `checkout_request_received` | 3 |
| Funnel `checkout_session_created` | 3 |
| Funnel `payment_verified` | 0 |
| Stripe sessions / funnel sessions | 100% |

Checkout sources:

| Source | Count |
| --- | ---: |
| `checkout_api_digital_post` | 3 |

Method and product mix:

| Dimension | Count |
| --- | ---: |
| POST | 3 |
| GET | 0 |
| Digital | 3 |
| Print | 0 |

Stripe session status:

| Status | Count |
| --- | ---: |
| Open | 3 |
| Expired | 0 |
| Paid | 0 |
| Unpaid | 3 |

Commerce digest:

| Metric | Count |
| --- | ---: |
| Production paid sessions | 0 |
| Production revenue | `$0.00` |
| Landing views | 4 |
| Preview started | 2 |
| Checkout started | 0 |
| Checkout request received | 3 |
| Checkout session created | 3 |
| Payment verified | 0 |
| Server checkout blockers in last day | 0 |

Funnel reconcile:

- Exit code: 0 (success; no reconciliation errors reported).

Interpretation:

- Passed: All three sessions in the 1-day window carried `checkout_api_digital_post` source metadata.
- Passed: No blank safe context IDs or duplicate context clusters were detected.
- Passed: Stripe sessions reconciled 100% with funnel `checkout_session_created`.
- Passed: All sessions were POST digital flows; no GET or print checkout volume observed.
- Confirmed: All three sessions remain open and unpaid; no paid conversions in this window.
- Confirmed: No server-side checkout blockers in the last day.
- Unknown: Zero `checkout_started` events with nonzero server checkout volume still does not distinguish human abandonment, low-quality traffic, QA/internal activity, bots/probes, pricing friction, or checkout trust friction.

Paid ads remain no-go for scaling during the observation window.

## 6. Day 6 daily observation

Date: 2026-07-03

Commands run:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

Checkout source diagnostics:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 3 |
| Unique safe context IDs | 3 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 3 |
| Funnel `checkout_started` | 0 |
| Funnel `checkout_request_received` | 3 |
| Funnel `checkout_session_created` | 3 |
| Funnel `payment_verified` | 0 |
| Stripe sessions / funnel sessions | 100% |

Checkout sources:

| Source | Count |
| --- | ---: |
| `checkout_api_digital_post` | 3 |

Method and product mix:

| Dimension | Count |
| --- | ---: |
| POST | 3 |
| GET | 0 |
| Digital | 3 |
| Print | 0 |

Stripe session status:

| Status | Count |
| --- | ---: |
| Open | 3 |
| Expired | 0 |
| Paid | 0 |
| Unpaid | 3 |

Commerce digest:

| Metric | Count |
| --- | ---: |
| Production paid sessions | 0 |
| Production revenue | `$0.00` |
| Landing views | 5 |
| Preview started | 8 |
| Checkout started | 0 |
| Checkout request received | 3 |
| Checkout session created | 3 |
| Payment verified | 0 |
| Server checkout blockers in last day | 0 |

Funnel reconcile:

- Exit code: 0 (success; no reconciliation errors reported).

Interpretation:

- Passed: All three sessions in the 1-day window carried `checkout_api_digital_post` source metadata.
- Passed: No blank safe context IDs or duplicate context clusters were detected.
- Passed: Stripe sessions reconciled 100% with funnel `checkout_session_created`.
- Passed: All sessions were POST digital flows; no GET or print checkout volume observed.
- Confirmed: All three sessions remain open and unpaid; no paid conversions in this window.
- Confirmed: No server-side checkout blockers in the last day.
- Confirmed: Preview activity increased (8) while `checkout_started` remains 0 with 3 server checkout sessions — the client-side tracking gap vs server checkout volume persists.
- Unknown: Still cannot distinguish real abandonment, low-quality traffic, QA/internal activity, bots/probes, pricing friction, or checkout trust friction.

Paid ads remain no-go for scaling during the observation window.

## 7. Observation plan

Run daily for seven days:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

Track:

- New checkout source mix.
- Paid vs unpaid sessions by source.
- Digital vs print checkout source mix.
- Blank safe context ID count.
- Duplicate context clusters.
- Any server-side checkout blocker increase.
- Whether legacy unknowns fall away as the post-deploy window matures.

## 8. Decision questions

At the end of the observation window, decide:

- Are most new Checkout sessions coming from expected browser POST flows?
- Are unexpected GET flows creating meaningful session volume?
- Are print and digital flows distinguishable enough for reporting?
- Are unpaid sessions likely human abandonment, low-quality traffic, bots/probes, QA/internal activity, or UX/pricing friction?
- Is there enough evidence to prioritize cancel recovery, bot/probe filtering, checkout UX work, pricing/offer work, or source attribution improvements?

## 9. Paid ads status

No-go for scaling paid ads.

Reason:

- STAR-002 and STAR-003 made the funnel more truthful.
- The first post-deploy checks show the source metadata working.
- The platform still needs seven days of source-aware evidence before deciding whether paid traffic would be useful or wasteful.

## 10. Recommended next action

Continue the STAR-004 observation window for seven days, then create the next decision report from source-aware checkout evidence.

Do not scale paid ads until the source-quality question is answered.
