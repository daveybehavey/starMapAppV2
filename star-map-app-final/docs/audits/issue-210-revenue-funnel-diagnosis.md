# Issue #210 — Revenue funnel diagnosis (print-order drop-off)

**Status:** Partial — blocked on read-only production credentials  
**Baseline:** `main` @ `f60f1002fe23d94146f1760eb673d569878c6bdb`  
**Collected at:** 2026-08-07T17:42Z (UTC)  
**Site:** `https://starmapco.com`  
**Mutations:** none (no Stripe/Printful/Cloudflare writes, no checkout creation, no deploy)

## 1. Goal

Identify the highest-leverage proven bottleneck for print-order conversion before changing UX, pricing, recovery, traffic rules, or ads.

## 2. Credential / environment blockers

| Required for | Env var | This cloud agent |
| --- | --- | --- |
| `qa:checkout-source-diagnostics`, `qa:commerce-digest` (Stripe paid/unpaid, handoff, print/digital, source mix, duplicates, revenue) | `STRIPE_SECRET_KEY` | **MISSING** |
| Checkout failure / blocker aggregates (`GET /api/analytics/checkout-diagnostics`), print-ops slices in commerce-digest | `PRINT_ADMIN_TOKEN` | **MISSING** |
| Funnel dashboard auth (optional when server token unset) | `FUNNEL_DASHBOARD_TOKEN` | Not needed — public funnel GET returned 200 |
| Stripe MCP | OAuth | `needsAuth` — not used; would still not replace the CLI aggregate scripts |

### Exact failures observed

```text
npm run qa:checkout-source-diagnostics -- --days 1 --json
→ Missing STRIPE_SECRET_KEY

npm run qa:commerce-digest -- --days 1
→ Missing STRIPE_SECRET_KEY

GET https://starmapco.com/api/analytics/checkout-diagnostics?days=7
→ HTTP 401 {"ok":false,"error":"Unauthorized"}
```

### Safest mechanism to finish (no permission workarounds)

1. Add **read-only** secrets to the Cursor Cloud environment (or run locally where they already exist):
   - `STRIPE_SECRET_KEY` (live read is enough for these scripts; do not paste into chat/PR)
   - `PRINT_ADMIN_TOKEN` (matches production admin token)
2. From `star-map-app-final/` on this same baseline commit, run exactly:
   - `npm run qa:checkout-source-diagnostics -- --days 1 --json`
   - `npm run qa:checkout-source-diagnostics -- --days 7 --json`
   - `npm run qa:checkout-source-diagnostics -- --days 30 --json`
   - `npm run qa:commerce-digest -- --days 1`
   - `npm run qa:commerce-digest -- --days 7`
   - `npm run qa:commerce-digest -- --days 30`
   - `npm run qa:funnel-reconcile -- --days 7` and `--days 30` (dry-run default; needs `PRINT_ADMIN_TOKEN`)
3. Re-apply the issue decision table using handoff + print/digital + blocker aggregates.
4. Do **not** use Stripe Dashboard exports that include customer PII in this ticket trail; keep CLI aggregate-only output.

## 3. Commands that did run (aggregate-only)

| Command | Result |
| --- | --- |
| `GET /api/analytics/funnel?days=1\|7\|30` | OK — window counts below |
| `npm run qa:checkout-daily-ratio -- --days 7` | OK |
| `npm run qa:checkout-daily-ratio -- --days 30` (via `node scripts/checkout-daily-ratio-sanity.mjs --days 30`) | OK |
| `npm run qa:checkout-ratio-sanity` | OK — warned server sessions ≫ client `checkout_started` |
| `npm run qa:checkout-source-diagnostics …` | Blocked — missing `STRIPE_SECRET_KEY` |
| `npm run qa:commerce-digest …` | Blocked — missing `STRIPE_SECRET_KEY` |
| Checkout diagnostics API | Blocked — missing `PRINT_ADMIN_TOKEN` |

**Semantics reminder (STAR-002 / STAR-005):**

- Window truth for funnel steps = `lastNDays` (not lifetime `total`).
- `checkout_started` is client/DNT-gated; **not** comparable 1:1 to `checkout_session_created`.
- `checkout_session_created` is server operational volume.
- `payment_verified` is paid truth (when reconciled to Stripe).
- Do **not** interpret missing Stripe handoff metadata as bare API traffic; that requires `qa:checkout-source-diagnostics` labeled `browser` / `missing` (ignore `unknown_legacy`).

## 4. Funnel aggregates (production KV)

Source: `GET https://starmapco.com/api/analytics/funnel?days=N`  
Generated: ~2026-08-07T17:42Z  

| Step | 1d | 7d | 30d |
| --- | ---: | ---: | ---: |
| `landing_view` | 13 | 139 | 612 |
| `hero_plan_click` | 11 | 116 | 535 |
| `preview_started` | 12 | 151 | 702 |
| `editor_reveal` | 2 | 30 | 117 |
| `checkout_started` (client) | 0 | 18 | 41 |
| `checkout_request_received` | 5 | 48 | 164 |
| `checkout_session_created` | 5 | 48 | 164 |
| `checkout_redirected` | 5 | 48 | 164 |
| `checkout_expired` | 8 | 46 | 160 |
| `payment_verified` | 0 | 0 | 4 |
| `download_started` | 0 | 0 | 2 |
| `download_completed` | 0 | 0 | 0 |

### Window conversion ratios (using `lastNDays`)

| Ratio | 1d | 7d | 30d |
| --- | ---: | ---: | ---: |
| preview / landing | 92.3% | 108.6% | 114.7% |
| editor_reveal / preview | 16.7% | 19.9% | 16.7% |
| client checkout_started / preview | 0.0% | 11.9% | 5.8% |
| session_created / request_received | 100% | 100% | 100% |
| payment_verified / session_created | 0.0% | 0.0% | 2.4% |
| checkout_expired / session_created | 160%* | 95.8% | 97.6% |
| payment_verified / landing | 0.0% | 0.0% | 0.65% |

\*1d expired can exceed same-day session creates (sessions opened earlier still expire in-window).

### Checkout ratio sanity (script output)

**Last 1d:** preview=12, checkout_started=0, session_created=5, payment_verified=0  
**Last 7d:** preview=151, checkout_started=18, session_created=48, payment_verified=0  

Script warning (expected per STAR-005): server checkout sessions exceed client checkout intent — do not treat as a conversion rate.

### Daily paid pattern (30 UTC days)

From `checkout-daily-ratio-sanity` (preview / session / paid):

- Paid days in window: **2026-07-10 (1), 2026-07-12 (1), 2026-07-21 (2)** — total **4** (matches funnel `payment_verified` 30d).
- **Zero** `payment_verified` from **2026-07-22 through 2026-08-07** (~17 consecutive days) despite **steady** session creation (~4–9 sessions/day).
- 7d daily: sessions every day; paid every day = 0.

## 5. Evidence still missing (blocked)

Cannot report until `STRIPE_SECRET_KEY` / `PRINT_ADMIN_TOKEN` are available:

- Browser vs missing vs `unknown_legacy` handoff mix (and paid/unpaid × print/digital splits)
- Checkout source mix / duplicate clusters
- Production revenue / order mix (digital vs print paid)
- QA/smoke Stripe-session exclusion (commerce-digest uses QA tagging when Stripe is readable)
- Checkout blocker reason buckets (`client_*` vs server `/api/checkout`)
- Funnel reconcile vs Stripe paid session counts

## 6. Ranked bottlenecks (funnel-only; provisional)

Issue decision rules applied to **available** evidence only.

### #1 — Checkout sessions are created but almost never paid (post-session abandonment or non-buyer session spam)

- **Evidence:** 7d `payment_verified=0` / `session_created=48`; 30d `4/164` (2.4%); `checkout_expired` ≈ sessions (~96–98%); no paid day since 2026-07-21 while sessions continue.
- **Maps to decision rule:** **(2)** if browser handoff is healthy; **or** non-buyer/API noise if handoff is mostly `missing` — **cannot distinguish without Stripe handoff diagnostics**.
- **Confidence:** **High** that unpaid/expired sessions are the dominant measurable loss after session creation. **Low–medium** on root cause (trust/price/offer vs bot/API vs QA) until handoff + source mix + blockers are read.
- **Not proven P0 product defect:** session creation succeeds at 100% of `checkout_request_received` in these windows.

### #2 — Absolute traffic is modest, but not the primary lever while paid≈0

- **Evidence:** ~20 landing views/day (612/30); ~5 sessions/day (164/30). Enough volume to observe conversion; still **0 paid in 7d**.
- **Maps to decision rule:** **(4)** only after conversion is non-zero; acquisition alone will not fix a ~0% session→paid rate.
- **Confidence:** **High** that “just buy more ads/SEO” is lower leverage than understanding unpaid sessions.

### #3 — Pre-Stripe API blockers are unlikely as the *dominant* current bottleneck

- **Evidence:** `checkout_session_created` == `checkout_request_received` for 1d/7d/30d (100%). Funnel does not show a request→session cliff.
- **Caveat:** Blocker aggregates can still show soft failures / client aborts not reflected as missing session creates. Needs `PRINT_ADMIN_TOKEN`.
- **Maps to decision rule:** **(3)** not supported as primary by funnel alone.
- **Confidence:** **Medium** (funnel-complete path looks healthy; diagnostics unread).

### Explicitly unresolved (rule 1)

Browser-handoff scarcity vs healthy handoff **cannot** be ranked until `qa:checkout-source-diagnostics` runs. Do not treat `unknown_legacy` or client `checkout_started` gaps as bare/direct API proof.

## 7. Single smallest highest-leverage next ticket

**Recommended next ticket (meta, unblocks diagnosis — do this before any UX/pricing/ads change):**

> **Provide read-only `STRIPE_SECRET_KEY` + `PRINT_ADMIN_TOKEN` to the cloud agent (or operator-run the six digest/diagnostics commands on baseline `f60f100`) and complete issue #210 with handoff × print/digital × blocker aggregates.**

**Conditional product ticket (only after Stripe handoff mix is known — do not open as speculative fix yet):**

| If diagnostics show… | Then open… |
| --- | --- |
| Labeled sessions mostly `checkout_handoff=browser`, unpaid | Smallest ticket: **Stripe Checkout abandonment analysis for browser-handoff print (and digital) sessions** — unpaid reason aggregates only; no price/UX change until trust/price/offer hypothesis is ranked |
| Labeled sessions mostly `checkout_handoff=missing` | Smallest ticket: **filter/instrument non-browser checkout POST sources** (traffic quality), not paywall copy |
| Dominant print checkout-diagnostics blocker | Fix **that single blocker code path** first |
| Print attempts ≈0 while digital sessions dominate | Ticket: **print offer discoverability / path to print checkout** (pre-checkout), not payment recovery |

Until secrets land, **do not** implement pricing, recovery email, ads, or traffic-rule changes from this issue.

## 8. Privacy

- No Stripe session IDs, emails, addresses, map contents, tokens, or provider payloads included.
- Aggregates only.
- No `.env` contents committed.
