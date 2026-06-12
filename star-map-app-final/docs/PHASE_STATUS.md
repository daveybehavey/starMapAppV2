# StarMapCo — unified phase status

**Last updated:** 2026-06-12  
**Purpose:** One checklist so you are not juggling three different “phase” naming systems.

**How to use:** Work the **next execution sequence** in `docs/WORKING_BLOCKS.md`. Mark items here when they ship. Detailed runbooks stay in linked docs.

**Execution rule:** Move as fast as you want. Do not skip gates. Do not start Phase C merch until Block **1.6** signs off Phase A.

---

## Naming map (same work, different labels)

| You might say… | Doc / framework | What it means |
|----------------|-----------------|---------------|
| **Phase 1A-1, 1A-2A, 1A-2B** | Audit sprint (ChatGPT + Cursor, Jun 2026) | Truth alignment + live digital/print **proof** before scaling |
| **Layer A+B+C1 / C2** | Print comms slice | Post-purchase print visibility (success timeline, emails, tracking index) |
| **Phase A–E** | `BIG_MOVES_ROADMAP.md` | **Main product roadmap** — prove gift machine → polish → SKUs → big bets → ads |
| **Phase 0–5** | `roadmap-status.md` | Older macro history (foundation → print scale); useful for ops context, not day-to-day priority |

**Canonical “what’s next” for product:** `BIG_MOVES_ROADMAP.md` + **this file**.

---

## Where we are (one line)

**Phase 1A proof is closed.** Homepage, money pages, `/shop`, and digital download are live and polished. **BIG_MOVES Phase A exit is not signed off yet** — growth habit, wedding paywall default, and funnel proof from ads traffic are still open. **Do not start Phase C SKUs** until Phase A exits.

---

## Master checklist

Legend: ✅ Done · 🟡 Partial / watch · ⬜ Open · ⏸ Deferred

### Sprint — Phase 1A (truth + live proof)

| ID | Item | Status | Notes / verify |
|----|------|--------|----------------|
| **1A-1** | Remove false “Free shipping $150+”; honest checkout copy | ✅ | Deployed; hero + trust panel |
| **1A-2A** | Live **digital** order proof (pay → HD download → credit) | ✅ | Failed once; hotfixed; owner re-test passed |
| — | `/download` polish + print upsell | ✅ | Commits on `main`; live |
| **1A-2B** | Print checkout **wiring** proof (no new paid order) | ✅ | `phase1a-2b-unframed-proof.mjs` 18/18; see `phase1a-print-fulfillment-proof.md` |
| — | Historical **paid print** proof | ✅ | Unframed **161064930** fulfilled + tracking; framed **161276125** post-payment proven |
| **Layer A+B+C1** | Print comms (success timeline, confirmation email, tracking index) | ✅ | Deploy `ff30e44f…`; runbook in `print-ops-runbook.md` |
| **Layer C2** | Public `/order-status` page | ⏸ | Deferred on purpose |

**Passive watch (1A):** Printful **161276125** — wait for `fulfilled` + tracking via `package_shipped` index. **Do not place another paid print test** unless regression.

---

### BIG_MOVES — Phase A (prove the gift machine)

**Exit criteria:** ≥1 fulfilled print **and** funnel shows wedding/editor → Stripe **print** (not digital-only).

| ID | Item | Status | Notes / verify |
|----|------|--------|----------------|
| **A1** | Weekly growth loop | ⬜ | `docs/GROWTH_OPS_WEEKLY.md` — `data:pull`, `qa:growth-weekly`, GA4 + one funnel fix |
| **A2** | One fulfilled print in prod | 🟡 | Unframed historically **fulfilled**; framed **in production** — acceptable for 1A doc; confirm in Printful dashboard |
| **A3** | Wedding → print conversion | 🟡 | **1.1 deployed** (`5de4ed19`); paywall resolver live — **1.2** URL audit + manual framed-path check |
| **A4** | Money-page 10-second test | 🟡 | Mockups + price-at-a-glance on top pages; no formal stranger test / funnel read yet |
| **A5** | Post-purchase upsell | ✅ | `/success` + `/download` print CTAs; print timeline on success |

---

### BIG_MOVES — Phase B (polish that compounds)

| ID | Item | Status | Notes / verify |
|----|------|--------|----------------|
| **B1** | Paywall as gift decision (shipping ETA, sizing notes) | 🟡 | ETA exists; wedding default tab still open (see A3) |
| **B2** | Editor trust moments | 🟡 | Square/portrait warnings exist; tune as needed |
| **B3** | Proof gallery (money pages + shop) | ✅ | `HOME_MOCKUPS` on `/`, `/shop`, gift formats, wedding, etc. |
| **B4** | Permissioned social proof | ⬜ | `docs/testimonial-intake-template.md` — **no placeholder quotes** |
| **B5** | SEO from GSC data | ⬜ | Weekly title/H1 pass from top queries |

---

### BIG_MOVES — Phase C (catalog — **blocked until Phase A exit**)

Live paywall today: **`poster_framed`**, **`poster_unframed`** only.

| Order | SKU | Status |
|-------|-----|--------|
| **C1** | `card_4x6` | ⬜ |
| **C2** | `canvas_wrap` | ⬜ |
| **C3** | `mug_11oz` (shop/merch, not wedding hero) | ⬜ |

Checklist per SKU: `docs/print-launch-checklist.md`, `npm run qa:print-margin`, `PAYWALL_LIVE_PRINT_VARIANTS`, one real test order.

---

### BIG_MOVES — Phase D & E

| Phase | Theme | Status |
|-------|--------|--------|
| **D** | Quarterly big bets (gift tiers, occasion kits, delivery promise, proof gallery, card bundle) | ⬜ Pick **one** after Phase A exit |
| **E** | Ads & measurement (`gift_wedding_2026`, GA4 server purchases, live conversion QA) | 🟡 Ongoing — pause scale if purchases break |

---

## Next execution sequence (gated — not calendar-bound)

See **`docs/WORKING_BLOCKS.md`** for full block specs. Order:

1. **1.1** — Wedding → print paywall default (A3)  
2. **1.2** — Wedding CTAs + ad URL parity  
3. **1.3** — First growth loop (A1)  
4. **1.4** — Money-page 10-second pass (A4)  
5. **1.5** — Funnel read: preview → print checkout  
6. **1.6** — Phase A sign-off → then pick **C1** or **D1**

**Hard gate:** Phase C SKUs / Printful merch stay blocked until **1.6**.  
**Parallel OK:** Wave 2 polish (B1–B5) after **1.1**; does not replace **1.6** proof.

After Phase A exit: **B4** (testimonials when ready); merch via **C.x** sub-blocks (one SKU per mini-wave).

---

## Quick verify commands

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run qa:live-critical
npm run qa:print-ops -- --hours 336 --limit 50
npm run qa:growth-weekly
npm run deploy:verify   # when shipping code
```

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run data:pull
```

---

## Related docs

| Doc | Use for |
|-----|---------|
| `BIG_MOVES_ROADMAP.md` | Sequencing philosophy + Phase C/D/E detail |
| `phase1a-print-fulfillment-proof.md` | Canonical print proof IDs + “do not re-test” rules |
| `print-ops-runbook.md` | Print comms slice + ops commands |
| `PRODUCT_EXECUTION_QUEUE.md` | Checkbox queue (sync when items ship) |
| `GROWTH_OPS_WEEKLY.md` | A1 weekly rhythm |
| `WORKING_BLOCKS.md` | Session-sized blocks (1–3 h each) |
| `merchant-center-ads-checklist.md` | Ads/Merchant truth (no fake free shipping in ads) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-12 | Block **1.1** deployed (`5de4ed19`); wedding print paywall resolver live |
| 2026-06-12 | Gated execution sequence (replace calendar-week framing); proof gates for Phase C |
| 2026-06-12 | Created unified checklist; marked 1A + B3 + money-page polish done; A3/A1/C blocked as next |
