# StarMapCo — unified phase status

**Last updated:** 2026-06-16  
**Purpose:** One checklist so you are not juggling three different “phase” naming systems.

**How to use:** Work the **next execution sequence** in `docs/WORKING_BLOCKS.md`. Mark items here when they ship. Detailed runbooks stay in linked docs.

**Execution rule:** Move as fast as you want. Do not skip **proof** gates (test order, margin, checkout smoke).

**Split gate (2026-06-09):**

- **Wedding proof** (Blocks **1.5 → 1.6**) — still runs on its own schedule; gates **scaling wedding ads**, not merch prep.
- **C1 greeting card** — **prep + launch unlocked now**; follow **`docs/block-c1-card-prep.md`**. Live when **C1.5** passes (one test order), **not** when 1.6 passes.
- **C2 / C3** (canvas, mug) — still **after C1.5** passes.

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

**North star:** **$10k production revenue by 2026-12-31** — track with `npm run qa:revenue-goal`; plan in **`docs/GOAL_10K_2026.md`**.

**Phase A exit signed off (2026-06-15).** Print fulfillment proven, checkout + card bundle live. **Current pace ~$400/mo** — need **~3.5×** acquisition to hit $10k. **Three lanes:** wedding Search ads (controlled test), organic/AI (SEO + AIEO), trust (B4 testimonials). **C1 card** live; **C2/C3/D1** deferred until **~$1k/mo** sustained.

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
| **A1** | Weekly growth loop | ✅ | `qa:growth-weekly` run 2026-06-13; notes in `reports/weekly-notes-2026-06-13.md` |
| **A2** | One fulfilled print in prod | ✅ | 4 print paid / 4 sent in 14d digest; historical unframed **161064930** fulfilled |
| **A3** | Wedding → print conversion | ✅ | Paywall + `/wedding` path live; 61 print checkouts opened / 5 paid (14d); ads will prove campaign attribution |
| **A4** | Money-page 10-second test | ✅ | **1.4 pass** on live money pages (2026-06-12) |
| **A5** | Post-purchase upsell | ✅ | `/success` + `/download` print CTAs; print timeline on success |

**Block 1.5:** ✅ Funnel read **2026-06-13**. **Block 1.6:** ✅ Phase A sign-off **2026-06-15** — wedding Search ads cleared for controlled test (see below).

### Ads scale — go decision (2026-06-15)

**Economics (live SKUs, `npm run qa:print-margin`):**

| SKU | Retail | Est. profit (US) | Est. profit (CA) |
|-----|--------|------------------|------------------|
| Framed 14×14 | $99 | ~$64–71 | ~$66–73 |
| Poster 18×18 | $49 | ~$43–50 | ~$40–48 |

One **framed** sale covers **~5–6 days** at **$12/day** ad spend before fulfillment is double-counted — margin is comfortable for a **test budget** if even a fraction of clicks convert.

**Launch params (do not skip):**

1. Follow **`docs/ADS_RELAUNCH_SETUP.md`** — Search only, **pause PMax**, auto-tagging ON, GA4 property **517653481** linked.
2. Final URL: `https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={adgroup}`
3. **Budget:** **$10–15/day** cap · **CPC cap ~$2–4** · **7-day** review before raising.
4. **Server `purchase` events** already on (`NEXT_PUBLIC_GA4_SERVER_PURCHASES=true` in prod).
5. **Kill switch:** pause if **7 days + ≥$70 spend + zero** GA4 purchases where campaign = `gift_wedding_2026`.

**Next product bet (not in same wave):** keep **C1 card** messaging on wedding ads; pick **D1 gift tiers** only after baseline CPA is known.

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

### BIG_MOVES — Phase C (catalog)

Live paywall today: **`poster_framed`**, **`poster_unframed`** only.

| Order | SKU | Status |
|-------|-----|--------|
| **C1** | `card_4x6` (bundle add-on — see `block-c1-card-prep.md`) | ✅ **C1.5** — paid plumbing `cs_live_b1PTs2…` (framed + card, CA); C1.4 copy shipped |
| **M1** | Stickers merch beta (`block-m1-stickers-beta.md`) | 🟡 **M1.3** — live proof 20/20 (no paid order); enable scale when ready |
| **C2** | `canvas_wrap` | ⬜ After C1.5 |
| **C3** | `mug_11oz` (shop/merch, not wedding hero) | ⬜ After C1.5 |

Checklist per SKU: `docs/print-launch-checklist.md`, `npm run qa:print-margin`, `PAYWALL_LIVE_PRINT_VARIANTS`, one real test order.

---

### BIG_MOVES — Phase D & E

| Phase | Theme | Status |
|-------|--------|--------|
| **D** | Quarterly big bets (gift tiers, occasion kits, delivery promise, proof gallery, card bundle) | ⏸ | Deferred — wedding Search test first |
| **E** | **Acquisition** (paid Search + organic/AI + measurement) | 🟡 | Ads: `ADS_RELAUNCH_SETUP.md`; organic: B5 + AIEO in `GOAL_10K_2026.md`; weekly `qa:revenue-goal` |

---

## Next execution sequence (gated — not calendar-bound)

See **`docs/WORKING_BLOCKS.md`** for full block specs. Order:

1. **1.1** — Wedding → print paywall default (A3)  
2. **1.2** — Wedding CTAs + ad URL parity  
3. **1.3** — First growth loop (A1)  
4. **1.4** — Money-page 10-second pass (A4)  
5. **1.5** — Funnel read: preview → print checkout *(parallel with C1 prep)*  
6. **1.6** — ✅ Phase A sign-off **2026-06-15**

**Current focus:**

| Track | Action |
|-------|--------|
| **Wedding ads (E)** | Launch Search **$10–15/day** — `ADS_RELAUNCH_SETUP.md` |
| **C1 card** | Mention in ad copy where natural; bundle already live |
| **D1 / C2** | Wait for 7-day ad read |

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
| `GOAL_10K_2026.md` | **$10k north star** — math, lanes, milestones, weekly scorecard |
| `phase1a-print-fulfillment-proof.md` | Canonical print proof IDs + “do not re-test” rules |
| `print-ops-runbook.md` | Print comms slice + ops commands |
| `PRODUCT_EXECUTION_QUEUE.md` | Checkbox queue (sync when items ship) |
| `GROWTH_OPS_WEEKLY.md` | A1 weekly rhythm |
| `WORKING_BLOCKS.md` | Session-sized blocks (1–3 h each) |
| `block-1.5-funnel-read.md` | Block 1.5 funnel read checklist + pass criteria |
| `block-c1-card-prep.md` | C1 greeting card prep (split gate; bundle-only) |
| `LEVERAGE_ROADMAP.md` | Ranked backlog (fulfillment, analytics, growth, hygiene) |
| `merchant-center-ads-checklist.md` | Ads/Merchant truth (no fake free shipping in ads) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-13 | Block **1.5** read; **C1.5** paid proof; map hub + QA ops scripts; wedding card copy (C1.4) |
| 2026-06-09 | **Split gate:** C1 card prep parallel to 1.5; `block-c1-card-prep.md` |
| 2026-06-12 | Block **1.5** checklist (`block-1.5-funnel-read.md`); pushed `2e1fd6d` + `4d76a7f` to GitHub |
| 2026-06-12 | Gated execution sequence (replace calendar-week framing); proof gates for Phase C |
| 2026-06-12 | Created unified checklist; marked 1A + B3 + money-page polish done; A3/A1/C blocked as next |
