# STAR-002 Checkout Funnel Semantics

Status: Completed
Date: 2026-06-25
Scope: StarMapCo checkout funnel event definitions, reporting scripts, operator docs, and internal funnel dashboard wording.

## 1. Executive summary

Confirmed: STAR-001 found a real reporting semantics problem, not evidence that Stripe or Printful is broken.

The impossible funnel rates came from comparing unlike event sources:

- `checkout_started` is a client-side event fired by browser code immediately before checkout API handoff. It is browser-executed and Do Not Track gated.
- `checkout_request_received` and `checkout_session_created` are server-side `/api/checkout` operational milestones. They can be recorded without a matching client-side `checkout_started` event.
- `payment_verified` is still the paid truth metric and reconciled with Stripe paid sessions in STAR-001.

The fix clarifies reporting so server checkout volume is no longer presented as buyer checkout intent. The underlying source mix behind the high server checkout volume still needs follow-up before paid ads can scale.

## 2. Root cause of the mismatch

Confirmed: The old `qa:commerce-digest` output calculated:

- `checkout_started -> checkout_request_received`
- `checkout_started -> checkout_session_created`

Those ratios are invalid when server-side checkout events exceed browser-gated `checkout_started`.

Confirmed from code review:

- Client checkout paths call `trackFunnelStep("checkout_started", ...)` before POSTing to `/api/checkout`.
- `trackFunnelStep` posts funnel counters only when the browser can execute the call and Do Not Track is not enabled.
- `/api/checkout` records `checkout_request_received` and `checkout_session_created` server-side in both GET and POST checkout paths.
- Server-side events are operational milestones, not proof of unique human buyer intent.

Result: The STAR-001 values `checkout_started=3`, `checkout_request_received=151`, and `checkout_session_created=151` should not be interpreted as a 5033.33% buyer-intent conversion rate. They indicate mixed event sources and a need to inspect server checkout source volume.

## 3. Confirmed event definitions

| Event | Definition | Current interpretation |
| --- | --- | --- |
| `checkout_started` | Browser-side checkout intent recorded immediately before checkout API handoff | Useful as a client intent signal, but browser/DNT gated |
| `checkout_request_received` | Server-side `/api/checkout` request accepted for checkout preparation | Operational API volume, not directly comparable to client intent |
| `checkout_session_created` | Server-side successful Stripe Checkout Session creation | Operational session volume, not proof of unique buyer intent |
| `payment_verified` | Paid checkout verification, deduped by session/payment verification paths | Paid truth metric |

## 4. Event source and gating

| Event | Client-side | Server-side | Consent-gated | DNT-gated | Operational |
| --- | --- | --- | --- | --- | --- |
| `checkout_started` | Yes | No | No for funnel counter | Yes | No |
| `checkout_request_received` | No | Yes | No | No | Yes |
| `checkout_session_created` | No | Yes | No | No | Yes |
| `payment_verified` | No | Yes | No | No | Yes |

Notes:

- `checkout_started` also emits optional analytics when analytics consent allows it, but the funnel counter path does not require analytics consent.
- Browser execution, network loss, blockers, and DNT can still suppress client funnel counters.
- Server events can come from checkout API paths even when no client funnel event was captured.

## 5. Files changed

- `scripts/commerce-digest.mjs`
- `scripts/checkout-ratio-sanity.mjs`
- `scripts/checkout-daily-ratio-sanity.mjs`
- `src/app/funnel/page.tsx`
- `docs/operator-quick-reference.md`
- `docs/roadmap-status.md`
- `docs/audits/star-002-checkout-funnel-semantics.md`

## 6. Tests/checks run

Passed:

- `node --check scripts\commerce-digest.mjs`
- `node --check scripts\checkout-ratio-sanity.mjs`
- `node --check scripts\checkout-daily-ratio-sanity.mjs`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run qa:checkout-ratio-sanity -- --no-probe`
- `npm.cmd run qa:commerce-digest -- --days 14`
- `node scripts\checkout-daily-ratio-sanity.mjs --days 7`

## 7. Before/after funnel interpretation

Before:

- `checkout_started=3`
- `checkout_request_received=151`
- `checkout_session_created=151`
- `payment_verified=2`
- Reporting printed impossible client-intent-to-server rates.

After:

- `qa:commerce-digest` labels checkout events by source and refuses to calculate client-intent-to-server conversion rates.
- `qa:checkout-ratio-sanity` includes `checkout_started` and warns when server session volume exceeds client checkout intent.
- `qa:checkout-daily-ratio-sanity` labels session counts as server session volume.
- The internal funnel page shows client checkout intent from previews, then server session creation from server requests.

Latest live evidence after the change:

- Last 14 days: `preview_started=114`, `checkout_started=3`, `checkout_request_received=151`, `checkout_session_created=151`, `payment_verified=2`.
- `api request -> session created` is `100.00% (151/151)`.
- `server session created -> paid` is `1.32% (2/151)`.
- The report now prints: server checkout volume exceeds client checkout intent; do not treat this as a conversion rate.

## 8. Paid ads recommendation

No-go for scaling paid ads.

The payment and fulfillment path still appears capable of producing real paid print orders, but ad-readiness requires knowing whether high server checkout volume represents real buyer activity, repeated/direct checkout attempts, recovery links, bots, prefetches, reloads, or another source.

Small controlled traffic tests may be reasonable only if they are explicitly treated as diagnostic traffic, not scale.

## 9. Remaining unknowns

Unknown:

- Exact source mix behind the 151 server checkout sessions.
- Whether direct GET checkout paths, POST checkout paths, recovery links, bots, reloads, or retries dominate the server session volume.
- Whether server session counts represent unique people, repeat sessions, or automated/system activity.
- Whether `checkout_started` is undercounted from DNT, browser blockers, network loss, or missing client instrumentation in one checkout path.
- Whether checkout recovery or direct checkout links are creating sessions without preview/customer intent.

## 10. Recommended next ticket

STAR-003: Server checkout source breakdown and unique-session diagnostics.

Goals:

- Break `checkout_request_received` and `checkout_session_created` down by source, method, order type, and route.
- Distinguish GET checkout redirects from POST checkout requests.
- Add or expose safe read-only counts for unique Stripe Checkout Sessions, repeated session creation, and source labels.
- Keep `payment_verified` reconciled to Stripe paid sessions.
- Do not change Stripe behavior, prices, Printful behavior, production settings, or ad settings.
