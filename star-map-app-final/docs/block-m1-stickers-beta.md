# Block M1 — Stickers beta (first merch SKU)

**Goal:** Sell kiss-cut stickers from `/shop` + editor merch panel — **one SKU**, feature-flagged.

**Rule:** Same as Track C — finish **M1.5** (one test order) before enabling magnets, tees, hoodies.

---

## Why stickers first

| Stickers | Hoodies / tees |
|----------|----------------|
| Pick size only (4 options) | Size **and** color |
| Lowest COGS / return risk | Higher support load |
| Code + Printful IDs already curated | Same pipeline after M1 proves checkout |

---

## Sub-blocks

| Block | Work | Status |
|-------|------|--------|
| **M1.0** | Wire merch checkout + Printful v2 fulfillment in API | Code session |
| **M1.1** | Stripe Price + `wrangler.toml` flags (beta + stickers only) | Ops |
| **M1.2** | Deploy · `/shop#merch-beta` visible · editor merch panel | Ship |
| **M1.3** | One real test order (3×3 sticker) · Printful `sent` | You |
| **M1.4** | Enable **magnets** (`NEXT_PUBLIC_MERCH_MAGNETS_ENABLED`) — repeat M1.3 | Next wave |

---

## Env flags (production)

```
NEXT_PUBLIC_MERCH_BETA_ENABLED = "true"
NEXT_PUBLIC_MERCH_STICKERS_ENABLED = "true"
NEXT_PUBLIC_MERCH_STICKERS_PRICE_CENTS = "900"
STRIPE_PRICE_ID_MERCH_STICKERS = "<from ensure-stripe-merch-stickers-price.mjs>"
MERCH_COGS_STICKERS_CENTS = "300"
```

Keep **magnets, pins, tee, hoodie** flags off until prior SKU passes test order.

---

## Verify after deploy

```powershell
cd C:\Code\starMapAppV2\star-map-app-final
npm run test:unit
node scripts/merch-marketing-smoke.mjs --site https://starmapco.com --expect-merch-html
```

Manual: editor → merch panel → pick size → checkout (stop before pay unless doing M1.3).

Shop anchor: `/shop#merch-addons`

---

## Roadmap after M1

1. **M2** magnets · **M3** pins · **M4** tee · **M5** hoodie · **M6** keychains (needs new catalog row)
2. **C2** canvas · **C3** mug (print catalog — `/shop`, not paywall hero)
3. **C1.5** card bundle test order (parallel — closes greeting-card gate)
