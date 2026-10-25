# Q4 Block 2 — Claim & Policy Evidence Register

**Purpose.** Single source of evidence for every public claim and structured-data
value introduced by StarMapCo Q4 Block 2 (comparison pages, `llms.txt`,
BlogPosting schema, Product shipping/returns schema). No claim ships in that
work unless it traces to an entry here marked **verified**.

**Governing documents.** Hardened build brief (Deliverable 1) and Monday
execution plan, Q4 Block 2. Linked issue: #374.

**Verified against:** `main` @ `2c304342`, 2026-10-25. Prices and thresholds
in this codebase are environment-configurable; repository evidence means
`wrangler.toml` `[vars]` plus catalogue/code fallbacks. Overrides set only in
the Cloudflare dashboard are outside repository evidence and are not asserted
here.

**Status key.** `verified` = supported by the cited repository source.
`unresolved` = plausible but not established; must not publish.
`excluded` = must not publish (in this work) at all.

---

## App inventory (where the facts live)

| Area | Implementation location |
| --- | --- |
| Runnable app | `star-map-app-final/` (repo-root trees are legacy scaffolding) |
| Print catalogue (SKUs, sizes, price fallbacks) | `src/lib/printCatalog.ts` |
| Pricing tiers, digital add-on, currency | `src/lib/pricing.ts` |
| Free-shipping threshold & qualification | `src/lib/printFreeShipping.ts`; applied in `src/app/api/checkout/route.ts` |
| Print shipping rates / destinations matrix | `data/printful-shipping.json`, rendered via `src/lib/printfulShipping.ts` |
| Canonical commerce copy (production/ transit lines) | `src/lib/commerceFacts.ts` |
| Policy pages | `src/app/shipping/page.tsx`, `src/app/returns/ReturnsContent.tsx` |
| Editor / preview flow | `src/app/editor`, `src/components/EditorExperience.tsx`, paywall in `src/lib/paywallPrintCheckout.ts` |
| Sky model | `src/lib/astronomy.ts` |
| Blog articles | `src/lib/blogPosts.tsx` (data) rendered by `src/app/blog/[slug]/page.tsx` plus static pages under `src/app/blog/<slug>/page.tsx` |
| Existing schema emitters | Per-page JSON-LD (blog articles emit `Article`), `src/components/ProductSchema.tsx`, `src/components/FaqSchema.tsx`, `src/app/layout.tsx` |
| Sitemap (published-route truth) | `src/app/sitemap.ts`, `src/lib/buildSitemapEntries.ts` |

---

## Register entries

### E-1 — Free live preview before paying — **verified**

- **Claim (exact):** "Design and preview your star map free in the editor before paying."
- **Required qualification:** The preview is free; the final product is not.
  Wording must never imply the HD file or a print is free.
- **Applies to:** All editor-driven products (digital HD, prints, canvas).
- **Source:** `src/components/EditorExperience.tsx` ("Generate preview"
  renders the map client-side before any paywall); `AGENTS.md` hello-world
  validation (editor preview requires no payment or secrets);
  `src/lib/paywallPrintCheckout.ts` (paywall is presented after preview).
- **Consumers:** `llms.txt` (#375), comparison pages (future PRs).

### E-2 — Moon + five planets in the sky model — **verified, qualified**

- **Claim (exact):** "The sky model can show the Moon and the five planets
  Mercury, Venus, Mars, Jupiter, and Saturn."
- **Required qualification:** A body appears only when it is above the horizon
  at the chosen date, time, and location. Wording must never imply all six
  bodies appear in every selected sky.
- **Source:** `src/lib/astronomy.ts` — `PlanetName` is exactly
  `"Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn"`; the Moon point is
  included only when its computed altitude is above 0.
- **Consumers:** `llms.txt` (#375), comparison pages (future PRs).

### E-3 — Printed in Canada — **excluded (VERIFY-FIRST, unresolved)**

- **Finding:** No in-repository Printful configuration, shipping matrix, or
  site copy establishes where prints are produced, for which products, or for
  which destinations. `data/printful-shipping.json` records destination
  rates and transit only; a repo-wide search finds no production-location
  claim or facility configuration.
- **Disposition:** Excluded from all Q4 Block 2 copy and schema until
  owner/operations evidence establishes destination/product scope. Must
  never be expanded into Canadian ownership, Canadian materials, or
  exclusive Canadian production, and StarMapCo must not be described as the
  only Canadian option.

### E-4 — Canvas gallery wrap, 14×14, $79 — **verified (repository configuration)**

- **Claim (exact):** "Canvas gallery wrap (14×14): $79 USD."
- **Applies to:** `canvas_wrap` variant. Currency: USD.
- **Source:** `src/lib/printCatalog.ts` (`canvas_wrap` row:
  `labelFallback` "Canvas gallery wrap (14×14)", `priceFallbackCents` 7900);
  no canvas price override in `wrangler.toml` `[vars]`; currency from
  `wrangler.toml` (`CURRENCY = "usd"`, `NEXT_PUBLIC_CURRENCY = "usd"`).
- **Caveat:** Price is env-overridable at deploy time; see the header note on
  repository evidence.
- **Consumers:** `llms.txt` (#375), format comparison + Product schema (future PRs).

### E-5 — Framed print (14×14) + HD digital add-on = $106 — **verified (repository configuration)**

- **Claim (exact):** "Framed print (14×14) with the HD digital add-on: $106 USD."
- **Bundle contents (exact):** Framed print 14×14 at $99 plus the HD digital
  add-on at $7. The HD file is available immediately after payment; the
  framed print follows made-to-order production and standard shipping.
- **Source:** `src/lib/printCatalog.ts` (`poster_framed` 9900;
  `wrangler.toml` `PRINT_FRAMED_PRICE_CENTS = "9900"`);
  `src/lib/pricing.ts` `getPrintDigitalAddOnPrice()`
  (`PRINT_DIGITAL_ADDON_PRICE_CENTS`, default 700);
  `src/lib/printFreeShipping.ts` qualifying hint ("Framed print + HD digital
  ($106) qualifies for free shipping");
  `src/lib/commerceFacts.ts` (`getPrintFramedHdBundleTimingLine()`).
- **Consumers:** `llms.txt` (#375), format comparison + Product schema (future PRs).

### E-6 — Free standard shipping at $100+ pre-discount merchandise subtotal — **verified (behaviour)**

- **Claim (exact):** "Free standard shipping on print orders with a
  merchandise subtotal of $100 USD or more, calculated pre-discount, before
  shipping and tax."
- **Applies to:** Print orders (poster/canvas SKUs). Not merch, not
  digital-only orders. Destinations: the print shipping matrix (E-7).
- **Source:** `src/lib/printFreeShipping.ts` — threshold default 10,000
  cents (`PRINT_FREE_SHIPPING_THRESHOLD_CENTS`, env-overridable);
  merchandise subtotal is computed from catalogue prices excluding shipping.
  `src/app/api/checkout/route.ts` — the free-shipping block states in its
  code comment that eligibility is decided on the **pre-discount**
  merchandise subtotal (audit F4 fixed the earlier after-discount behaviour
  that charged shipping on the $106 framed + HD bundle under a 15% promo).
  Customer-facing statement: `src/app/shipping/page.tsx`.
- **Consumers:** `llms.txt` (#375), Product schema (future PR — conditional
  representation still to be assessed there).

### C-1 — Recorded contradiction: /shipping promo sentence — **open, owner decision**

- **Contradiction:** `src/app/shipping/page.tsx` tells customers: "Promo
  codes that reduce the subtotal below the threshold may remove free
  shipping." That contradicts the implemented checkout behaviour and E-6:
  eligibility is decided on the pre-discount subtotal, so a promo does not
  remove free shipping from an order at $100+ pre-discount.
- **Disposition (per brief):** Recorded here and in issue #374. Q4 Block 2
  does not change commerce logic and does not edit policy copy on its own
  authority; the sentence should be corrected by a separate owner-approved
  change. Until then, Q4 Block 2 copy follows the verified behaviour (E-6).

### E-7 — Supporting policy facts — **verified (customer-facing policy implementation)**

- **Production:** Prints are made to order; typical production is 2–5
  business days before shipment. Standard shipping is the only print
  shipping option (no express). Source: `src/lib/commerceFacts.ts`
  (`PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS`, `getPrintStandardShippingOnlyLine()`).
- **Destinations:** Digital delivery worldwide. Physical print shipping to
  the countries listed in `data/printful-shipping.json` as rendered on
  `/shipping` (`getPrintAllowedCountries()`); rates and transit windows vary
  by destination and product profile. Source: `src/app/shipping/page.tsx`,
  `data/printful-shipping.json`.
- **Returns:** StarMapCo sells personalized products; digital downloads and
  made-to-order prints are generally non-refundable. Exceptions include
  duplicate charges and failed delivery caused by StarMapCo. If a print
  arrives damaged, defective, or materially different from the approved
  order, contact within 30 days of delivery with photos and order details.
  Merch defects are replaced free within 30 days of delivery. Approved
  refunds return to the original payment method, typically within 5–10
  business days. Destination duties/taxes are not refunded.
  Source: `src/app/returns/ReturnsContent.tsx`.
- **HD digital download:** From $9 USD (single). Source: `src/lib/pricing.ts`
  defaults (`PRICE_SINGLE_CENTS` / legacy `PRICE_CENTS`, default 900);
  public copy in `public/llms.txt` (pre-revision) states the same ladder.
- **Contact:** support@starmapco.com; https://starmapco.com/contact.
- **Consumers:** `llms.txt` FAQ and policy links (#375), Product schema
  policy fields (future PR).

### E-8 — Social proof — **internal limitation, excluded from public copy**

- **Record:** Wave 13 research snapshot (October 2026) reports StarMapCo has
  **2 Google reviews** while leading rivals have thousands. This is a
  strategy limitation, not publishable evidence.
- **Rules:** Google Business reviews must never be repackaged as product
  ratings. No `aggregateRating`, review counts, testimonials, or sales
  counts may appear in Q4 Block 2 copy or schema without qualifying
  product-level evidence registered here first. None exists today.

### E-9 — Competitor facts — **none registered**

- The Wave 13 rival teardown is research direction only. No competitor claim
  (including The Night Sky's preview experience, prices, or offer terms) is
  registered, and none may publish from Q4 Block 2 until direct, dated,
  primary-source evidence is added here. Absence of a feature on a
  competitor page does not establish that the competitor lacks it.

---

## Blog article inventory (basis for BlogPosting, issue #376)

- **Published set (20 URLs, per sitemap):** 19 `blogPosts` slugs plus the
  static `/blog/valentines-day-star-map` route. Source: `src/lib/blogPosts.tsx`,
  `src/app/sitemap.ts`, `src/lib/buildSitemapEntries.ts`.
- **Excluded:** `most-meaningful-valentines-day-gift-custom-star-map` is a
  `blogPosts` entry that redirects to another URL (`BLOG_SITEMAP_EXCLUDED_SLUGS`);
  it renders a redirect, not an article.
- **Rendering paths:** 7 `blogPosts` slugs are shadowed by static pages
  (astronomy-behind-star-maps, birth-star-map,
  choose-date-location-custom-star-map, custom-star-map-for-anniversary,
  custom-star-maps-for-weddings, memorial-star-map,
  personalized-star-map-birthday-gift); the remaining 12 render through
  `src/app/blog/[slug]/page.tsx`.
- **Current schema state:** Every article page emits one inline
  `Article` JSON-LD entity; none carries an `@id`.
- **Dates:** `blogPosts` carries a single `date` per post (publication date);
  no separate modification date exists in the data model. The static pages
  carry their own metadata dates.
- **Missing metadata (recorded, not to be invented):**
  `valentines-day-star-map` records no publication date anywhere in the
  repository — `src/lib/buildSitemapEntries.ts` documents that this route
  "records none, so it omits lastModified". Its BlogPosting entity must omit
  date fields rather than invent one.
