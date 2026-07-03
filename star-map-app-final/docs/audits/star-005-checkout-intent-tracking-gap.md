# STAR-005 Client-Side Checkout-Intent Tracking Gap Investigation

Status: Complete
Date: 2026-07-03
Scope: Investigate why live STAR-004 data shows server checkout sessions but almost no `checkout_started` client-intent funnel events.

## 1. Executive summary

Confirmed: All primary browser checkout paths call `trackFunnelStep("checkout_started", ...)` immediately before `POST /api/checkout`.

Confirmed: `checkout_started` funnel counters are client-only and DNT-gated. Server checkout milestones (`checkout_request_received`, `checkout_session_created`) are recorded server-side on every successful `/api/checkout` path regardless of client instrumentation.

Confirmed: The STAR-004 gap is **not explained by a missing `trackFunnelStep` call** in the main digital or print UI flows.

Most likely explanation: **most live checkout POST volume is not paired with a successful client funnel beacon**, either because traffic is direct/automated `POST /api/checkout` (after `POST /api/maps`) without going through instrumented UI, and/or because DNT suppresses the client counter while server checkout still succeeds.

Not supported as primary cause: missing print/digital wiring, duplicate-session idempotency bugs, server checkout blockers, or GET checkout probe volume in the post-deploy window.

Recommended next ticket: **STAR-006 — checkout POST origin diagnostic** (smallest evidence-supported follow-up). Determine how much checkout volume is browser-handoff vs direct API POST before changing UX, pricing, recovery, or bot filtering.

Paid ads remain no-go.

## 2. STAR-004 context

Final 7-day rollup (2026-06-27 through 2026-07-03):

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 30 |
| Unique safe context IDs | 30 |
| Blank safe context IDs | 0 |
| Duplicate context clusters | 0 |
| Paid sessions | 0 |
| Unpaid sessions | 30 |
| `checkout_request_received` | 30 |
| `checkout_session_created` | 30 |
| `checkout_started` | 1 |
| Server checkout blockers (7d) | 0 |
| Stripe / funnel session coverage | 100% |
| Post-deploy source mix | mostly `checkout_api_digital_post` |
| `preview_started` (7d) | 83 |

The unresolved signal: **30 server checkout sessions vs 1 client `checkout_started`**, while `preview_started` is healthy at 83.

## 3. Investigation questions and answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | Where is `checkout_started` supposed to be emitted? | Via `trackFunnelStep("checkout_started", ...)` in `src/lib/analytics.ts`, which posts to `/api/analytics/funnel` when `canTrackFunnelCounters()` passes (browser present, DNT off). |
| 2 | Which checkout buttons or flows call it? | `EditorExperience.startCheckout`, `SimplifiedEditor` HD export/checkout, `DownloadClient` print checkout, `SuccessClient` digital add-on checkout. |
| 3 | Does the digital path emit it before `/api/checkout`? | **Yes.** All digital browser paths call `trackFunnelStep("checkout_started", ...)` immediately before `fetch("/api/checkout", { method: "POST", ... })`. |
| 4 | Does the print path emit it before `/api/checkout`? | **Yes.** `EditorExperience` print checkout and `DownloadClient` print checkout both call `trackFunnelStep` immediately before the POST. |
| 5 | Is the event DNT-gated, consent-gated, browser-gated, or skipped by design? | **DNT-gated** for funnel counters (`canTrackFunnelCounters`). **Consent-gated** only for PostHog/GA analytics via `track()` / `trackBeginCheckout`, not for funnel counters. **Skipped by design** on server-side `/api/checkout` — server never emits `checkout_started`. |
| 6 | Is `checkout_started` client-only while server checkout events are server-side? | **Yes.** Confirmed in STAR-002 and code. Server records `checkout_request_received` and `checkout_session_created` in `src/app/api/checkout/route.ts`. |
| 7 | Are any checkout paths bypassing the client event and going directly to `/api/checkout`? | **No wired UI path bypasses `trackFunnelStep`.** However, `/api/checkout` POST is a public API and can be called directly by scripts, probes, or automation after `POST /api/maps`, with no client funnel event. |
| 8 | Are failures swallowed silently before event recording? | In `EditorExperience`, `trackFunnelStep("checkout_started")` runs only after map save / print preflight succeeds — immediately before the checkout POST. Earlier failures record `trackCheckoutClientDiagnostic` instead. Funnel beacon failures are fire-and-forget (`sendBeacon` / `fetch().catch(() => {})`) and would not block checkout. |
| 9 | Can server checkout be correlated without `checkout_started`? | **Partially yes.** Stripe session metadata includes `map_id` (safe context ID). Funnel `preview_started` and `checkout_request_received` carry `source` dimensions. There is no shared client handoff token today tying a browser click to a server checkout POST. |
| 10 | Smallest safe fix or next diagnostic? | **No code fix required in STAR-005.** Next: STAR-006 origin diagnostic to measure browser-handoff vs direct API checkout POST volume. |

## 4. Where `checkout_started` is emitted

### Funnel counter path (what commerce digest counts)

`trackFunnelStep("checkout_started", ...)` in `src/lib/analytics.ts`:

- Checks `canTrackFunnelCounters()` → requires browser + DNT off.
- Does **not** require analytics consent.
- Posts JSON to `/api/analytics/funnel` via `sendBeacon` (fallback `fetch` with `keepalive`).
- `recordFunnelStep` increments KV counters used by `qa:commerce-digest` and `qa:checkout-source-diagnostics`.

### Analytics-only path (not the funnel counter)

These emit PostHog/GA `checkout_started` or `begin_checkout` when analytics consent allows, but **do not** increment funnel `checkout_started`:

- `track("checkout_started", ...)` in `EditorExperience.startCheckout` at checkout entry (before map save).
- `trackBeginCheckout(...)` in `EditorExperience`, `DownloadClient`, `SuccessClient` (after funnel step or around redirect).

This split is intentional per STAR-002: funnel `checkout_started` was tightened to fire immediately before checkout API handoff.

## 5. Client checkout call sites

| File | Flow | `trackFunnelStep("checkout_started")` | `POST /api/checkout` |
| --- | --- | --- | --- |
| `src/components/EditorExperience.tsx` | Main editor digital + print | Yes, line ~1647, after map/print preflight | Yes, line ~1662 |
| `src/components/SimplifiedEditor/SimplifiedEditor.tsx` | `/simple-test` simplified editor | Yes, line ~606 | Yes, line ~613 |
| `src/app/download/DownloadClient.tsx` | Download page print upsell | Yes, line ~1168 | Yes, line ~1173 |
| `src/app/success/SuccessClient.tsx` | Post-purchase digital add-on | Yes, line ~260 | Yes, line ~268 |

Production buyer flow uses `EditorExperience` on `/editor` (`src/app/editor/EditorPageClient.tsx`). `SimplifiedEditor` is limited to `/simple-test`.

No other `src/` call sites POST to `/api/checkout`.

## 6. Server checkout recording

`src/app/api/checkout/route.ts`:

| Method | Records `checkout_request_received` | Records `checkout_session_created` | Typical `checkout_source` |
| --- | --- | --- | --- |
| POST | Yes | Yes | `checkout_api_digital_post` / `checkout_api_print_post` |
| GET | No | Yes (+ `checkout_redirected`) | `checkout_api_digital_get` / `checkout_api_print_get` |

STAR-004 post-deploy window showed **POST-only** labeled volume with **0 GET** in recent days. Server funnel events therefore come from POST handler paths that do not require a preceding client `checkout_started`.

## 7. Why server checkout can happen without `checkout_started`

### A. Design / measurement asymmetry (confirmed)

Client `checkout_started` is optional from the server's perspective. Server checkout always records operational milestones when `/api/checkout` succeeds. This is documented in STAR-002.

### B. Direct API POST volume (most likely dominant cause)

`/api/checkout` POST and `/api/maps` POST are callable without browser UI. A script can:

1. `POST /api/maps` with a recipe JSON body.
2. `POST /api/checkout` with `{ mapId, plan: "single" }`.

That produces `checkout_request_received` + `checkout_session_created` + Stripe sessions labeled `checkout_api_digital_post`, with **zero** client `checkout_started`.

Evidence supporting this over a UI wiring bug:

- `preview_started` = 83 vs `checkout_started` = 1 over the same 7-day window.
- Both use the same `trackFunnelStep` / `canTrackFunnelCounters` path.
- If DNT alone explained checkout undercount, preview would be similarly suppressed.
- STAR-004 showed unique map-based context IDs (no duplicate clusters) consistent with automated one-map-one-session probing.

### C. DNT / beacon loss (secondary)

- DNT disables funnel counters but not server checkout.
- `sendBeacon` to `/api/analytics/funnel` is fire-and-forget; rare loss would not explain a 30:1 gap.
- Rate limit on funnel POST is 120/min/IP — not a likely bottleneck at current volume.

### D. UI wiring bug (ruled out as primary)

Code review found **no production checkout button path** that POSTs to `/api/checkout` without a preceding `trackFunnelStep("checkout_started")`.

## 8. Classification

| Hypothesis | Verdict |
| --- | --- |
| Missing `trackFunnelStep` in main UI | **Ruled out** |
| Design gap (client intent vs server ops) | **Confirmed** |
| DNT / consent effect | **Partial** — DNT affects client only; cannot explain preview vs checkout gap alone |
| Direct/automated API POST checkout | **Most likely dominant** |
| Silent client failure before event | **Possible but secondary** |
| Real abandoned buyer intent | **Not evidenced** — no paid conversions; intent signal too sparse to classify abandonment |

## 9. Correlation options without `checkout_started`

Available today:

- **Stripe `map_id` metadata** ↔ unique safe context ID in `qa:checkout-source-diagnostics`.
- **Funnel `source` dimension** on `checkout_request_received` (server labels like `checkout_api_digital_post`, not editor source like `wedding`).
- **Funnel `preview_started` by source** — browser-side, not joinable to Stripe sessions without shared ID.

Missing today:

- Client handoff token / session correlation ID passed from `trackFunnelStep` into checkout POST body or headers.

## 10. Checks run

Passed:

- `npm.cmd run lint` (0 errors, 5 pre-existing warnings)
- `npx.cmd tsc --noEmit --pretty false`

Read-only STAR-004 evidence referenced; no new production QA commands required for code-review conclusions.

## 11. Files inspected

- `src/lib/analytics.ts`
- `src/lib/funnelSteps.ts`
- `src/lib/funnel.ts`
- `src/components/EditorExperience.tsx`
- `src/components/SimplifiedEditor/SimplifiedEditor.tsx`
- `src/app/download/DownloadClient.tsx`
- `src/app/success/SuccessClient.tsx`
- `src/app/editor/EditorPageClient.tsx`
- `src/app/api/checkout/route.ts`
- `src/app/api/analytics/funnel/route.ts`
- `scripts/commerce-digest.mjs`
- `scripts/checkout-source-diagnostics.mjs`
- `docs/audits/star-002-checkout-funnel-semantics.md`
- `docs/audits/star-003-checkout-source-diagnostics.md`
- `docs/audits/star-004-checkout-source-observation-window.md`

## 12. Files changed

- `star-map-app-final/docs/audits/star-005-checkout-intent-tracking-gap.md` (this document)

No app/source code changes. No production behavior changes.

## 13. Paid ads status

**No-go** for scaling paid ads.

Reason: buyer-intent quality remains unresolved. Server checkout volume still cannot be treated as human checkout intent.

## 14. Recommended next step

**STAR-006: Checkout POST origin diagnostic**

Smallest evidence-supported next ticket. Do not jump to pricing, UX redesign, cancel recovery, or bot filtering yet.

Goals:

- Measure how many `checkout_api_digital_post` sessions include signals of instrumented browser handoff vs bare API POST.
- Optionally add a narrow, documented client handoff token from `trackFunnelStep` into checkout POST for correlation (diagnostic-first, not a redesign).
- Correlate Stripe `map_id` sessions to map-creation timing/source if available.
- Answer: is live checkout volume mostly human browser flow with lost beacons, or mostly direct API traffic?

Do not scale paid ads until origin mix is understood.
