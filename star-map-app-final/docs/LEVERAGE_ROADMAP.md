# Leverage roadmap — ranked backlog

**Last updated:** 2026-06-09  
**Purpose:** Single prioritized list from fulfillment, analytics, growth, and hygiene reviews. Work top-down; do not skip proof gates on commerce changes.

**Status key:** ✅ Done in repo · 🟡 In progress · ⬜ Open · ⏸ Deferred / human-blocked

---

## Tier 0 — Ship truth (ops, same day)

| Rank | Item | Status | Notes |
|------|------|--------|-------|
| 0.1 | **Push + `deploy:verify`** | ✅ | `ae8c983` on prod; live-critical passed |
| 0.2 | **Block 1.6 Phase A sign-off** | ⬜ | 15 min: tick `PHASE_STATUS.md`, wedding→print paragraph, pick C2 vs D1 |
| 0.3 | **Cancel Printful draft #162333059** | ⬜ | QA order with failed files; optional cleanup |

---

## Tier 1 — Don't lose money or lie about fulfillment

| Rank | Item | Status | Notes |
|------|------|--------|-------|
| 1.1 | **Post-submit Printful file check + operator alert** | ✅ | `printFulfillmentPostSubmit.ts` + webhook |
| 1.2 | **Print asset upload validation** | ✅ | Min 20KB + 800×800 at `POST /api/print/assets` |
| 1.3 | **Pin print asset TTL on paid webhook** | ✅ | 60d entitled TTL via `printAssetFulfillment.ts` |
| 1.4 | **Card 4×6 dedicated export crop** | ✅ | Portrait 4:6 asset + `print_card_asset_id` metadata |
| 1.5 | **Enable print margin guard in prod** | ⬜ | `PRINT_MARGIN_GUARD_ENABLED=true` when ready to block unprofitable promos |
| 1.6 | **`PRINTFUL_AUTO_CONFIRM` policy** | ⬜ | Drafts safe for QA; decide confirm strategy before volume |

---

## Tier 2 — Measure and decide correctly

| Rank | Item | Status | Notes |
|------|------|--------|-------|
| 2.1 | **`paywall_opened` always includes `intent` + `source`** | ✅ | `trackPaywallOpenedEvent` in editor |
| 2.2 | **Funnel: stop inflating `checkout_request_received` on GET checkout** | ✅ | GET records session_created only |
| 2.3 | **QA session filter in commerce digest** | ✅ | `productionPaidSessions` + `qa_ops_checkout` flag |
| 2.4 | **Promo fallback surfaced to client** | ✅ | Brief paywall message when `discountRejected` |
| 2.5 | **Printful webhooks beyond `package_shipped`** | ✅ | `order_failed`, `order_canceled`, `order_put_hold` → KV + ops alert |
| 2.6 | **GA4 / ads UTM hygiene** | ⬜ | `gift_wedding_2026`, missing `utm_content={adgroup}` |
| 2.7 | **Referral loop read** | ⬜ | UI live; conversions ~0 in scorecard |

---

## Tier 3 — Engineering hygiene

| Rank | Item | Status | Notes |
|------|------|--------|-------|
| 3.1 | **CI: `typecheck` + `test:unit` on PRs** | ✅ | Root `.github/workflows/ci.yml` |
| 3.2 | **Add map-hub Playwright to nightly or commerce smoke** | ⬜ | `tests/map-hub-editor.spec.ts` |
| 3.3 | **Remove duplicate weak CI** | ✅ | Removed lint-only `star-map-app-final/.github/workflows/ci.yml` |
| 3.4 | **Stripe webhook event dedupe** | ✅ | `stripe:event:{id}` via `kv.incr` |

---

## Tier 4 — Growth & trust (compounds over weeks)

| Rank | Item | Status | Notes |
|------|------|--------|-------|
| 4.1 | **B4 — Permissioned social proof** | ⏸ | Human: real testimonials; no fabricated quotes |
| 4.2 | **B5 — Weekly GSC → title/H1 pass** | ⬜ | `npm run data:pull` habit |
| 4.3 | **Free shipping UI** | ⏸ | `freeShippingPolicy.ts` not wired; do not advertise until checkout waives |
| 4.4 | **Support email send-as** | ⬜ | `support-email-send-as-setup.md` |
| 4.5 | **Public `/order-status` (Layer C2)** | ⏸ | Deferred; reduces support load later |

---

## Tier 5 — Catalog & scale (gated)

| Rank | Item | Gate |
|------|------|------|
| 5.1 | **C1 card scale / marketing** | C1.5 ✅ plumbing |
| 5.2 | **C2 canvas** | After C1 stable |
| 5.3 | **C3 mug** | After C1 stable |
| 5.4 | **M1 stickers paid proof** | Optional; metadata proof OK |
| 5.5 | **Wedding ad budget scale** | Block **1.6** |
| 5.6 | **Phase D — one big bet** | After Phase A sign-off |
| 5.7 | **Mobile / RevenueCat** | Explicitly deferred |

---

## Tier 6 — Nice-to-have / long horizon

| Rank | Item | Notes |
|------|------|-------|
| 6.1 | Map hub TTL alignment for anonymous maps | Paid maps get 1y recipe refresh |
| 6.2 | Parchment/vintage in snapshot matrix | `MAP_LOOK_TIERS.md` |
| 6.3 | Claim token TTL review (10y → 90–180d) | `post-purchase-access-architecture.md` |
| 6.4 | Merchant Center shipping label coverage audit | `merchant-center-ads-checklist.md` |

---

## Session log

| Date | Shipped |
|------|---------|
| 2026-06-09 | Tier 2.5 Printful failure webhooks, Tier 3.3 duplicate CI removed |
| 2026-06-09 | Tier 1.4 card 4×6 export, Tier 2.4 promo fallback UX |
| 2026-06-09 | Tier 1.1–1.3, 2.1–2.3, 3.1 — fulfillment validation, analytics, CI |

---

## Quick commands

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run typecheck
npm run test:unit
npm run qa:live-critical
npm run deploy:verify
```
