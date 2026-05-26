# Big moves roadmap

Sequenced product work after print/checkout plumbing (margin guard off, print UI live, promo fallback fixed — 2026-05).

**How to use this doc:** Work top to bottom within each phase. Do not start Phase C SKUs until Phase A exit criteria pass. Polish items in Phase B can run in parallel with weekly growth ops.

**Weekly rhythm (30–45 min):** `docs/GROWTH_OPS_WEEKLY.md` — `data:pull`, `qa:growth-weekly`, GA4 Realtime, one funnel fix if data points at it.

---

## Phase A — Prove the core gift machine (do first)

Goal: Paid wedding/traffic → editor → print or digital checkout → at least one fulfilled print in prod.

| # | Move | What “done” looks like | Verify |
|---|------|------------------------|--------|
| A1 | **Growth loop habit** | Weekly `data:pull` + `qa:growth-weekly`; notes in `.data/` or company-os | Purchases visible in GA4; GSC/ads summaries read |
| A2 | **One real print order** | Framed (or unframed) order paid in prod; Printful status `sent` or clear ops path | `npm run qa:print-ops`; Printful dashboard |
| A3 | **Wedding → print conversion polish** | `/wedding` + wedding UTM: clear price/shipping/delivery; editor opens print intent; paywall defaults to **Printed gift** for wedding sources | Manual `/wedding` → editor; `preview_checkout_nudge_*` / funnel |
| A4 | **Money-page 10-second test** | Stranger can answer: what am I buying, how much, how long — on `/wedding`, `/personalized-star-map`, `/star-map-gift` | Copy + mockup proof only (no fake testimonials) |
| A5 | **Post-purchase upsell polish** | `/success` + `/download`: “Print *this* map” is obvious; referral + proof intake unchanged | Manual after A2 |

**Phase A exit:** ≥1 fulfilled print + funnel data shows people reaching Stripe from wedding/editor (not only digital).

---

## Phase B — Polish that compounds (parallel with A once A2 started)

Goal: Site feels premium; fewer leaks between preview and pay.

| # | Move | Scope | Out of scope |
|---|------|--------|----------------|
| B1 | **Paywall as gift decision** | Shipping country + ETA before pay; framed vs poster sizing note; mobile print tab first for gift traffic | New payment providers |
| B2 | **Editor trust moments** | Square vs portrait print warning (exists — tune copy); “what you’ll receive” near HD/print CTAs | Full editor redesign |
| B3 | **Proof gallery** | Curated mockups on money pages + shop; label honestly; `npm run assets:printproof` when env set | Buyer photos without permission |
| B4 | **Permissioned social proof** | Real quotes only via `docs/testimonial-intake-template.md` + `PostPurchaseProofRequest` | Placeholder testimonials |
| B5 | **SEO from data** | GSC top queries → title/H1/meta on pages that already rank | Net-new blog spam |

---

## Phase C — Catalog expansion (one SKU at a time)

**Already in code** (`src/lib/printCatalog.ts`), **not on paywall** yet: `canvas_wrap`, `mug_11oz`, `card_4x6`.  
**Live today:** `poster_framed`, `poster_unframed` only (`PAYWALL_LIVE_PRINT_VARIANTS`).

### Launch order (recommended)

| Order | SKU | Why | Pilot positioning |
|-------|-----|-----|-------------------|
| **C1** | `card_4x6` | Low price; wedding add-on; partial env in `wrangler.toml` | “Matching keepsake card” with framed print |
| **C2** | `canvas_wrap` | Premium tier between poster and framed | “Gallery wrap” on gift/anniversary pages |
| **C3** | `mug_11oz` | Merch / shop traffic, not wedding hero | `/shop` or secondary CTA only |

### Per-SKU launch checklist (repeat every time)

1. Internal print matrix + `npm run qa:print-margin` for that SKU  
2. Stripe Price ID + `wrangler.toml` price/COGS/PRINTFUL variant envs  
3. `npm run assets:printproof` + `npm run assets:commerce-refresh`  
4. Add to `PAYWALL_LIVE_PRINT_VARIANTS` + `PAYWALL_PRINT_CHECKOUT_ROWS` (if primary CTA)  
5. Money-page mention + merchant feed  
6. Deploy → `npm run qa:live-print-conversion -- --checkout-only` (variant flag)  
7. **One real test order** for that SKU  

Ref: `docs/print-launch-checklist.md`, `docs/PRODUCT_EXECUTION_QUEUE.md` §4.

---

## Phase D — Big bets (one theme per quarter)

Pick **one** row per quarter; finish Phase A before betting big.

| Theme | What it is | Why it could be huge | Main work |
|-------|------------|----------------------|-----------|
| **D1 — Gift tiers** | One map → Digital / Poster / Framed (+ optional card) as clear ladder | Higher AOV; simpler marketing | Paywall UX, landing copy, ads creative — mostly product/design |
| **D2 — Occasion kits** | Wedding / baby / anniversary: defaults (copy, format, hero proof) | Better ad landing match | Extend `/star-map-for/[slug]` + editor prefill + UTM defaults |
| **D3 — Delivery promise** | “Order by … arrives by …” from shipping business-day envs | Reduces checkout anxiety | Copy + cutoff rules; no new SKU |
| **D4 — Proof that sells** | Gallery + intake → permissioned photos over time | Trust without fakes | Ops + `PROOF_INTAKE_RUNBOOK.md` |
| **D5 — Greeting card bundle** | Framed + card checkout story (after C1) | Wedding AOV + giftability | Checkout rows + wedding page bundle block |

**Explicitly defer:** mobile app + RevenueCat, AI features, full site redesign, 5 SKUs at once, re-enabling margin guard until promo economics are understood.

---

## Phase E — Ads & measurement (ongoing, not a “big build”)

- Campaign: **Search - Wedding Gift 2026** — UTMs + `utm_campaign=gift_wedding_2026`  
- GA4 server purchases: `NEXT_PUBLIC_GA4_SERVER_PURCHASES=true`; verify with `npm run qa:live-conversion`  
- Pause scale if: `qa:live-critical` fails, purchases broken, or 2+ weeks spend with zero purchases after landing fixes  

---

## Quick commands

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run qa:growth-weekly
npm run qa:live-print-conversion -- --checkout-only
npm run qa:print-ops -- --hours 336 --limit 50
npm run qa:print-margin
npm run deploy:verify
```

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run data:pull
npm run ads:optimize
```

---

## Suggested first sprint (serious start)

1. **A2** — one fulfilled print  
2. **A3 + A4** — wedding money path polish  
3. **A1** — wire weekly growth loop  
4. Then choose **C1 (card)** *or* **D1 (gift tiers)** — not both in the same week  

Update checkboxes in `docs/PRODUCT_EXECUTION_QUEUE.md` when a phase item ships.
