# Block C1 — Greeting card prep (split gate)

**Plain goal:** Sell a **4×6 keepsake card** that goes with a framed print — *not* a separate “buy a card” product on the homepage.

**You do not need to read JavaScript to run prep.** Most steps are Stripe dashboard, Printful dashboard, and copy/photos.

---

## Two tracks (they run at the same time)

| Track | What | Waits for wedding stats? |
|-------|------|---------------------------|
| **Wedding proof** | Blocks **1.5 → 1.6** — “Does `/wedding` → print checkout work?” | Yes — keep checking in background |
| **C1 card** | Prep now · go live when **C1.5** passes (one test order) | **No** — does not wait for 1.6 |

**Still blocked until C1 finishes:** canvas (C2), mug (C3), and scaling wedding ads hard.

---

## Best practice for this SKU (highest leverage)

Our margin math says the card is **`bundle_only`** — see `docs/upsell-rollout-matrix.md`:

| Do | Don’t |
|----|--------|
| Offer as **add-on with framed print** (“Framed + keepsake card”) | Standalone $19 card on `/shop` hero |
| One extra checkout row on the paywall | Third tab clutter on mobile paywall |
| Wedding copy: “Matching card for your message inside” | Google Merchant / ads for card-only until bundle works |

**Why:** Shipping eats margin on a cheap item alone. Bundled with framed print = higher order value + one shipment story.

**Primary surface:** **P1 add-on** (paywall checkout row), not P2 shop hero. Optional later: mention on `/wedding` after live.

---

## Already in the codebase (you’re not starting from zero)

| Item | Status |
|------|--------|
| Catalog row `card_4x6` | ✅ `src/lib/printCatalog.ts` |
| Printful variant **14457** | ✅ in `wrangler.toml` |
| Price **$19** / COGS stub | ✅ `PRINT_CARD_4X6_*` envs |
| Checkout route knows `card_4x6` | ✅ `src/app/api/checkout/route.ts` |
| Upsell copy stub | ✅ `downloadPrintUpsellCatalog.ts` (not live until promoted) |
| **Live on site today** | ❌ Posters only (`PAYWALL_LIVE_PRINT_VARIANTS`) |
| **Stripe Price ID** | ✅ `price_1ThdfMLWqD0o9865Z3DQ6AcW` (live; `scripts/ensure-stripe-print-card-price.mjs`) |
| **Card add-on at checkout** | ✅ C1.3 shipped — “Framed + keepsake card” row on paywall + editor |
| **Printful QA script** | 🟡 `qa:printful` only checks posters today — verify 14457 manually in prep |

---

## Prep checklist (no code — do these first)

### C1.prep.1 — Printful (5–10 min)

- [ ] Log into Printful → store **StarMapCo (17779767)**
- [ ] Confirm variant **14457** exists and is **4×6 greeting card**
- [ ] Note print area / safe zone (card is not 18×18 poster — export may need a crop rule later)
- [ ] Optional: place a **manual sample order** in Printful (no Stripe) to see proof file quality

### C1.prep.2 — Stripe (10 min)

- [x] Create **live** Product + Price for “Greeting card (4×6)” at **$19.00** — done via `node scripts/ensure-stripe-print-card-price.mjs`
- [x] Price ID in `wrangler.toml`: `STRIPE_PRICE_ID_PRINT_CARD_4X6`
- [ ] **Deploy** so production Worker picks up the new env var (`npm run deploy:verify` when ready)
- [ ] Run `npm run check:env` after deploy

### C1.prep.3 — Margin sanity (2 min)

```powershell
cd C:\Code\starMapAppV2\star-map-app-final
npm run qa:print-margin
```

- [ ] Card row shows **bundle_only** or acceptable margin when bundled (not standalone hero)

### C1.prep.4 — Honest mockup (when you have a photo)

- [ ] One real or labeled mockup: card + framed print (tabletop is fine)
- [ ] Do **not** use fake buyer quotes

---

## Launch sub-blocks (when prep is green)

| Block | What | Who |
|-------|------|-----|
| **C1.1** | Margin + price locked | You + `qa:print-margin` |
| **C1.2** | Stripe Price ID in prod env | You (Stripe + Wrangler) |
| **C1.3** | **Add-on checkout row** — “Framed + keepsake card (+$19)” on paywall + editor; Printful gets framed + card line items | ✅ Deploy `cd229037…` |
| **C1.4** | One line on `/wedding` or framed checkout copy · merchant feed if needed | Copy + `assets:commerce-refresh` |
| **C1.5** | Deploy · `qa:live-print-conversion -- --checkout-only` · **one real test order** · `qa:print-ops` | Ship session |

**C1.5 done = card is live.** Wedding funnel sign-off (**1.6**) is separate.

---

## What we will NOT do in C1 prep

- Change wedding paywall default (Block 1.1 — already shipped)
- Change poster/framed prices
- Change Printful poster variants
- Add mug or canvas (C2/C3)
- Run card as standalone shop SKU (violates `bundle_only`)

---

## Quick verify (after C1.2)

```powershell
cd C:\Code\starMapAppV2\star-map-app-final
npm run check:env
npm run qa:printful
npm run qa:print-margin
```

---

## Related

- `docs/WORKING_BLOCKS.md` — Wave 3 + split gate
- `docs/PHASE_STATUS.md` — master status
- `docs/upsell-rollout-matrix.md` — why bundle_only
- `docs/print-launch-checklist.md` — full go-live gates
