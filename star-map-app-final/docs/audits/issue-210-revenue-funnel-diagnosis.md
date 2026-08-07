# Issue #210 — Revenue funnel diagnosis (print-order drop-off)

**Status:** Partial — blocked on read-only production credentials  
**Baseline:** `main` @ `f60f1002fe23d94146f1760eb673d569878c6bdb`  
**Collected at:** 2026-08-07T17:48Z–17:49Z (UTC)  
**Site:** `https://starmapco.com`  
**Mutations:** none (no Stripe / Printful / Cloudflare writes, no checkout creation, no deploy, no code/config changes beyond this audit doc)

Re-run of the issue’s required aggregate commands after Deploy production #44. Supersedes the earlier credential-blocked snapshot in PR #211 with freshly collected funnel counters and explicit 1d/7d/30d CLI attempts (including dry-run `funnel-reconcile`).

## 1. Goal

Determine, from current production evidence, **why print orders are not coming in and where real buyers drop out**. Highest-leverage revenue diagnosis first; no speculative fixes.

## 2. Credential / environment blockers

| Required for | Env var | This cloud agent |
| --- | --- | --- |
| `qa:checkout-source-diagnostics`, `qa:commerce-digest` (paid/unpaid, handoff, print/digital, source mix, duplicates, revenue, QA exclusion) | `STRIPE_SECRET_KEY` | **MISSING** |
| Dry-run `qa:funnel-reconcile`, checkout failure / blocker aggregates (`GET /api/analytics/checkout-diagnostics`), print-ops slices | `PRINT_ADMIN_TOKEN` | **MISSING** |
| Funnel dashboard auth (optional when server token unset) | `FUNNEL_DASHBOARD_TOKEN` | Not needed — public funnel GET returned **200** |
| Stripe MCP | OAuth | `needsAuth` — not used; does not replace CLI aggregate scripts |

Secrets were requested via Cursor Cloud environment setup actions for this run. No permission workarounds were attempted.

### Exact failures observed

```text
npm run qa:checkout-source-diagnostics -- --days 1|7|30
→ checkout-source-diagnostics failed.
→ Missing STRIPE_SECRET_KEY

npm run qa:commerce-digest -- --days 1|7|30
→ Commerce digest failed.
→ Missing STRIPE_SECRET_KEY

npm run qa:funnel-reconcile -- --days 1|7|30 --site https://starmapco.com
→ Missing PRINT_ADMIN_TOKEN. Set it in the environment (never commit secrets).
  (default dry-run mode; --apply was never used)

GET https://starmapco.com/api/analytics/checkout-diagnostics?days=7
→ HTTP 401 {"ok":false,"error":"Unauthorized"}
```

### Safest mechanism to finish (no permission workarounds)

1. Add **read-only** secrets to the Cursor Cloud environment (or run locally where they already exist):
   - `STRIPE_SECRET_KEY`
   - `PRINT_ADMIN_TOKEN`
2. From `star-map-app-final/` on this same baseline commit, re-run exactly the nine commands listed in §3.
3. Re-apply the issue decision table using handoff × print/digital × paid/unpaid × blockers.
4. Keep CLI aggregate-only output; never paste session IDs, emails, addresses, map contents, tokens, or provider payloads into GitHub.

## 3. Commands attempted

| Command | Result |
| --- | --- |
| `GET /api/analytics/funnel?days=1\|7\|30` | **OK** — window counts in §4 |
| `npm run qa:checkout-daily-ratio -- --days 7` | **OK** |
| `node scripts/checkout-daily-ratio-sanity.mjs --days 30` | **OK** |
| `npm run qa:checkout-ratio-sanity` | **OK** — warned server sessions ≫ client `checkout_started` |
| `npm run qa:checkout-source-diagnostics -- --days {1,7,30}` | **Blocked** — `STRIPE_SECRET_KEY` |
| `npm run qa:commerce-digest -- --days {1,7,30}` | **Blocked** — `STRIPE_SECRET_KEY` |
| `npm run qa:funnel-reconcile -- --days {1,7,30} --site https://starmapco.com` | **Blocked** — `PRINT_ADMIN_TOKEN` (dry-run default preserved) |
| `GET /api/analytics/checkout-diagnostics?days={1,7,30}` | **Blocked** — HTTP 401 |

**Semantics reminder (STAR-002 / STAR-005 / STAR-006):**

- Window truth for funnel steps = `lastNDays` (not lifetime `total`).
- `checkout_started` is client/DNT-gated; **not** comparable 1:1 to `checkout_session_created`.
- `checkout_session_created` is server operational volume.
- `payment_verified` is paid truth (when reconciled to Stripe).
- Do **not** treat `unknown_legacy` as bare/direct API traffic; only labeled `browser` / `missing` handoff counts for origin decisions.
- QA/smoke exclusion requires Stripe metadata via `qa:commerce-digest` / `qa:checkout-source-diagnostics` — **not available in this run**.

## 4. Funnel aggregates (production)

Source: `GET https://starmapco.com/api/analytics/funnel?days=N`  
Generated: ~2026-08-07T17:48Z  

### Concise window table

| Metric | 1d | 7d | 30d |
| --- | ---: | ---: | ---: |
| landing_view | 14 | 140 | 613 |
| preview_started | 12 | 151 | 702 |
| checkout_started (client) | 0 | 18 | 41 |
| checkout_request_received | 5 | 48 | 164 |
| checkout_session_created | 5 | 48 | 164 |
| checkout_redirected | 5 | 48 | 164 |
| checkout_expired | 8 | 46 | 160 |
| payment_verified | **0** | **0** | **4** |
| download_started | 0 | 0 | 2 |
| download_completed | 0 | 0 | 0 |
| preview / landing | 85.7% | 107.9% | 114.5% |
| client checkout / preview | 0.0% | 11.9% | 5.8% |
| request → session | **100%** | **100%** | **100%** |
| session → paid | **0.0%** | **0.0%** | **2.4%** |
| session → expired | 160%\* | 95.8% | 97.6% |
| server sessions − client intent | +5 | +30 | +123 |

\* Expired can exceed sessions in a short window because expirations lag creation across day boundaries.

### Additional funnel steps

| Step | 1d | 7d | 30d |
| --- | ---: | ---: | ---: |
| hero_plan_click | 11 | 116 | 535 |
| editor_reveal | 2 | 30 | 117 |
| preview_checkout_nudge_shown | 0 | 0 | 0 |
| preview_checkout_nudge_clicked | 0 | 0 | 0 |

### Paid timeline (30d daily)

Paid days only: **2026-07-10 (1)**, **2026-07-12 (1)**, **2026-07-21 (2)**.  
Last `payment_verified`: **2026-07-21**.  
Then **17 consecutive UTC days** (2026-07-22 → 2026-08-07) with sessions every day and **zero** `payment_verified`.

7d daily: every day had sessions (5–9/day) and **0 paid**.

## 5. Fields required by the issue but unavailable without secrets

| Required report item | Status |
| --- | --- |
| print vs digital checkout sessions | **Unavailable** — needs Stripe |
| `checkout_handoff=browser` vs `missing` vs legacy/unknown | **Unavailable** — needs Stripe |
| paid vs unpaid by handoff and by print/digital | **Unavailable** — needs Stripe |
| checkout blockers / failure categories | **Unavailable** — needs `PRINT_ADMIN_TOKEN` (401) |
| meaningful checkout/source attribution | **Unavailable** — needs Stripe |
| funnel reconciliation discrepancies | **Unavailable** — needs `PRINT_ADMIN_TOKEN` |
| QA/smoke exclusion from buyer conclusions | **Unavailable** — needs Stripe QA tagging in digest scripts |
| production revenue $ / order mix | **Unavailable** — needs Stripe |

## 6. Bottleneck classification (evidence-supported)

Candidate classes from the issue, scored against what is readable today:

| Candidate | Verdict | Evidence |
| --- | --- | --- |
| Insufficient qualified traffic | **Ruled out as primary** while paid≈0 | 140 landings / 151 previews in 7d; 613 / 702 in 30d — enough volume that paid≈0 is not explained by “no visitors” |
| Landing → preview loss | **Ruled out** | preview ≥ landing in 7d/30d (107.9% / 114.5%); 1d still 85.7% |
| Preview/editor → checkout-intent loss | **Secondary / possible** for *real* buyers | Client `checkout_started` / preview = 11.9% (7d), 5.8% (30d). Cannot treat as sole truth (DNT + known undercount). Server sessions still form every day |
| Checkout-intent → Stripe-session technical failure | **Ruled out as dominant** | `checkout_request_received` → `checkout_session_created` = **100%** in all windows; redirected matches session count |
| Stripe session → payment abandonment | **Primary loss location (location high-confidence)** | 0/5 (1d), 0/48 (7d), 4/164 (30d) paid; ~96–98% expire; 17 days of sessions with zero paid since 2026-07-21 |
| Print-specific selection/offer/price/trust friction | **Cannot classify** | No print vs digital split without Stripe |
| Direct/API/bot traffic contaminating checkout volume | **Plausible secondary / confounder** | Server sessions ≫ client intent (+30 in 7d, +123 in 30d). STAR-006 handoff labels required to prove; do not treat gap alone as proof |
| Instrumentation blind spot preventing a defensible conclusion | **Active blocker for *why* / print-specific** | Missing Stripe + admin tokens block handoff, print mix, QA exclusion, blockers, reconcile |

### Decision-rule mapping (issue #210)

1. Browser handoff scarce → pre-checkout UX/traffic: **cannot apply** (handoff unread).
2. Browser healthy but unpaid → checkout/trust/price/offer: **candidate if** handoff proves mostly `browser`.
3. Print blocked before Stripe → fix blocker: **not supported** by funnel alone (100% request→session); blocker API unread.
4. Too little qualified traffic → acquisition: **deferred** while paid≈0 with non-trivial preview volume.

## 7. Decision output

### Primary bottleneck

**Checkout sessions are created and almost never paid** (0 paid in 1d and 7d; 4/164 = 2.4% in 30d; last paid day 2026-07-21). That is the largest evidence-backed *where* of revenue loss. Whether those sessions are real browser buyers vs contaminated API/QA volume — and whether print is even in the unpaid mix — **cannot be proven** until Stripe handoff + order-type aggregates are readable.

### Secondary bottleneck(s)

1. **Large client-intent vs server-session gap** (possible API/bot/direct POST contamination and/or DNT undercount) — medium confidence that it *matters* for interpreting session volume; low confidence on magnitude without handoff labels.
2. **Modest client checkout intent vs preview** (≈6–12%) — possible real pre-checkout friction, but not the dominant proven leak while nearly every created session still expires unpaid.
3. **Diagnosis instrumentation gap** — blocks print-specific and handoff-conditioned conclusions.

### What is ruled out (with evidence)

- **Landing → preview collapse** — preview tracks or exceeds landing.
- **Insufficient traffic as the #1 lever while paid≈0** — hundreds of previews in 30d with near-zero paid.
- **Dominant pre-Stripe technical failure creating sessions** — 100% request→session→redirect in all windows.
- **“Unknown legacy handoff = bots”** — not asserted; STAR-006 forbids that interpretation without labeled data (and labels unread here).

### Next highest-leverage action (smallest safe)

**Unblock diagnosis, do not ship UX/pricing/recovery/ads yet:**

1. Inject read-only `STRIPE_SECRET_KEY` + `PRINT_ADMIN_TOKEN` into the Cloud Agent environment (already requested this run), **or** run the nine CLIs locally on baseline `f60f100`.
2. Re-run:
   - `qa:checkout-source-diagnostics` 1d/7d/30d
   - `qa:commerce-digest` 1d/7d/30d
   - `qa:funnel-reconcile` 1d/7d/30d (dry-run only)
3. Apply the issue decision table using **browser vs missing** (ignore `unknown_legacy`) × **print vs digital** × **paid vs unpaid**, after excluding QA/smoke sessions.

Only after that: open the single smallest product ticket implied by the decision table (e.g. traffic-quality if mostly `missing`; checkout trust/price/offer if mostly `browser` unpaid; print blocker if print fails before Stripe).

### Confidence

| Claim | Confidence | Why |
| --- | --- | --- |
| Loss location is after Stripe session creation (session→paid) | **High** | Consistent across 1d/7d/30d funnel counters |
| Cause is buyer abandonment vs non-buyer session noise | **Low–medium** | Handoff + QA exclusion unread |
| Print-specific offer/price is the reason print orders are absent | **Low** | Print/digital mix unread |
| Overall “ready to change product” | **Low** | Decision rules 1–3 need Stripe/admin aggregates |

## 8. Privacy

- No secrets, tokens, session IDs, emails, addresses, map contents, or raw provider payloads in this document.
- No production mutations.
- Aggregate funnel counters only.
