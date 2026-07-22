# Commercial metric dictionary and source-of-truth map

**Parent program:** GitHub #173 (measured revenue operating program)  
**Issue:** #179  
**Base `main` SHA (refreshed):** `f8f47ff7733fc2e419d03c746b8836770a1593bc`  
**Initial discovery audit SHA:** `67ede17f35de9ee23e7278e209c11983aa7da4d8`  
**Scope:** Discovery and documentation only. No production data access. No invented financial values.  
**Aligns with:** `PURCHASE_ANALYTICS.md`, `GOAL_10K_2026.md`, `GROWTH_OPS_WEEKLY.md`, `block-1.5-funnel-read.md`, STAR-001–006 audits, #173 Phase 1.

This document is the **measurement contract** for ranking SEO, UX, imagery, outreach, referral, coupon, promotion, or checkout work by expected **net contribution**. It does not create a parallel Business OS.

---

## Conventions

| Field | Meaning |
| --- | --- |
| **Availability** | `available` · `partial` · `missing` · `requires human authorization/export` |
| **Confidence** | `high` (code + ops scripts agree) · `medium` (instrumented but gated/ambiguous) · `low` (proxy or estimate only) · `n/a` (missing) |
| **Privacy** | `aggregate` (counts/sums, no PII) · `operational PII` (email/session in KV/Stripe — never commit) · `financial export` (human-only dashboards) · `advertising export` |
| **Timezone** | Funnel daily keys and digest windows use **UTC** date keys (`YYYY-MM-DD` from `Date.toISOString()`). |
| **Currency** | Stripe session `amount_total` / `currency`; GA4/PostHog purchase value in session currency (typically **USD** for live catalog). Margin env vars are **cents**. |
| **Owner/reviewer** | Default **owner** = product/ops human; **reviewer** = independent Codex review on PRs that change this contract. Agents may propose edits; humans approve financial definitions. |

### Net contribution (program definition from #173)

```text
collected revenue
  − refunds / chargebacks
  − payment fees
  − Printful / fulfillment cost
  − shipping subsidies
  − paid acquisition
  − other order-variable costs
= pre-fixed-cost net contribution

pre-fixed-cost net contribution − fixed operating costs
= cash remaining after fixed costs
```

Private monthly net targets are **not** recorded in this repository.

### QA exclusion (applies to paid commercial metrics)

Do **not** count sessions where Stripe metadata indicates QA (`qa_run=true`, `qa_source` prefixes `live_conversion` / `live_print_conversion`, or legacy `client_reference_id=qa-live-conversion`). See `PURCHASE_ANALYTICS.md` and `commerceAnalyticsQa.mjs`.

---

## 1. Funnel metrics

### 1.1 Qualified session

| Field | Value |
| --- | --- |
| **Definition** | A browser session that lands on a commerce-relevant surface with enough intent signal to enter the measured funnel. **Unresolved exact rule** pending baseline issue (see §6): interim proxy = unique `landing_view` funnel step **or** GA4 session on money pages (`/`, `/wedding`, `/editor`, gift/SEO money pages). |
| **Formula** | Interim: count of `landing_view` KV increments in window; secondary: GA4 sessions filtered to site. Do not sum KV + GA4. |
| **Unit / grain** | Sessions / day or rolling 7/14/30/90d UTC |
| **Primary source** | Internal funnel KV (`funnel:total:landing_view`, daily keys) via `GET /api/analytics/funnel` |
| **Secondary** | GA4 sessions (consent + property); PostHog `$pageview` / `landing_view` when consented |
| **Repo association** | `FUNNEL_STEPS` → `landing_view`; `LandingViewTracker`; `POST /api/analytics/funnel` |
| **Dedupe / attribution** | Client once-per-session intent for landing tracker; source dimension when passed (`funnel:source:landing_view:{source}`) |
| **TZ / currency** | UTC counts; N/A currency |
| **Privacy** | aggregate |
| **Availability** | `partial` — event exists; “qualified” vs raw landing not formally distinguished |
| **Confidence** | medium |
| **Owner / reviewer** | Owner: product; Reviewer: Codex on definition PRs |

### 1.2 Editor start

| Field | Value |
| --- | --- |
| **Definition** | User enters the editor experience with preview/create intent. |
| **Formula** | Count `preview_started` funnel steps in window. |
| **Unit / grain** | Events / UTC day or window |
| **Primary source** | Funnel KV `preview_started` |
| **Secondary** | PostHog `funnel_step` / `preview_started`; optional `preview_start_submit` |
| **Repo association** | `EditorExperience` → `trackFunnelStep("preview_started")`; `funnelSteps.ts` |
| **Dedupe / attribution** | Optional `source`, `plan`; not session-deduped server-side |
| **TZ / currency** | UTC; N/A |
| **Privacy** | aggregate (+ optional source string) |
| **Availability** | `available` |
| **Confidence** | high |
| **Owner / reviewer** | Owner: product; Reviewer: Codex |

### 1.3 Valid editor state

| Field | Value |
| --- | --- |
| **Definition** | Editor has a usable map recipe (location + date + title or equivalent required fields) ready for preview/render. |
| **Formula** | **Unresolved.** No dedicated funnel step named for “valid state.” Closest proxies: successful `editor_reveal` or presence of `map_id` before checkout. |
| **Unit / grain** | Events / window |
| **Primary source** | `missing` as first-class metric |
| **Secondary** | Client validation in `EditorExperience` / SimplifiedEditor (behavior only) |
| **Repo association** | None as commercial counter |
| **Dedupe / attribution** | N/A |
| **TZ / currency** | N/A |
| **Privacy** | N/A |
| **Availability** | `missing` (ambiguous — mark unresolved) |
| **Confidence** | n/a |
| **Owner / reviewer** | Owner: product (must define before 30/60/90 baseline) |

### 1.4 Preview attempt

| Field | Value |
| --- | --- |
| **Definition** | User initiates map preview generation. |
| **Formula** | Same as editor start for current instrumentation: `preview_started`. If later split, attempt = start of generate; success = reveal. |
| **Unit / grain** | Events / window |
| **Primary source** | Funnel KV `preview_started` |
| **Secondary** | PostHog |
| **Repo association** | `trackFunnelStep("preview_started")` |
| **Dedupe / attribution** | As 1.2 |
| **TZ / currency** | UTC; N/A |
| **Privacy** | aggregate |
| **Availability** | `partial` — collapsed with editor start today |
| **Confidence** | medium |
| **Owner / reviewer** | Owner: product |

### 1.5 Successful preview

| Field | Value |
| --- | --- |
| **Definition** | Circular night-sky map successfully revealed to the user. |
| **Formula** | Count `editor_reveal` funnel steps. |
| **Unit / grain** | Events / window |
| **Primary source** | Funnel KV `editor_reveal` |
| **Secondary** | PostHog `funnel_step` / reveal events |
| **Repo association** | `EditorExperience`, `MobileCreate` → `trackFunnelStep("editor_reveal")` |
| **Dedupe / attribution** | Optional `source` |
| **TZ / currency** | UTC; N/A |
| **Privacy** | aggregate |
| **Availability** | `available` |
| **Confidence** | high |
| **Owner / reviewer** | Owner: product |

### 1.6 Add-to-cart or paid-download intent

| Field | Value |
| --- | --- |
| **Definition** | User opens paywall or selects a paid digital/print option with intent to purchase (not yet Stripe session). |
| **Formula** | Prefer PostHog/GA: `paywall_opened` / `paywall_view` + `print_option_clicked` / GA `select_item` / `view_item_list`. Pinterest `addtocart` is marketing-only, not commercial SOT. |
| **Unit / grain** | Events / window |
| **Primary source** | PostHog `paywall_opened` (when consent) + GA4 ecommerce list events |
| **Secondary** | Funnel steps `preview_checkout_nudge_shown` / `_clicked` — **defined in `funnelSteps.ts` but no emitters found at audited SHA** |
| **Repo association** | `EditorExperience` (`paywall_opened`, `print_option_clicked`); `PaywallModal` (`view_item_list`, `select_item`); `pinterestTag.ts` |
| **Dedupe / attribution** | Consent-gated analytics; `intent` on `paywall_opened` incomplete for manual opens (STAR audits) |
| **TZ / currency** | UTC; catalog currency on ecommerce payloads |
| **Privacy** | aggregate (consent-gated) |
| **Availability** | `partial` |
| **Confidence** | medium |
| **Owner / reviewer** | Owner: product |

### 1.7 Checkout start

| Field | Value |
| --- | --- |
| **Definition** | Buyer intent to start Stripe Checkout, recorded immediately before `/api/checkout` handoff. |
| **Formula** | Count client funnel `checkout_started` **or** GA4 `begin_checkout` / PostHog `checkout_started`. **Do not** treat `checkout_request_received` / `checkout_session_created` as buyer intent (STAR-002). |
| **Unit / grain** | Events / window |
| **Primary source (intent)** | Client funnel `checkout_started` + PostHog/GA `begin_checkout` |
| **Operational volume (not intent)** | Server KV `checkout_request_received`, `checkout_session_created` via `/api/checkout` |
| **Repo association** | `trackBeginCheckout` / `trackFunnelStep("checkout_started")`; `/api/checkout` |
| **Dedupe / attribution** | Client DNT-gated for funnel beacon; server operational counters ungated; Stripe metadata `checkout_source`, `marketing_*` |
| **TZ / currency** | UTC; checkout value/currency on analytics payloads |
| **Privacy** | aggregate |
| **Availability** | `available` (with semantics caveat) |
| **Confidence** | medium (gating); high for definition clarity |
| **Owner / reviewer** | Owner: product; Reviewer: Codex |

### 1.8 Successful payment

| Field | Value |
| --- | --- |
| **Definition** | Stripe Checkout Session paid; entitlement granted. |
| **Formula** | Unique paid non-QA Checkout Sessions. Funnel: `payment_verified` once per `session_id`. Revenue: sum `amount_total` of production paid sessions. |
| **Unit / grain** | Orders and currency minor units / window |
| **Primary source** | Stripe (`checkout.session.completed` → KV `stripe:session:{id}`); funnel `payment_verified` |
| **Secondary** | GA4 server `purchase` (MP dedupe `ga4:mp:purchase:{session_id}`); PostHog `purchase` on `/success` when consent |
| **Repo association** | `/api/stripe/webhook`, `/api/stripe/verify`, `recordPaymentVerifiedOnce`, `PURCHASE_ANALYTICS.md` |
| **Dedupe / attribution** | Session-id dedupe across webhook and verify; QA exclusion |
| **TZ / currency** | Stripe timestamps; session currency |
| **Privacy** | operational PII in Stripe/KV — exports human-only |
| **Availability** | `available` |
| **Confidence** | high |
| **Owner / reviewer** | Owner: ops/product |

### 1.9 Payment-return access

| Field | Value |
| --- | --- |
| **Definition** | Customer reaches post-payment success/verify path and session is confirmed paid (cookie / verify / claim). |
| **Formula** | Successful `/api/stripe/verify` or success-page paid path for session; entitlement `paid=true` on `stripe:session:{id}`. |
| **Unit / grain** | Sessions / window |
| **Primary source** | Stripe session entitlement KV |
| **Secondary** | `/success` client flows; access emails |
| **Repo association** | `/api/stripe/verify`, `SuccessClient`, `post-purchase-access-architecture.md` |
| **Dedupe / attribution** | Session id |
| **TZ / currency** | UTC; N/A for access count |
| **Privacy** | operational PII |
| **Availability** | `partial` — entitlement exists; no dedicated aggregate “return access” counter in funnel digest |
| **Confidence** | medium |
| **Owner / reviewer** | Owner: product |

### 1.10 Download access

| Field | Value |
| --- | --- |
| **Definition** | Customer starts or completes HD download for an entitled session. |
| **Formula** | `download_started` / `download_completed` funnel steps; failures via `download_failed`. |
| **Unit / grain** | Events / window |
| **Primary source** | Funnel KV download steps |
| **Secondary** | PostHog; R2 HD archive presence (ops, not metric) |
| **Repo association** | `DownloadClient`, `EditorExperience`; claim tokens per access architecture |
| **Dedupe / attribution** | Not payment-session deduped in funnel totals |
| **TZ / currency** | UTC; N/A |
| **Privacy** | aggregate |
| **Availability** | `available` |
| **Confidence** | high for events; medium for “unique entitled buyers who downloaded” |
| **Owner / reviewer** | Owner: product |

### 1.11 Fulfillment submitted

| Field | Value |
| --- | --- |
| **Definition** | Print order accepted/submitted to Printful for a paid print session. |
| **Formula** | Print order record `status` transitions to `sent` (or equivalent submit success path). |
| **Unit / grain** | Orders / window |
| **Primary source** | App print order KV (`print:order:{sessionId}`) + Printful API submit paths |
| **Secondary** | Printful dashboard (**human export**) |
| **Repo association** | `printOrders.ts`, print fulfillment libs, `qa:print-ops` |
| **Dedupe / attribution** | One print order per paid print session (typical) |
| **TZ / currency** | UTC ops timestamps; costs in cents env estimates |
| **Privacy** | operational PII (shipping) — never commit |
| **Availability** | `available` (status `pending` \| `sent` \| `failed`) |
| **Confidence** | high for status enum; medium vs full Printful lifecycle |
| **Owner / reviewer** | Owner: ops |

### 1.12 Fulfilled

| Field | Value |
| --- | --- |
| **Definition** | Print package shipped (carrier handoff). |
| **Formula** | Printful webhook `package_shipped` handled → shipping notification path. Treat as **shipped**, not customer doorstep delivery. |
| **Unit / grain** | Orders / window |
| **Primary source** | `/api/printful/webhook` `package_shipped` |
| **Secondary** | Printful dashboard |
| **Repo association** | `printfulWebhookOrderEvents.ts`, shipping notification helpers |
| **Dedupe / attribution** | Resolve to Stripe session / print order |
| **TZ / currency** | Event time; N/A |
| **Privacy** | operational PII |
| **Availability** | `partial` — shipped signal available; not rolled into commerce-digest as a first-class conversion column beyond print ops |
| **Confidence** | medium |
| **Owner / reviewer** | Owner: ops |

### 1.13 Delivered

| Field | Value |
| --- | --- |
| **Definition** | Carrier confirms delivery to recipient. |
| **Formula** | **Unresolved / missing** in app. No Printful `delivered` (or equivalent) handler in audited webhook allowlist (`package_shipped`, `order_failed`, `order_canceled`, `order_put_hold`). |
| **Primary source** | `missing` |
| **Secondary** | Carrier/Printful human export if needed later |
| **Availability** | `missing` |
| **Confidence** | n/a |
| **Owner / reviewer** | Owner: ops (defer unless support/refund rate requires it) |

### 1.14 Recovery-attributed checkout/payment

| Field | Value |
| --- | --- |
| **Definition** | Paid Checkout Session that completed after Stripe Checkout recovery (expired-session recovery URL / recovery email). |
| **Formula** | **Unresolved.** Code sends recovery email on `checkout.session.expired` and stores `recoveryUrl` / `recoveryEmail*` on session record; **no** paid-session flag or digest bucket for “recovered then paid.” |
| **Primary source** | `missing` as attributed commercial metric |
| **Secondary** | Stripe recovery + Dashboard (**human**); `scripts/recovery-email-diag.mjs` (ops diagnostic, needs secrets) |
| **Repo association** | Stripe webhook expired path; `checkoutRecoveryAlerts`; funnel `checkout_expired` |
| **Availability** | `partial` for expiry/email send; `missing` for attributed paid recovery |
| **Confidence** | n/a for attributed revenue |
| **Owner / reviewer** | Owner: product |

---

## 2. Commercial outcome metrics

### 2.1 Collected revenue

| Field | Value |
| --- | --- |
| **Definition** | Gross paid Checkout Session totals for production (non-QA) StarMapCo sessions. |
| **Formula** | Σ `amount_total` for paid sessions matching StarMap metadata filters in `commerce-digest.mjs`, excluding QA. |
| **Unit / grain** | Currency minor units → dollars in scorecards; day / 7/14/30 / YTD |
| **Primary source** | Stripe Checkout Sessions API (via `qa:commerce-digest` / `qa:revenue-goal` when secrets present) |
| **Secondary** | GA4 `purchase` value (server MP preferred for paid); **do not** add GA4 + Stripe |
| **Repo association** | `scripts/commerce-digest.mjs`, `scripts/revenue-goal-scorecard.mjs`, webhook `amountTotal` |
| **Dedupe** | Session id; QA exclusion |
| **TZ / currency** | Stripe; typically USD |
| **Privacy** | financial export |
| **Availability** | `available` with secrets; `requires human authorization/export` for live reads |
| **Confidence** | high |
| **Owner / reviewer** | Owner: ops |

### 2.2 Refunds

| Field | Value |
| --- | --- |
| **Definition** | Money returned to customers against prior charges. |
| **Formula** | Stripe refund amounts on charges linked to StarMap sessions. Webhook `charge.refunded` **revokes entitlements** but digests do **not** net revenue. |
| **Primary source** | Stripe (**human export** / approved API read) |
| **Secondary** | Entitlement revoke flags on `stripe:session:*` |
| **Availability** | `partial` (ops revoke) / metric aggregates `missing` in scorecards |
| **Confidence** | low for automated commercial reporting |
| **Owner / reviewer** | Owner: ops |

### 2.3 Chargebacks

| Field | Value |
| --- | --- |
| **Definition** | Disputed charge funds lost or at risk. |
| **Formula** | Stripe dispute amounts (`charge.dispute.created` / `funds_withdrawn` handled for revoke). No rate/scorecard. |
| **Primary source** | Stripe (**human export**) |
| **Availability** | `partial` / aggregates `missing` |
| **Confidence** | low |
| **Owner / reviewer** | Owner: ops |

### 2.4 Payment fees

| Field | Value |
| --- | --- |
| **Definition** | Processor fees on collected payments. |
| **Formula** | **Estimate** used in margin guard: `PRINT_MARGIN_STRIPE_PERCENT` + `PRINT_MARGIN_STRIPE_FIXED_CENTS` (defaults documented in code as ~2.9% + 30¢). **Actual** Stripe `balance_transaction` fees not ingested. |
| **Primary source** | Estimate envs / `printMargin.ts` for guardrails; actual fees = Stripe (**human**) |
| **Availability** | `partial` (estimate) / actual `requires human authorization/export` |
| **Confidence** | low–medium |
| **Owner / reviewer** | Owner: ops |

### 2.5 Printful / fulfillment cost

| Field | Value |
| --- | --- |
| **Definition** | Variable print/production + base fulfillment cost per SKU. |
| **Formula** | Per-SKU COGS cents from env (`PRINT_COGS_*`, `MERCH_COGS_*`) used by margin guard — **configured estimates**, not live Printful invoice lines. |
| **Primary source** | Env COGS + margin scripts (`qa:print-margin`) |
| **Secondary** | Printful invoices (**human export**) |
| **Availability** | `partial` |
| **Confidence** | medium for guard; low vs true P&L until reconciled to invoices |
| **Owner / reviewer** | Owner: ops |

### 2.6 Shipping subsidy

| Field | Value |
| --- | --- |
| **Definition** | Shipping charged to customer below true shipping cost (e.g. free shipping threshold). |
| **Formula** | Session metadata `print_shipping_subsidy_cents` when free-shipping waiver applied (`printFreeShipping.ts`). Not summed in revenue-goal scorecard. |
| **Primary source** | Stripe session metadata (when present) |
| **Secondary** | Printful shipping rates vs charged |
| **Availability** | `partial` |
| **Confidence** | medium for metadata presence; low for ledger completeness |
| **Owner / reviewer** | Owner: ops |

### 2.7 Paid acquisition cost

| Field | Value |
| --- | --- |
| **Definition** | Ad spend attributed to StarMapCo campaigns in window. |
| **Formula** | Platform spend (Google Ads, etc.). **Not** stored in app KV. Docs point to **company-os** `data:pull` / Ads exports (gitignored local workspace). |
| **Primary source** | Advertising platforms (**human / company-os**) |
| **Secondary** | GA4 cost imports if linked (not verified as automated in-app) |
| **Availability** | `requires human authorization/export` |
| **Confidence** | n/a in-app |
| **Owner / reviewer** | Owner: growth |

### 2.8 Other variable order costs

| Field | Value |
| --- | --- |
| **Definition** | Packaging exceptions, promo-funded discounts beyond list, third-party email fees per order, etc. |
| **Formula** | **Unresolved.** Promo discounts appear as lower `amount_total`; not separated as “variable cost” line. |
| **Availability** | `missing` as distinct metric |
| **Confidence** | n/a |
| **Owner / reviewer** | Owner: ops |

### 2.9 Product-level contribution

| Field | Value |
| --- | --- |
| **Definition** | Per product (HD digital, unframed print, framed print, HD add-on/bundles): revenue − variable costs for that SKU mix. |
| **Formula** | Segment paid sessions by `order_type` / `plan` / `print_variant` / `print_include_digital`; apply fee estimate + COGS + subsidy. **Model not yet implemented** as a standing report. |
| **Primary source** | Stripe metadata + COGS envs |
| **Availability** | `partial` inputs / `missing` product contribution report |
| **Confidence** | low until Phase 1 child issue ships |
| **Owner / reviewer** | Owner: product |

### 2.10 Pre-fixed-cost net contribution

| Field | Value |
| --- | --- |
| **Definition** | #173 formula before fixed opex. |
| **Formula** | Requires 2.1–2.8; currently **not** computable end-to-end from app automation alone. |
| **Availability** | `missing` (blocked on refunds, fees actuals, CAC, COGS reconciliation) |
| **Confidence** | n/a |
| **Owner / reviewer** | Owner: product |

### 2.11 Cash remaining after fixed operating costs

| Field | Value |
| --- | --- |
| **Definition** | Pre-fixed-cost contribution minus fixed software/ops costs. |
| **Formula** | Fixed costs **not** in repository (intentionally private / accounting). |
| **Availability** | `requires human authorization/export` |
| **Confidence** | n/a |
| **Owner / reviewer** | Owner: beneficiary/ops |

---

## 3. Quality and exception metrics

Do **not** combine checkout expiry with checkout failure. They have different sources and availability.

| Metric | Definition | Primary source | Availability | Confidence |
| --- | --- | --- | --- | --- |
| **Expired checkout** | Stripe Checkout Session expired without payment | Funnel KV `checkout_expired` (session-deduped) via webhook `checkout.session.expired` | `available` | high |
| **Failed checkout (API / session creation / redirect)** | Checkout handoff fails before a paid session (API error, no session URL, client/network abort, margin/promo blockers, etc.) | **No** first-class `FUNNEL_STEPS` aggregate. Partial signals: `POST/GET /api/analytics/checkout-diagnostics` reason counters (incl. `checkout_failed`, `no_checkout_url`, `network_error`, …) surfaced in `qa:commerce-digest`; PostHog `checkout_failed` when consented. Server `checkout_request_received` / `checkout_session_created` are operational volume, not failure counts. | `partial` | medium for diagnostic reasons; **missing** as a single funnel-step failure rate |
| **Render failure** | HD/print render fails for download or print asset | Funnel `download_failed` (`reason=render_failed`); checkout diagnostics `print_render_failed`; PostHog | `partial` | medium |
| **Recovery failure** | Recovery email send error or customer cannot regain access | Session `recoveryEmailError`; success/download recovery PostHog events; support paths | `partial` | low–medium |
| **Reprint / damage** | Replacement print due to damage/quality | **No app metric** | `missing` | n/a |
| **Fulfillment failure** | Print order `failed` or Printful `order_failed` / cancel / hold | Print order KV + webhook | `available` | high for status; medium for root-cause taxonomy |
| **Support burden** | Tickets / time per order | **No ticket system integration in app** | `missing` | n/a |
| **Refund rate** | Refunds / paid orders | Stripe export | `requires human authorization/export` | n/a in-app |
| **Chargeback rate** | Disputes / paid orders | Stripe export | `requires human authorization/export` | n/a in-app |

---

## 4. Acquisition metrics

Channel labels for paid-session and traffic attribution. Prefer **one** primary channel per session.

| Channel | Definition | Primary source | Secondary | Availability | Notes |
| --- | --- | --- | --- | --- | --- |
| **Organic search** | Sessions/purchases from organic search | GA4/GSC (**human/company-os**); Stripe `marketing_*` when UTM present | PostHog | `partial` / export | GSC CLI exists; needs Google creds |
| **Direct** | No referrer / no campaign | GA4 | — | `requires human authorization/export` | Not first-class in KV |
| **Referral** | Referral program code **or** external referrer site — **disambiguate** | Stripe `referral_*` metadata + `qa:referral-loop` for program; GA4 for site referrers | PostHog | `partial` | Program ≠ traffic referrer |
| **Email / recovery** | Email campaigns or checkout recovery | Recovery attribution **missing**; promo list exists separately | — | `partial` / `missing` | Do not conflate promo signup with recovery revenue |
| **Paid** | Paid ads (`utm_medium=cpc` / Ads auto-tagging) | Stripe `marketing_*`; GA4 + Google Ads link | Ads exports | `partial` | Spend separate (§2.7) |
| **Other / unknown** | Unclassified | Default bucket when metadata empty | — | `available` as residual | `commerce-digest` marketing_source buckets |

**Attribution rules (repo evidence):**

1. Landing UTMs → `POST /api/marketing-attribution` → httpOnly `starmap_ref_src`.
2. Checkout copies `marketing_source|medium|campaign|content` onto Stripe session metadata.
3. GA4 Ads attribution via auto-tagging / linked property (`PURCHASE_ANALYTICS.md`).
4. **Do not** double-count the same purchase in Stripe revenue + GA4 revenue + PostHog revenue.

---

## 5. Source-of-truth and reconciliation matrix

| Domain | Primary (authoritative) | Secondary (validation) | Must not double-count | Reconciliation rule |
| --- | --- | --- | --- | --- |
| **Entitlement / paid rights** | Stripe webhook → KV `stripe:session:{id}` | `/api/stripe/verify` | Verify vs webhook | First `recordPaymentVerifiedOnce` wins; both may run, session dedupe |
| **Gross collected revenue** | Stripe paid sessions (non-QA) | GA4 MP `purchase` | Stripe $ + GA4 $ | Report Stripe as money; GA4 for ads/funnels only |
| **Funnel step volume** | KV funnel counters | PostHog `funnel_step` | Client + server unlike steps | Never ratio client `checkout_started` to server `checkout_*` as one funnel (STAR-002) |
| **Buyer checkout intent** | Client `checkout_started` / `begin_checkout` | PostHog | vs server request counts | Label server steps “operational” |
| **Ads conversion import** | GA4 `purchase` (server MP when enabled) | Stripe | — | Keep event name `purchase`; QA excluded |
| **Print fulfillment state** | App print order record + Printful webhooks | Printful dashboard | Shipped vs delivered | `package_shipped` = fulfilled/shipped; delivered missing |
| **Print margin guard** | Env COGS + fee estimates | Printful invoices (human) | Estimate vs invoice | Guard ≠ accounting P&L until reconciled |
| **Shipping subsidy** | Stripe metadata subsidy cents | Rate quotes | Subsidy + COGS | Include in contribution model once ledgered |
| **Refunds / disputes** | Stripe | Entitlement revoke | Gross vs net | Net contribution must subtract Stripe refunds/disputes (human until automated) |
| **Acquisition spend** | Ads platforms / company-os exports | GA4 cost (if any) | Spend + revenue platforms | CAC from ads export; revenue from Stripe |
| **Referral program** | Stripe `referral_*` + referral APIs | `qa:referral-loop` | vs UTM referral medium | Separate program attribution from `utm_medium=referral` |

### Known instrumentation gaps affecting reconciliation

| Gap | Impact |
| --- | --- |
| `scripts/funnel-reconcile.mjs` is **empty (0 bytes)** while `npm run qa:funnel-reconcile` / `qa:growth-weekly` still invoke it | CLI exits as a **no-op** (false sense of reconciliation); repair API `POST /api/analytics/funnel/reconcile` still exists; see §8 item 6 |
| `preview_checkout_nudge_*` steps defined, not emitted | Nudge conversion unmeasurable in KV |
| Recovery email → paid not tagged | Recovery ROI unknown |
| No net-of-refunds in `qa:revenue-goal` | North-star overstates economic revenue if refunds occur |

---

## 6. Missing measurements and ambiguous definitions

1. **Qualified session** — proxy only; needs explicit rule (page set, engagement, or bot filter).
2. **Valid editor state** — no event.
3. **Preview attempt vs editor start** — collapsed.
4. **Delivered** — no webhook/metric.
5. **Recovery-attributed payment** — send path only.
6. **Refund / chargeback $ and rates in digests** — revoke only.
7. **Actual payment fees** — estimates only.
8. **True Printful invoice COGS** — env estimates only.
9. **Shipping subsidy ledger** — metadata not scorecarded.
10. **Paid acquisition cost in-app** — external/company-os only.
11. **Other variable costs** — undefined.
12. **Product-level contribution report** — inputs partial.
13. **Pre-fixed and post-fixed net contribution** — blocked.
14. **Reprint/damage** — missing.
15. **Support burden** — missing.
16. **Funnel CLI reconcile script** — empty file; `qa:growth-weekly` still calls it as a no-op.
17. **Referral (program) vs referral (traffic)** — naming collision risk.
18. **`$10k` goal (`GOAL_10K_2026.md`)** — tracks **gross Stripe production revenue**, not #173 net contribution; treat as acquisition north star, not unit-economics success.
19. **Failed checkout aggregate** — diagnostics/PostHog exist (`partial`); no first-class `FUNNEL_STEPS` failure step comparable to `checkout_expired`. Do not report a combined “failed/expired” availability of `available`.
20. **Checkout redirect failure rate** — no dedicated server funnel counter for failed redirect after `checkout_session_created`.

---

## 7. Human-only connection / export checklist

Agents must **not** perform these without explicit approval and least privilege. Keep secrets out of GitHub.

| # | Action | Why | Output needed (aggregate only) |
| --- | --- | --- | --- |
| H1 | Authorize read-only Stripe access (or Dashboard export) for paid sessions, refunds, disputes, fees | Net revenue and loss baseline | Windowed sums by product metadata; **no** customer rows in GitHub |
| H2 | Export or approve Printful invoice/COGS sample for live SKUs | Reconcile env COGS | Per-SKU average cost vs `PRINT_COGS_*` |
| H3 | Export Google Ads spend for active campaigns | CAC / paid acquisition | Spend by campaign/day |
| H4 | Export GA4 purchase + session counts (or confirm Measurement Protocol health) | Validate ads funnel | Aggregates only |
| H5 | Export GSC top queries (or run approved `gsc:pull` / `seo:gsc:query`) | Organic baseline | Query/page aggregates |
| H6 | Confirm PostHog project access if used for funnel QA | Consent-gated validation | Event counts |
| H7 | Provide fixed monthly operating cost total (private) | Cash-after-fixed metric | Single aggregate number kept **off** public repo |
| H8 | Optional: company-os `data:pull` on a human machine | Weekly growth rhythm | Local `.data/` only (gitignored) |

**Agents may (documentation / code-adjacent, no prod mutation):** inspect repo, propose metric definitions, add docs, propose narrow follow-up issues, run offline unit/lint on doc PRs.

**Agents must not:** pull live Stripe/Printful/Ads/GA4 customer or payment data; change prices, ads, webhooks, instrumentation, or production config as part of #179.

---

## 8. Proposed narrow follow-up issues (#173 Phase 1)

Create separately reviewed child issues (do **not** expand this PR into implementation):

1. **30/60/90-day funnel baseline (read-only exports)** — Freeze definitions from §1; produce UTC windows using approved Stripe + funnel API + GA4 aggregates; explicitly document sample sizes and QA exclusion. Depends on H1/H4.
2. **Product contribution model (HD / unframed / framed / add-on)** — Spreadsheet or script design using Stripe metadata + env COGS + fee estimate; label estimates vs invoice-reconciled; no price changes.
3. **Loss and exception baseline** — Human Stripe refund/dispute export + print `failed` counts + `checkout_expired` (separate from checkout-diagnostics failure reasons); define reprint/support as unresolved until process exists.
4. **Acquisition baseline by channel** — Map `marketing_*` + GA4 channels + referral program separately; attach spend only where H3 available.
5. **Recovery attribution stub (spec only)** — Propose minimal Stripe metadata or digest rule for recovery→paid **without** shipping email copy changes until approved.
6. **Restore or retire `qa:funnel-reconcile` CLI** — Either reimplement empty `scripts/funnel-reconcile.mjs` against reconcile API or remove npm script/docs references (reliability lane; coordinate with #178 if overlapping).

---

## 9. Audited SHA and files inspected

| Role | SHA |
| --- | --- |
| Initial discovery audit | `67ede17f35de9ee23e7278e209c11983aa7da4d8` |
| Current `main` base (non-destructive refresh) | `f8f47ff7733fc2e419d03c746b8836770a1593bc` |
| This branch head | see git / PR after commit (docs-only correction on top of merge) |

Funnel-reconcile emptiness and checkout-diagnostics shape re-confirmed against `main` `f8f47ff…` (`scripts/funnel-reconcile.mjs` still 0 bytes).

### Inspected (evidence; not all modified)

**Docs:** `PURCHASE_ANALYTICS.md`, `PURCHASE_FUNNEL_AUDIT.md`, `GOAL_10K_2026.md`, `GROWTH_OPS_WEEKLY.md`, `BIG_MOVES_ROADMAP.md`, `LEVERAGE_ROADMAP.md`, `block-1.5-funnel-read.md`, `post-purchase-access-architecture.md`, `PRODUCT_EXECUTION_QUEUE.md`, `OPS_RUNBOOK.md`, `ADS_UTM_REFERENCE.md`, `ADS_RELAUNCH_SETUP.md`, `audits/star-001`…`star-006`, `docs/AGENT_OPERATING_MODEL.md` (repo root), GitHub issues #173 / #179.

**Code:** `src/lib/funnelSteps.ts`, `funnel.ts`, `analytics.ts`, `analyticsEventConvention.ts`, `commerceAnalytics.ts`, `commerceAnalyticsQa.mjs`, `marketingAttributionGa4.ts`, `ga4MeasurementProtocol.ts`, `printMargin.ts`, `printFreeShipping.ts`, `printOrders.ts`, `printfulWebhookOrderEvents.ts`, `pinterestTag.ts`, `checkoutDiagnostics` (via `/api/analytics/checkout-diagnostics`), `EditorExperience.tsx`, `PaywallModal.tsx`, `SuccessClient.tsx`, `DownloadClient.tsx`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/stripe/verify/route.ts`, `app/api/printful/webhook/route.ts`, `app/api/analytics/funnel/**`, `app/api/marketing-attribution/route.ts`.

**Scripts / package:** `scripts/commerce-digest.mjs`, `revenue-goal-scorecard.mjs`, `loop-scorecard.mjs`, `funnel-reconcile.mjs` (empty), `recovery-email-diag.mjs`, `package.json` script entries.

### Changed in this deliverable (effective PR diff)

- `star-map-app-final/docs/COMMERCIAL_METRIC_DICTIONARY.md` (this file)
- `star-map-app-final/docs/PURCHASE_ANALYTICS.md` (related link)
- `star-map-app-final/docs/GOAL_10K_2026.md` (related link)
- `star-map-app-final/docs/GROWTH_OPS_WEEKLY.md` (related link + funnel-reconcile no-op caveat)

---

## Related

- `docs/PURCHASE_ANALYTICS.md` — purchase event SOT and QA exclusion
- `docs/GOAL_10K_2026.md` — gross revenue north star (not net contribution)
- `docs/GROWTH_OPS_WEEKLY.md` — weekly human + company-os rhythm
- `docs/audits/star-002-checkout-funnel-semantics.md` — checkout intent vs operational volume
- GitHub #173 — parent commercial program
