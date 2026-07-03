# STAR-004 Checkout Source Observation Window

Status: Complete
Date started: 2026-06-28
Date completed: 2026-07-03
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

## 7. Day 7 daily observation

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

- Passed: Day 7 matches the Day 5–6 pattern — clean POST digital sessions with full source labeling and reconciliation.
- Confirmed: `checkout_started` remains 0 while server checkout volume is 3.
- Confirmed: No paid conversions, no blockers, no duplicate or blank context signals.

Paid ads remain no-go for scaling.

## 8. Final 7-day rollup

Window: last 7 days (2026-06-27 through 2026-07-03)

Commands run:

- `npm.cmd run qa:checkout-source-diagnostics -- --days 7`
- `npm.cmd run qa:commerce-digest -- --days 7`
- `npm.cmd run qa:funnel-reconcile -- --days 7`

Checkout source diagnostics:

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 30 |
| Unique safe context IDs | 30 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 30 |
| Funnel `checkout_started` | 1 |
| Funnel `checkout_request_received` | 30 |
| Funnel `checkout_session_created` | 30 |
| Funnel `payment_verified` | 0 |
| Stripe sessions / funnel sessions | 100% |

Checkout sources:

| Source | Count |
| --- | ---: |
| `checkout_api_digital_post` | 23 |
| `unknown_legacy` | 5 |
| `checkout_api_print_post` | 2 |

Method and product mix:

| Dimension | Count |
| --- | ---: |
| POST | 25 |
| Unknown (legacy) | 5 |
| GET | 0 |
| Digital | 28 |
| Print | 2 |

Stripe session status:

| Status | Count |
| --- | ---: |
| Expired | 26 |
| Open | 4 |
| Paid | 0 |
| Unpaid | 30 |

Commerce digest:

| Metric | Count |
| --- | ---: |
| Production paid sessions | 0 |
| Production revenue | `$0.00` |
| Landing views | 65 |
| Preview started | 83 |
| Checkout started | 1 |
| Checkout request received | 30 |
| Checkout session created | 30 |
| Payment verified | 0 |
| Print checkout opened (Stripe) | 2 |
| Print checkout paid | 0 |
| Server checkout blockers in last 7 days | 0 |

Funnel reconcile:

- Exit code: 0 (success; no reconciliation errors reported).
- Commerce digest semantics warning: server checkout volume exceeds client checkout intent; do not treat this as a conversion rate.

## 9. Final STAR-004 interpretation

| Question | Answer |
| --- | --- |
| Are new sessions mostly source-labeled? | **Yes.** Post-deploy sessions are `checkout_api_digital_post` or `checkout_api_print_post`. Five `unknown_legacy` sessions are pre-deploy carryover, not new unlabeled volume. |
| Are sessions mostly POST or GET? | **POST.** 25 POST-labeled plus 5 legacy unknown; **0 GET** in the 7-day window. |
| Are sessions mostly digital or print? | **Digital.** 28 digital vs 2 print. Print is distinguishable and low volume. |
| Are sessions mostly unique? | **Yes.** 30 raw sessions, 30 unique safe context IDs, raw sessions match unique contexts. |
| Are there blank context IDs? | **No.** 0 across the window. |
| Are there duplicate context clusters? | **No.** 0 across the window. |
| Are sessions mostly unpaid/open/expired? | **Yes.** 30 unpaid, 0 paid; 26 expired, 4 open. |
| Is there evidence of checkout server blockers? | **No.** 0 server blockers in the last 7 days. Checkout creation is healthy. |
| Is there evidence of bots/probes? | **No meaningful signal.** No GET checkout volume; no duplicate clusters; post-deploy sessions are clean POST browser API flows. Legacy unknowns are attributed to pre-deploy sessions, not probe patterns. |
| Is there evidence of real abandoned buyer intent? | **Not clear.** Preview activity exists (83), but only 1 `checkout_started` vs 30 server checkout sessions and 0 payments. Cannot distinguish human abandonment from missing client intent tracking, DNT gating, low-quality traffic, or QA/internal activity. |
| Is `checkout_started` still missing despite server checkout sessions? | **Yes.** Daily observations on Days 5–7 show 0 `checkout_started` with 3 server sessions each day. Over 7 days: 1 `checkout_started` vs 30 `checkout_request_received` / `checkout_session_created`. |
| Are paid ads still no-go? | **Yes.** Zero production revenue, zero paid sessions, and buyer-intent signal remains unresolved. |

Summary:

- **Passed:** STAR-002/STAR-003 source metadata, context IDs, Stripe/funnel reconciliation, and server checkout creation all work as designed.
- **Passed:** No idempotency problems, no server blockers, no bot/probe pattern in post-deploy traffic.
- **Unresolved:** Revenue and buyer-intent quality. Server checkout fires reliably; client `checkout_started` almost never fires; nothing converts to paid.
- **Not supported by evidence:** Bot/probe filtering, cancel recovery, idempotency hardening, or paid-ad scaling as the next move.

## 10. Paid ads status

**No-go** for scaling paid ads.

Reason:

- Seven days of source-aware evidence confirms technical checkout health but not buyer-intent quality or conversion readiness.
- Zero production paid sessions and zero production revenue across the window.
- Server checkout volume cannot be treated as buyer intent while `checkout_started` remains near zero.

## 11. Recommended next implementation ticket

**Client-side checkout-intent tracking gap investigation**

Smallest evidence-supported next step. Do not start with pricing, offer, UX redesign, recovery flows, or bot filtering.

Why this ticket:

- Post-deploy sessions are clean, unique, POST digital flows with working source metadata.
- Server checkout creation is healthy with 100% Stripe/funnel reconciliation and 0 blockers.
- `checkout_started` is 0 on Days 5–7 despite 3 server checkout sessions per day; only 1 `checkout_started` event across the full 7-day window vs 30 server checkout sessions.
- Commerce digest explicitly warns that server checkout volume exceeds client checkout intent.
- Before changing offer, pricing, UX, or recovery, determine whether `checkout_started` is broken, blocked, DNT-gated, or not wired on the current checkout path.

Investigation should answer:

- Does the current checkout button/path emit `checkout_started` before calling `/api/checkout`?
- Is the event suppressed by DNT, consent, ad blockers, or a code-path skip?
- Can server checkout sessions be correlated to preview/landing sessions without relying on `checkout_started`?

Do not scale paid ads until buyer-intent tracking is understood.
