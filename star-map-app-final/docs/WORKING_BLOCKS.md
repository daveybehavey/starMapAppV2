# Working blocks

**Last updated:** 2026-06-12  
**Use with:** `docs/PHASE_STATUS.md` (status) · `docs/BIG_MOVES_ROADMAP.md` (why)

Each block is sized for **one focused session** (roughly 1–3 hours). Ship, verify, tick the block — then pick the next.

## Execution rule

```text
Move as fast as you want.
Do not skip gates.
Do not start Phase C merch until Phase A exit is actually signed off (Block 1.6).
```

**Speed is allowed. Skipping gates is not.** You may complete multiple blocks in one day if each block passes its **done when** criteria independently.

**Legend:** 🔒 gate · 📋 mostly ops · 💻 code · 🧪 verify-only

---

## Wave 0 — Passive (no active work)

| Block | What | When |
|-------|------|------|
| **0.1** 📋 | Printful **161276125** → `fulfilled` + tracking | Check dashboard / `npm run qa:print-ops` once; closes **A2** watch |
| **0.2** 📋 | Do **not** place another paid print test | Unless checkout regression |

---

## Wave 1 — Phase A exit (gated sequence)

Goal: wedding/ad traffic → editor → **print** Stripe checkout, with ops rhythm running.

### What can move fast (and what gates each block)

| Block | Move fast? | Gate (must pass before next) |
|-------|:----------:|------------------------------|
| **1.1** Wedding print paywall default | Yes | Tests pass; no checkout regression |
| **1.2** Wedding CTAs + ad URLs aligned | Yes | Links open correct print intent |
| **1.3** First growth loop | Yes | Data pulled + notes logged |
| **1.4** Money-page 10-second pass | Yes | Copy-only / small UI fixes verified |
| **1.5** Funnel read | Sort of | Real or clean enough traffic data |
| **1.6** Phase A sign-off | 🔒 Proof only | Wedding/gift → preview → **print** checkout path documented |

**Wave 2 (B1–B5)** can run alongside Wave 1 after **1.1** ships — none block **1.6** except where noted.

### Block 1.1 · A3 — Wedding → print paywall default 💻

**Closes:** A3 (core), helps B1  
**Depends on:** nothing  
**Rough time:** 1–2 h

**Scope**

- In editor: when `source` matches wedding (e.g. `wedding`, `wedding-framed`, `sticky-wedding*`, `gift_wedding_2026` UTM mapped to source), set `paywallIntent` to **print**, default variant **framed**, open paywall after reveal (same pattern as existing `checkout=print` handling).
- Prefer one small helper (e.g. `resolveGiftTrafficIntent(source, utmCampaign)`) over scattered string checks.
- Leave “preview first, decide later” paths neutral (no forced paywall).

**Likely files**

- `src/components/EditorExperience.tsx`
- Maybe `src/lib/` traffic/source helper (new, small)
- Wedding CTAs only if any link still omits intent params

**Done when**

- `/wedding` → “Preview framed print” → editor → paywall opens on **Print**, framed selected.
- Generic wedding entry without `checkout=print` still lands print intent for **recommended** framed path.
- `npm run qa:smoke:commerce` or manual preview → paywall path passes.

**Ship:** own PR · `deploy:verify`

---

### Block 1.2 · A3 — Landing + ads URL parity 💻 📋

**Closes:** A3 (distribution), Phase E URL hygiene  
**Depends on:** 1.1 (behavior should match URLs)  
**Rough time:** 45–90 min

**Scope**

- Audit `/wedding`, sticky bar, `PreviewStartForm`, and ad final URLs for consistent `source` + print params where framed is the hero.
- Confirm `utm_campaign=gift_wedding_2026` on Search final URLs (`merchant-center-ads-checklist.md`).
- Optional: default **first** intent option on wedding form = framed (already “recommended” — ensure editor honors it via 1.1).

**Done when**

- Every primary wedding CTA resolves to print intent without user hunting the Print tab.
- Ads checklist row for wedding campaign URLs checked off.

**Ship:** can combine with 1.1 if small; otherwise separate doc-only + tiny link PR

---

### Block 1.3 · A1 — First growth loop run 📋

**Closes:** A1 (habit started)  
**Depends on:** nothing (listed after 1.2 in sequence; no code dependency)  
**Rough time:** 30–45 min

**Scope**

- Run `company-os`: `data:pull`, `data:doctor`, `ga4:pull`, `gsc:pull` (and `ads:optimize` if configured).
- Run app: `npm run qa:growth-weekly`.
- Write **5–10 lines** to `.data/weekly-notes-YYYY-MM-DD.md` or company-os task: purchases, top campaign, one funnel leak, one named fix for the next block.

**Done when**

- Notes file exists; GA4 purchases visible or gap documented; next fix named (may become Block 1.4 or 2.x).

**Ship:** no deploy

---

### Block 1.4 · A4 — Money-page 10-second pass 💻

**Closes:** A4  
**Depends on:** 1.1–1.2 helpful but not required  
**Rough time:** 1–2 h

**Scope**

- Cold-read (you or friend): `/wedding`, `/personalized-star-map`, `/star-map-gift`, `/shop` — answer in 10s: *what*, *how much*, *how long*.
- Fix only **gaps** (headline, price line, delivery hint, CTA label). No new sections unless one page fails badly.

**Done when**

- All four pages pass the three questions without scrolling on mobile.
- Optional: screenshot or checklist in weekly notes.

**Ship:** small copy PR if needed · `qa:live-critical`

---

### Block 1.5 · A4 — Funnel read (data) 📋 🧪

**Closes:** A4 (measurement), Phase A exit criteria  
**Depends on:** 🔒 **1.1** deployed; **1.3** helpful for context  
**Rough time:** 45 min (or longer if waiting on traffic)

**Scope**

- PostHog or GA4: preview_started → paywall_opened (intent print) → Stripe checkout for wedding/editor sources (14d window).
- If print intent is still ~0 shortly after **1.1** is live, document the blocker before scaling ads — do not skip to **1.6** without a read.

**Done when**

- One paragraph in notes: “funnel shows X reaching print checkout” or “waiting on traffic / fix Y”.

**Ship:** no code unless data exposes a single obvious leak → address before **1.6**

---

### Block 1.6 · Phase A exit sign-off 📋

**Closes:** Phase A · **unlocks Phase C merch**  
**Depends on:** 🔒 **0.1** A2 fulfilled · **1.1** shipped · **1.3** habit started · **1.4** pass · **1.5** read with proof  
**Rough time:** 15 min

**Scope**

- Update `PHASE_STATUS.md`: Phase A → ✅ with date.
- Decide **one** next bet: **C1 card** *or* **D1 gift tiers** — not both in the same mini-wave.

**Done when**

- Checklist updated; Phase C gate explicitly open; next track chosen.

---

## Wave 2 — Phase B polish (parallel after 1.1, or while waiting on traffic)

These compound conversion; none block Phase A exit except where noted.

| Block | ID | Type | Scope | Time |
|-------|-----|------|--------|------|
| **2.1** | B1 | 💻 | Paywall: mobile **Print** tab first when `paywallIntent === 'print'`; framed vs poster one-liner under variant picker | 1–2 h |
| **2.2** | B2 | 💻 | Tune square/portrait warning copy near HD/print CTAs (editor only) | 45 min |
| **2.3** | B4 | 📋 | First permissioned quote → one money page module (template in `testimonial-intake-template.md`) | human / when ready |
| **2.4** | B5 | 💻 | GSC top query → title + H1 on **one** page that already ranks | 45 min |

---

## Wave 3 — After Phase A exit (pick one track)

### Track C — SKU expansion (one SKU = one mini-wave)

**Do not start until Block 1.6.**

Each SKU repeats the same sub-blocks (from `print-launch-checklist.md`):

| Sub-block | Work |
|-----------|------|
| **C.x.1** | Margin + matrix: `qa:print-margin`, internal COGS row |
| **C.x.2** | Stripe + Wrangler envs for variant |
| **C.x.3** | Paywall: add to `PAYWALL_LIVE_PRINT_VARIANTS` + checkout row |
| **C.x.4** | Money page mention + merchant feed |
| **C.x.5** | Deploy · `qa:live-print-conversion -- --checkout-only` · **one** real test order |

**Recommended order:** C1 `card_4x6` → C2 `canvas_wrap` → C3 `mug_11oz`

---

## Merch expansion playbook (Printful SKUs)

**When:** 🔒 After **Block 1.6** only. Wedding funnel + fulfilled print proof come first.

**Rule:** **One new live SKU per mini-wave.** Finish **C.x.5** (checkout → fulfillment → merchant feed) for SKU *n* before starting *n+1*. Speed is fine; do not skip **C.x** sub-block gates.

### Two kinds of “new merch”

| Kind | Meaning | Effort |
|------|---------|--------|
| **Promote existing catalog row** | SKU already in `src/lib/printCatalog.ts` but not on paywall | **C.x.1–C.x.5** only (card, canvas, mug are here today) |
| **Net-new Printful product** | Not in catalog yet (e.g. tote, blanket, pillow, larger poster size) | **C.new.0** below + full **C.x** sub-blocks |

**Live on paywall today:** `poster_framed`, `poster_unframed` only (`PAYWALL_LIVE_PRINT_VARIANTS`).

**In code, not live yet:** `card_4x6`, `canvas_wrap`, `mug_11oz` — env stubs exist in `wrangler.toml` for card; others need Stripe + Printful IDs confirmed before launch.

### Where a SKU should appear (pick one primary surface)

| Tier | Surface | Good for |
|------|---------|----------|
| **P1 — Paywall primary** | Editor paywall + checkout rows | Wedding/gift hero SKUs (posters, framed, maybe card add-on) |
| **P2 — Shop / formats** | `/shop`, `/star-map-gift-formats` | Secondary formats (canvas, mug) |
| **P3 — Post-purchase upsell** | `/download`, `/success` | Anything that complements an HD purchase (`downloadPrintUpsellCatalog.ts`) |
| **P4 — Merchant / ads only** | Google Merchant feed, no editor CTA yet | Testing demand before UI commitment |

Do not add every SKU to **P1** — paywall clutter kills gift conversion.

### Sub-blocks for **net-new** SKU (before C.x.1)

| Block | Work |
|-------|------|
| **C.new.0** | Printful: create/sync product, note **variant ID**, print area / DPI rules, sample order in Printful dashboard |
| **C.new.1** | Add row to `PRINT_CATALOG` in `printCatalog.ts` (id, env keys, `shippingProfile`, COGS default) |
| **C.new.2** | Shipping: extend `fetch-printful-shipping.mjs` / `printful-shipping.json` if profile differs from posters |
| **C.new.3** | Artwork pipeline: confirm export aspect ratio + bleed for that product (editor warning if needed) |
| **C.new.4** | Proof mockup: `assets:printproof` or `HOME_MOCKUPS`-style asset; label honestly on money pages |

Then run the standard **C.x.1–C.x.5** sub-blocks from Track C.

### Standard launch sub-blocks (every SKU)

| Sub-block | Work | Verify |
|-----------|------|--------|
| **C.x.1** | COGS + price · `npm run qa:print-margin` | Margin acceptable vs promo/discount policy |
| **C.x.2** | Stripe Price (live) + `wrangler.toml` / dashboard envs · `npm run check:env` · `npm run qa:printful` | Variant IDs resolve |
| **C.x.3** | If **P1**: add to `PAYWALL_LIVE_PRINT_VARIANTS` + `PAYWALL_PRINT_CHECKOUT_ROWS`. If **P2/P3**: shop card or download upsell only | Checkout session includes correct `print_variant` |
| **C.x.4** | Copy on one money page · `npm run assets:commerce-refresh` / merchant feed | `merchant-feed-health` clean |
| **C.x.5** | `deploy:verify` · `qa:live-print-conversion -- --checkout-only` · **one real test order** · `qa:print-ops` | Printful `sent` / tracking path |

Ref: `docs/print-launch-checklist.md`, header comment in `printCatalog.ts`.

### Backlog (prioritized, not scheduled)

| Priority | SKU | ID (catalog) | Primary surface | Why |
|----------|-----|--------------|-----------------|-----|
| 1 | Greeting card 4×6 | `card_4x6` | P1 add-on or P2 | Low AOV; wedding bundle (→ **D5**) |
| 2 | Canvas wrap | `canvas_wrap` | P2 | Premium tier between poster and framed |
| 3 | Mug 11oz | `mug_11oz` | P2 / shop | Merch; not wedding hero |
| — | *Future* | *new row* | TBD | Tote, blanket, pillow, 24×24 poster, etc. — each needs **C.new.0** scoping |

Add rows to this table when you pick a SKU; remove from “future” when **C.x.5** passes.

### What we explicitly defer

- Launching **3+ SKUs** in one deploy  
- Wedding hero placement for mugs/merch (keep on `/shop`)  
- Re-enabling **margin guard** until promo + multi-SKU economics are understood  
- Buyer-photo “proof” in ads without permission  

---

### Track D — One quarterly bet (pick one)

| Block | Theme | Rough size |
|-------|--------|------------|
| **D1** | Gift tiers ladder (digital / poster / framed copy + paywall UX) | 2–4 sessions |
| **D2** | Occasion kit defaults (slug + editor prefill) | 2–3 sessions |
| **D3** | Delivery promise copy (“order by … arrives by …”) | 1 session |
| **D4** | Proof gallery + intake ops | ongoing |
| **D5** | Framed + card bundle (after C1) | 2 sessions |

---

## Wave 4 — Deferred / later

| Block | Item | Notes |
|-------|------|--------|
| **4.1** | Layer **C2** public `/order-status` | Deferred from 1A; needs design + support policy |
| **4.2** | Margin guard re-enable | After promo economics understood |
| **4.3** | Mobile app / AI / full redesign | Explicitly out per BIG_MOVES |

---

## Next execution sequence

Move through these blocks as quickly as they pass their **done when** criteria:

1. **Block 1.1** — Wedding sources → print paywall default  
2. **Block 1.2** — Wedding CTAs + ad URLs aligned with print intent  
3. **Block 1.3** — First disciplined growth loop  
4. **Block 1.4** — Money-page 10-second pass  
5. **Block 1.5** — Funnel read: preview → print checkout  
6. **Block 1.6** — Phase A sign-off + pick **C1** or **D1**

**Passive (anytime):** **0.1** — confirm Printful **161276125** fulfilled (closes A2 watch).

After **1.6:** Phase C merch / SKUs are unblocked — start **C1.x** or **D1**, not both in the same mini-wave.

---

## Quick pick (“what block next?”)

1. Phase A not signed off → next incomplete block in sequence above (**1.1** if nothing shipped yet)  
2. **1.1** deployed, URLs not audited → **1.2**  
3. Waiting on deploy → **1.3** (no code)  
4. **1.1** live, copy gaps obvious → **1.4**  
5. **1.1** live + notes exist → **1.5** (may wait on traffic — that is the gate, not the calendar)  
6. All Wave 1 gates green → **1.6**, then **C1.1** or **D1** planning  

Update `PHASE_STATUS.md` changelog when a block completes.
