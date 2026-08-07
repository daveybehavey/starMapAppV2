# Purchase & commerce analytics

How paid conversions are recorded across GA4, PostHog, internal funnel counters, and Stripe — and how to verify without double-counting QA traffic.

## Source of truth

| Layer                                  | Primary trigger                                                                                                               | Dedupe key                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Entitlements**                       | Stripe `checkout.session.completed` webhook                                                                                   | `stripe:session:{id}` in KV                  |
| **GA4 `purchase` (server)**            | `recordPaymentVerifiedOnce` → `recordGa4PurchaseOnce` (webhook or `/api/stripe/verify`)                                       | KV `ga4:mp:purchase:{session_id}`            |
| **GA4 `purchase` (browser)**           | `/success` → `trackPurchaseCompleted` when server MP is **off** or **$0** paid total                                          | `sessionStorage` `ga4:purchase:{session_id}` |
| **PostHog `purchase`**                 | Client on `/success` (always when consent; never duplicates GA4 when `NEXT_PUBLIC_GA4_SERVER_PURCHASES=true` for paid orders) | Same sessionStorage key as client GA4        |
| **Internal funnel `payment_verified`** | Same as GA4 server path                                                                                                       | KV `funnel:payment_verified:session:{id}`    |

Webhook is authoritative for entitlements. GA4 Measurement Protocol runs on first successful `recordPaymentVerifiedOnce` (webhook or verify, whichever wins dedupe). Client GA4 is suppressed for **paid** checkouts when `NEXT_PUBLIC_GA4_SERVER_PURCHASES=true` (see `wrangler.toml`); **$0** promos still fire browser `purchase` so free conversions appear in Realtime.

## Event names (verification)

### GA4 (Realtime → Events)

| Event            | When                                                       |
| ---------------- | ---------------------------------------------------------- |
| `begin_checkout` | Paywall / editor handoff (`trackBeginCheckout`)            |
| `purchase`       | Paid conversion (server MP and/or browser per rules above) |
| `page_view`      | SPA navigations with consent                               |

Imported to Google Ads as **Purchase** — event name must stay `purchase` (see `docs/ADS_RELAUNCH_SETUP.md`).

### PostHog

| Event              | Properties                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| `checkout_started` | `value`, `currency`, `order_type`, `plan`, `print_variant`, `source`              |
| `purchase`         | `transaction_id`, `revenue`, `value`, `currency`, `order_type`, …                 |
| `purchase_success` | Legacy success-page signal (`isPaid`, `orderType`) — keep for existing dashboards |
| `funnel_step`      | Internal step names from `funnelSteps.ts`                                         |

Enable **Revenue analytics** on the `purchase` event using the `revenue` property.

## QA / live automation exclusion

Sessions are **not** sent to GA4 MP, internal `payment_verified`, or client purchase tracking when:

- Stripe metadata `qa_run=true` (set by `scripts/live-conversion-qa.mjs` / print QA), or
- `qa_source` starts with `live_conversion` / `live_print_conversion`, or
- Legacy `client_reference_id=qa-live-conversion` (no longer used for map id).

Real QA checkouts should use a real map UUID in metadata (`map_id`) plus the flags above.

## Attribution (UTM / Google Ads)

1. Landing UTMs → `POST /api/marketing-attribution` → httpOnly `starmap_ref_src` cookie (`UtmAttributionClient`).
2. Checkout → Stripe session metadata `marketing_source`, `marketing_medium`, `marketing_campaign`, `marketing_content` (all orders, not only referral-code checkouts).
3. Google Ads **auto-tagging** supplies `gclid` on the landing URL; GA4 attributes via linked Ads property when auto-tagging is on.

Referral-program fields (`referral_*`) still require a referral code.

## Env vars (no secrets in docs)

| Variable                           | Role                                          |
| ---------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_GA_ID`                | GA4 measurement ID (browser + MP)             |
| `GA4_API_SECRET`                   | Measurement Protocol (Wrangler secret)        |
| `NEXT_PUBLIC_GA4_SERVER_PURCHASES` | `true` → paid purchases server-primary        |
| `NEXT_PUBLIC_POSTHOG_KEY`          | Browser PostHog                               |
| `FUNNEL_DASHBOARD_TOKEN`           | Optional auth for `GET /api/analytics/funnel` |

### Checkout classification aggregates (#215)

`GET /api/analytics/funnel` includes `data.checkoutClassification` — fixed-allowlist KV aggregates for print vs digital checkout sources, plan/print-variant mix, and handoff class. Operators can diagnose conversion mix **without Stripe credentials**.

- Cumulative source/plan totals preserve pre-existing counters; 1d/7d/30d windows use daily keys written going forward.
- Handoff keys: `browser` = **browser handoff (not verified human)** (token present only); `missing` = **missing/direct handoff**. Do **not** treat `browser` as a buyer/unique-human count.
- Authenticated QA (`qaContext.enabled`) does **not** increment these counters, but **untagged research/internal/browser activity can still be counted**. Controlled live checkout probes must use the existing QA-tagged path; ordinary research must stop before session creation.
- Only `browser` | `missing` handoff labels are stored/returned — never raw handoff tokens, emails, Stripe IDs, map IDs, or marketing-source enumeration.

Missing GA4/PostHog keys: checkout and webhooks **still succeed**; analytics calls no-op with console warn (MP only).

## Manual verification

1. `npm run qa:live-critical`
2. Real or staging purchase with consent → GA4 Realtime `purchase` + PostHog `purchase` with `transaction_id` = Stripe `cs_…`
3. `npm run qa:live-conversion` → confirm **no** production `purchase` spike (QA excluded)
4. `npm run qa:ga4-mp-probe` — optional MP smoke (also in `qa:growth-weekly` via `ga4-mp-probe-optional`)

## Success-page consent nudge

If the customer completes checkout before choosing **Allow** on the cookie banner, `trackPurchaseCompleted` stores the payload in `sessionStorage` (`ga4:pending-purchase`). On `/success`, a short inline prompt offers **Allow analytics** (fires `flushPendingGa4Purchase` and enables PostHog) or **No thanks**. Server Measurement Protocol still records paid orders when `GA4_API_SECRET` is set — the nudge mainly helps browser GA4/PostHog alignment.

## Troubleshooting

| Symptom                                              | Likely cause                                       | Fix                                                                                |
| ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Internal funnel shows paid, GA4 shows 0–1 `purchase` | Missing/wrong `GA4_API_SECRET` on Worker           | `npx wrangler secret list`; set secret; `npm run qa:ga4-mp-probe` locally          |
| GA4 Realtime empty after $0 promo                    | Browser `purchase` only with **analytics consent** | Accept cookies on site; or rely on server MP (uses catalog value when total is $0) |
| `npm run qa:live-conversion` but no GA4 spike        | Expected — `qa_run` metadata excludes QA           | Use **manual** checkout to validate Realtime                                       |
| PostHog has no `purchase`                            | Consent off                                        | `localStorage.setItem('analytics-consent','true')` or accept banner                |
| Ads shows clicks, GA4 shows 0 `google/cpc` purchases | Import/linking/UTM                                 | `docs/ADS_RELAUNCH_SETUP.md`, `docs/TIER0_VALIDATION.md`                           |

Server MP logs `GA4 Measurement Protocol skipped: missing NEXT_PUBLIC_GA_ID or GA4_API_SECRET` when misconfigured — checkout still completes.

## Related

- `docs/COMMERCIAL_METRIC_DICTIONARY.md` — commercial metric definitions, reconciliation matrix, and #173 Phase 1 measurement contract
- `docs/PURCHASE_FUNNEL_AUDIT.md` — access/checkout P0–P2
- `docs/ADS_RELAUNCH_SETUP.md` — Ads ↔ GA4 import
