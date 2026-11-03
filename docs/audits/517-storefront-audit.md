# #517 — storefront and purchase-path UX audit

Date: 2026-11-03. Source baseline: `c77b47a200e006fb9b36cfb207063c0d96d19005` (main). Live observations: starmapco.com, installed Chrome 156, Windows, desktop 1440×900 and mobile 390×900; focused purchase-dialog measurement 390×844.

Read-only audit. No fixes, payment submission, checkout-session creation, price/SKU/promo/configuration change, production credentials, or customer data access. Findings that involve purchase presentation are routed to Jack's gated lane. Independent review remains required.

## Findings

### B2-01 — P1: quick-start form drops the selected product and funnel intent

**Measured reproduction:** Open [Shop](https://starmapco.com/shop), enter synthetic date `2024-03-15` and location `Victoria`, press the quick-start framed-print button. Its DOM formAction is `/editor?mode=quick&source=shop-framed&checkout=print&print_variant=poster_framed`. Chrome navigated to **`/editor?date=2024-03-15&location=Victoria`**. All four intent/source parameters were absent. This is a browser GET-form behavior, not an assumed failed render. Geocoding was mocked to an empty list for this one test; that affects location resolution but not the native form serialization defect.

**Source evidence:** `star-map-app-final/src/components/PreviewStartForm.tsx:58` builds intent solely into the action URL; lines 71–80 add checkout/variant/add-on flags; line 178 uses a native GET form; line 244 supplies that URL through formAction. The visible promise at line 269 says the matching checkout path is preselected. Successful form controls carry date/location/optional coordinates, but do not carry those intent fields. GET submission replaces the query portion of the form action.

**Buyer impact:** A buyer deliberately choosing a format or add-on lands in the neutral editor instead. The same reusable component serves product landing starts, so selected print variants/add-ons and attribution can be lost even though ordinary direct links work. Date and location survive, which makes this easy to miss in a superficial funnel test.

**Smallest-fix sketch:** In a separately scoped PR, make selected intent part of the submitted GET controls (including correct submitter semantics) or construct the full navigation URL from validated FormData and the selected intent. Do not change payment logic. Pin framed, digital, neutral, add-on, keyboard-submit, and city-prefill paths with real browser URL assertions; also preserve no-JS behavior deliberately. Treat purchase handoff as fenced for implementation until routed/approved.

### B2-02 — P2: mobile purchase dialog buries the first purchasable format beneath roughly two screens of preliminaries

**Measured reproduction:** Direct editor entry with `checkout=print&print_variant=poster_framed`, select the sample moment, observe the automatically opened “Order your printed star map” dialog. At 390×844, dialog top was 42.20px, height 759.59px, client height 758px, scroll height 2524px. After selecting United States, the first enabled format button (framed + HD) began at viewport y=1678.53px, over 1600px below the dialog start. Framed-only began at 1810.61px and canvas at 2370.42px. No purchase button was clicked.

**Source evidence:** `star-map-app-final/src/components/PaywallModal.tsx:427` supplies the scroll container; optional recovery email at 470 and promo field at 490 precede the product choices; delivery timing is at 643; the format-button mapping begins at 687. The dialog repeats production/delivery and format explanation before the actionable ladder.

**Buyer impact:** A mobile buyer who already chose framed on the landing must scroll substantially before seeing a usable purchase action, after optional fields and explanatory material. This is measured friction, not a claim of a blocked checkout or measured conversion loss. The close control is correctly labelled and available near the top.

**Smallest-fix sketch:** Gated purchase-presentation PR: put selected/recommended format summary and shipping-country choice before optional recovery/promo and long guidance; keep mandatory price/shipping/legal disclosure before submission, with secondary explanations in disclosure panels. Consider a sticky selected-format action only after all requirements are satisfied. Measure first-action visibility and keyboard/focus order at 320/390/768px. No payment behavior change belongs in this audit.

### B2-03 — P2: “unframed starts at” differs between Shop and the generic poster landing

**Live evidence:** [Shop](https://starmapco.com/shop) advertises unframed from **$39 USD**, with a 16×16 card at that price. [Star-map poster](https://starmapco.com/star-map-poster) labels its hero **“Unframed starts at” $49 USD**, without a size in that hero label. Its detailed content emphasizes 18×18. The [16×16 product page](https://starmapco.com/products/star-map/poster-16x16/usd) is live and lists the smaller option. This is not a claim that either item's configured price is wrong.

**Source evidence:** `star-map-app-final/src/app/shop/page.tsx:343` uses unframed16Price for the floor; `star-map-app-final/src/app/star-map-poster/page.tsx:69` uses poster_unframed, and lines 164–165 label that price as the unqualified starting price.

**Buyer impact:** Comparison shopping suggests the entry price rises by $10 between two general-purpose pages; a buyer may not discover that these describe different sizes.

**Smallest-fix sketch:** Copy-only approved follow-up: qualify the poster landing hero as “18×18 unframed” and link the lower-cost 16×16 option, or use an explicitly consistent entry-format summary. Do not change prices or SKUs. Verify the same size/price pairing across hero, cards, structured data, and editor entry.

### B2-04 — P2: framed price lines imply extra shipping even when the same live experience identifies free shipping

**Live evidence:** Shop's framed 14×14 card and the generic poster landing show **$99 USD + shipping**, while the pages also advertise free standard shipping at an **$89 USD merchandise subtotal**. In the measured US purchase dialog, framed-only was **$99 USD + free shipping** and framed + HD was $106 USD with free shipping. Thus the $99 product already qualifies in the observed US case; the generic teaser does not communicate that advantage. No payment charge or actual shipment quote was verified.

**Source evidence:** `star-map-app-final/src/app/shop/page.tsx:141` and the framed card at 183 use the generic formatted print price; `star-map-app-final/src/app/star-map-poster/page.tsx:65`/159–160 do the same. Source line references identify presentation call sites only; the audit did not modify or diagnose payment internals.

**Buyer impact:** The site makes the actual total appear less predictable and can make the digital add-on seem necessary to achieve free shipping. The destination caveat must be preserved; a blanket worldwide promise would be the wrong fix.

**Smallest-fix sketch:** Gated presentation/copy follow-up: state qualifying free-standard-shipping eligibility alongside the standalone framed price, with destination/discount/subtotal qualifications, instead of an unconditional extra-shipping implication. Keep checkout as the final authoritative quote and do not alter the threshold, prices, discounts, or shipping logic.

## Coverage and positive checks

- Live GET-only visits to `/shop`, `/star-map-poster`, `/shipping`, and `/products/star-map/{poster-16x16,framed-14x14,canvas-14x14}/usd`, each at 1440×900 and 390×900.
- No horizontal document overflow in these 12 page/viewport combinations: measured scrollWidth 1425 or 375 against viewport 1440 or 390 (desktop scrollbar consumes 15px).
- Product pages expose concrete dimensions and product names; current shop includes the 16×16 and 18×18 posters, framed 14×14, and canvas 14×14. No missing canvas-size finding is asserted.
- Shipping page discloses made-to-order production, destination-dependent transit, estimated rather than guaranteed dates, and standard-only shipping. No invented Black Friday delivery guarantee is recommended.
- Editor entry reviewed at both desktop/mobile; print dialog reviewed before any payment CTA. Country selection was local UI state only. The purchase modal has an accessible close label and visibly offers print and digital routes.
- Promotional campaign text was observed on some hydrated pages. No coupon validity, expiry, discount stacking, or holiday-date correctness was tested, and no campaign change is recommended from this audit.

## Commands and results

Commands ran from repository root unless noted. Browser scripts were temporary audit helpers outside the repository; each blocked every request method except GET/HEAD/OPTIONS. They used the installed Chrome executable `C:/Program Files/Google/Chrome/Application/chrome.exe`; no personal browser profile was reused.

| Command / tool | Result |
|---|---|
| GitHub fetch issue #517 and all comments | Issue read fully; zero comments |
| `Get-Content ASTRA_BRIEF.md; Get-Content ASTRA_PROGRAMME.md` | Read programme and fences |
| `rg --files star-map-app-final/src/app/shop star-map-app-final/src/app/star-map-poster` | Located storefront pages |
| `Get-Content star-map-app-final/src/components/PreviewStartForm.tsx` (read in two Select-Object chunks) | Verified GET form and submitter intent structure |
| `rg -n 'method="GET"|formAction=|buildEditorAction|params.set|quick-start buttons' star-map-app-final/src/components/PreviewStartForm.tsx` | Located exact evidence lines |
| `rg -n 'max-h-\[90vh\]|Email for checkout|Promo code|Delivery timing|Gift format ladder|printRows.map|print-title|Framed starts|Unframed starts' star-map-app-final/src/components/PaywallModal.tsx star-map-app-final/src/app/star-map-poster/page.tsx` | Located presentation ordering and price-label lines |
| `node "$env:TEMP/astra-programme/517-live.cjs"` | Exit 0; six page/viewport observations saved locally |
| `node "$env:TEMP/astra-programme/517-products.cjs"` | Exit 0; six product-page/viewport observations saved locally |
| `node "$env:TEMP/astra-programme/517-form.cjs"` | Exit 0; actual framed form URL lost intent as documented |
| `node "$env:TEMP/astra-programme/517-editor.cjs"` | Exit 0; desktop/mobile sample preview and purchase presentation observed |
| `node "$env:TEMP/astra-programme/517-dialog.cjs"` | First run failed because generic dialog locator also matched cookie consent; narrowed locator to named purchase dialog, final run exit 0 with geometry above |
| `git rev-parse HEAD; git rev-parse origin/main` | Both c77b47a200e006fb9b36cfb207063c0d96d19005 at evidence collection |

Initial web-reader opens of Shop/poster/shipping returned mixed-age cached content (Shop marked four months old). Those cached prices and shipping thresholds were discarded as live evidence. All numerical findings above come from the direct browser checks, not that cache. Additional read-only rg/Get-Content searches inspected storefront wording, editor purchase presentation, and seasonal banner copy. No payments implementation logic was changed or exercised.

## Unverified and boundaries

No Stripe-hosted checkout session was created or inspected; no Buy/checkout action was submitted; no email, address, payment, subscription, refund, or production order was entered. Hosted payment UI, real payment methods, tax totals, address validation, delivery fulfillment, confirmation emails, and download entitlement were not verified. All POSTs (including analytics) were blocked, so this run does not prove analytics delivery. UK/CAD/other-currency totals and locale/assistive-technology coverage remain unverified. Browser evidence is a point-in-time public-site observation, not proof that the deployed commit equals local main. No lint, typecheck, unit suite, build, commerce/render smoke, or CI validation was run for this read-only documentation audit.

Prioritize B2-01 before campaign traffic, then reduce mobile choice friction (B2-02). B2-03/04 are trust-copy fixes subject to the same commercial fences. File separate implementation issues; never fix them within this audit PR.

## Disposition — 2026-11-03 (post-audit; appended at the merge gate, historical text above unchanged)

All four findings were fixed after this audit was written; the closing instruction to file separate implementation issues is **superseded** — do not file duplicates.

- **B2-01 (P1)** — filed as issue #528 (CLOSED); fixed by PR #529, MERGED dd2bc218 (2026-11-03T17:16:14Z).
- **B2-02 (P2)** — fixed by PR #546, MERGED 0732b485 (PaywallModal restructure; post-merge live probes verified).
- **B2-03 (P2)** — fixed by PR #546, MERGED 0732b485 (size-qualified "Unframed 16x16 starts at" copy).
- **B2-04 (P2)** — fixed by PR #546, MERGED 0732b485, plus rider PR #547, MERGED 6dc6679b (WhatYouReceiveModule framed card; the old framed shipping line was verified at 0 occurrences live).

No implementation items from this audit remain open; the fix lanes' deployment verification (+5/+20 probes) is recorded in QUEUE.md. Full finding-by-finding mapping: the disposition comment on PR #525 (2026-11-03).
