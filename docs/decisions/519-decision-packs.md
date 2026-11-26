# #519 — Six owner decision packs (decision-ready shortlist; cost sign-off blocked)

Research date: 2026-11-03 UTC. Docs only. No prices, SKUs, flags, checkout, fulfillment or downloads were changed. Public catalog requests used no credentials. No account/customer/order data was read.

**Owner summary:** shortlist one larger square poster, add white/red-oak choices at the current frame size, prefer 18×18 as the first replacement canvas, pilot a two-map poster product before three-panel canvas, and hold landscape print behind the documented render/identity gates. These are proposals, not launch approvals. Future-style gating remains an explicit policy choice; #514's fifth style remains free under the existing directive.

**Evidence gap:** real account-specific delivered fulfillment costs and actual payment fees could not be established without account access. Public catalog IDs, base prices and regional availability were verified live; shipping comes from the committed estimate matrix as a clearly labeled proxy. A public shipping quote returned HTTP 401. Do not close this issue as fully cost-verified or interpret the modeled margins below as invoice margins. No secrets were requested or loaded to fill the gap.

## Shared economics and provenance

- Live, unauthenticated Printful catalog GETs: [posters/product 1](https://api.printful.com/products/1), [framed posters/product 2](https://api.printful.com/products/2), [canvas/product 3](https://api.printful.com/products/3). All returned HTTP 200 on 2026-11-03 at approximately 16:16 UTC. IDs below are **variant IDs**, not product IDs. Public `in_stock=true` is a catalog observation, not a delivery promise. The full selected snapshot is in `519-public-catalog-evidence.json`.
- The public catalog reports USD. It differs from both the public website and committed COGS: poster 18×18 is $13.25 now versus $14.75 in `printCatalog.ts` (dated Oct 26); canvas 14×14 is $18.75 now versus $20.75 in code. These differences are **not** evidence of a production pricing defect or proof of what this account will pay.
- [Printful pricing guidance](https://help.printful.com/hc/en-us/articles/50262099109777-How-does-Printful-s-product-pricing-work) makes the distinction between base cost and additional charges. A true delivered cost requires the account's base/discounted item price, destination-specific shipping, fulfillment tax, surcharges, and currency conversion. None is safely replaced by a marketing “from” price.
- `star-map-app-final/data/printful-shipping.json` currently models single-item US/CA shipping in USD: poster $4.49/$5.17; frame $9.84/$10.77; canvas $10.05/$17.12. **Not a verified quote for new sizes/colours or this date.** Larger packages may cost more. Its destination delivery ranges are not used as holiday promises here.
- [Bank of Canada observation](https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1): 2026-11-02, **1 USD = 1.3978 CAD** (HTTP 200). CAD calculations translate USD costs at that observation, not the repo's old 1.40 reference. This is an observation, not a locked FX rate.
- Payment planning assumption: 2.9% + 0.30 in the sale currency. The [Canadian Stripe price page](https://stripe.com/en-ca/pricing) confirms 2.9% + C$0.30 for domestic cards; the USD $0.30 assumption mirrors the repo estimator and is **not a verified Canadian-account USD fee schedule**. International cards, FX, disputes/refunds and account pricing can change it.
- Contribution means sale price minus modeled item cost, modeled seller-paid shipping and assumed payment fee, before advertising, staff, overhead, fulfillment tax, returns/replacements, discounts and exchange fees. It is not accounting net profit. All proposed prices assume shipping included, no promotion and no extra customer shipping revenue.

Formula: `US contribution = P_USD × 0.971 − 0.30 − base_USD − ship_USD`; `CA contribution = P_CAD × 0.971 − 0.30 − (base_USD + ship_CA_USD) × 1.3978`. Contribution margin is contribution / price. Every extra $1 fulfillment cost lowers contribution $1 (or C$1.3978), and every extra 1% payment fee lowers margin one percentage point.

The programme's “62–70% after Printful/shipping/Stripe” is a target/context claim, **not a verified universal rate**. The repo already documents 16×16 poster delivered margins of 54.45% US / 51.72% CA in `printCatalog.ts`; the old March rollout matrix is stale and mixes an old canvas variant with old costs. Do not reuse its projected margin column. For target margin m, allowable all-in fulfillment cost is `P × (1 − fee% − m) − fixedFee`. Use that ceiling to approve or reject an actual quote.

## 1. More print sizes per format

**Decision proposed:** add only one meaningful size rung per format after its quote/proof clears; avoid a large dropdown before demand is known. Poster 20×20 is the first shortlist; frame 16×16 is the next; canvas handled in pack 3. Existing poster 16×16 (4465) and 18×18 (6242) already exist and should not be proposed as new work.

| Format / candidate | Verified variant | Public base USD | Availability-region codes observed |
|---|---:|---:|---|
| Poster 12×12 (smaller alternative) | 4464 | 9.50 | US, CA and other regions |
| Poster 20×20 (recommended shortlist) | 48496 | 13.75 | US, CA, UK, EU/EU_LV |
| Poster 24×24 (later) | 48499 | 16.25 | US, CA, UK, EU/EU_LV |
| Framed black 16×16 | 4655 | 37.72 | CA, US, AU |
| Framed black 18×18 | 4656 | 43.18 | US, AU; CA not listed |

Proposed tests: poster 20×20 US$59/$69/$79 and C$83/$97/$111; frame 16×16 US$119/$129/$139 and C$167/$181/$195. Numeric model is in the shared table below. Recommendation: quote/proof poster at $69/C$97; larger framed at $139/C$195 if preserving a 62% contribution target matters. These are decision candidates only, not edits to live prices. A seller-paid tax/surcharge or larger-size shipping quote can invalidate the modeled threshold.

True delivered cost: **unverified**. Public base plus existing proxy gives poster $18.24 US / $18.92 CA-equivalent USD; frame $47.56/$48.49. Request explicit US/CA destination estimates for each exact variant before a build issue. Prove art dimensions, mat/frame safe areas, merchant copy and fulfillment writer mapping in the separately approved lane.

## 2. Frame colours

**Decision proposed:** keep the current 14×14 size for the first colour expansion; offer Black / White / Red Oak with truthful colour-specific preview assets. All have equal public base at this size, so colour alone does not justify a fabricated COGS surcharge.

| 14×14 frame | Variant | Public base USD | Regions observed |
|---|---:|---:|---|
| Black (existing) | 4654 | 33.81 | US, AU |
| White | 10757 | 33.81 | US |
| Red Oak | 15027 | 33.81 | CA, US |

The [official framed-poster page](https://www.printful.com/custom/wall-art/framed-posters/enhanced-matte-paper-framed-poster-in) lists these three colours and multiple sizes. Regional catalog metadata is not a destination eligibility guarantee: absence of CA here does not prove that a US-made frame cannot ship to Canada, but it **does** require a delivered quote and lead-time check before claiming identical availability.

Price candidates for each colour: US$99/$109/$119; C$139/$153/$167. Proxy delivered cost $43.65 US / $44.58 CA-equivalent USD before taxes. Even the highest proposed candidate models under 62% after seller-paid shipping. Recommendation: colour parity rather than colour surcharge; keep the existing-price question separate from this design choice. If the owner requires the 62–70% band, get actual quotes and raise the whole frame price candidate set instead of asserting the band already holds.

True delivered cost, colour-specific lead times and proof quality: **unverified**. No SKU/config mutations authorized.

## 3. Replace the 14×14 canvas with a full-size canvas

**Decision proposed:** shortlist **18×18 variant 19306**, retaining square aspect and increasing face area by about 65% over 14×14. Keep 20×20 as the premium alternative; do not infer “full-size” means a mandatory 24×24 without the owner's size pick.

| Canvas | Variant | Public base USD | Compared with existing 14×14 |
|---|---:|---:|---|
| 14×14 existing | 19302 | 18.75 | Baseline; standing spec says replace |
| 16×16 | 824 | 27.25 | +31% face area; small cost saving vs 18×18 |
| 18×18 (recommended) | 19306 | 28.75 | +65% face area |
| 20×20 | 19308 | 33.50 | +104% face area |
| 24×24 | 19314 | 41.25 | +194% face area; greater package/proof risk |

All above were catalog in-stock in US/CA/UK/EU/EU_ES/AU at retrieval. [Official canvas page](https://www.printful.com/custom/wall-art/canvas-prints/canvas-in) confirms the size family and wrapped construction; its public web prices differ from the API response, reinforcing that neither is an account invoice.

18×18 candidates: US$99/$109/$119; C$139/$153/$167. 20×20: US$109/$119/$129; C$153/$167/$181. Proxy delivered cost for 18×18 is $38.80 US / $45.87 CA-equivalent USD, and 20×20 $43.55/$50.62. These reuse 14×14 shipping only as a sensitivity input, **not a known cost for the larger canvas**. Canada contribution in these models misses 62% even at the top prices. Recommendation: choose 18×18 conceptually, but do not approve launch price until exact-size quotes and Canadian economics are reconciled.

Replacement is not an in-place reinterpretation of old orders: preserve old variant 19302 fulfillment/replay records; new orders need a separately reviewed catalog transition and new wrap/crop proofs. All such code is fenced from this issue.

## 4. Couples pair / set-of-3 / triptych

**Decision proposed:** pilot two distinct square poster maps first; defer continuous-image triptych and canvas sets. A quantity-2 repeat of one design is not a multi-map product: each distinct design must have its own asset-to-line association. Existing second-copy support must not be assumed sufficient.

| Candidate | Physical components / verified IDs | Public base sum USD | Conservative modeled shipping US / CA USD |
|---|---|---:|---:|
| Couples pair | Two 16×16 posters, variant 4465 on separate design lines | 25.00 | 8.98 / 10.34 |
| Three-map story set | Three 16×16 posters, 4465 | 37.50 | 13.47 / 15.51 |
| Canvas triptych concept | Three 12×16 canvases, variant 5, separate art panels | 67.50 | 30.15 / 51.36 |

Shipping above assumes one full existing profile rate per component. It is deliberately **not an actual combined-order quote** or guaranteed upper bound for new packages. Printful [warns that wall art may ship separately](https://help.printful.com/hc/en-us/articles/50265136897169-Are-all-products-in-an-order-shipped-together). Repo `printMargin.ts` contains measured Oct 26 **same-item second-copy** shipping increments (poster +$0.39 US/+0.25 CA; canvas +$9.71/+16.49), but those do not validate two distinct art lines, three quantities, or a new size. No consolidation saving is promised here.

Candidate prices: pair US$79/$89/$99, C$111/$125/$139; three posters US$109/$129/$149, C$153/$181/$209; three canvases US$249/$279/$299, C$349/$391/$419. See modeled contributions below. Recommend pair at $99/C$139 as the first quote/proof candidate, with set-of-three at $149/C$209 only if demand appears. Canvas triptych has the weakest Canadian shipping economics and needs cropping/bleed/gap proofs; do not launch it from margin arithmetic alone.

True multi-line fulfillment costs: **unverified**. Required gate: separate distinct-design quote, quantity3 quote, destination split/parcel evidence, order writer/asset mapping review, partial-failure/reprint behavior, truthful parcel messaging. Those are fenced build tasks.

## 5. Landscape print SKUs

**Decision: HOLD.** A purchasable Printful blank does not make the app's landscape rendering or identity chain safe. [#510](https://github.com/daveybehavey/starMapAppV2/pull/510) found unknown landscape aspect IDs fall back to square in saved/archival/authority dimensions, plus measured long-row overflow. No new evidence here overturns that no-go.

| Landscape concept using a rotatable physical blank | Variant | Public base USD |
|---|---:|---:|
| 20×16 matte poster (catalog 16×20) | 3877 | 12.75 |
| 20×16 black frame (catalog 16×20) | 4399 | 42.61 |
| 20×16 canvas (catalog 16×20) | 6 | 27.50 |
| 24×18 poster (catalog 18×24) | 1 | 13.75 |

All four catalog variants report US/CA availability regions. Rotation/orientation, exact print-file orientation and hanging hardware must be validated per product; these are candidate blank IDs, **not verified landscape-ready StarMapCo SKUs**. Printful's [API guidance](https://developers.printful.com/docs/) warns that mismatched file aspect crops content.

Economic candidate for the entry landscape poster only: US$49/$59/$69 and C$69/$83/$97. Proxy fulfillment $17.24 US/$17.92 CA-equivalent USD, contribution table below. Even attractive economics do not lift the render/identity gate. True delivered costs remain unverified. Recommendation: defer all landscape print work until a separate approved digital/render/identity programme supplies passing parity and saved-design evidence, then proof one format before framing/canvas.

## 6. Premium gating for future styles — both sides, no recommendation

Printful variant and incremental physical fulfillment cost: **not applicable** to a digital style entitlement. If a style is printed, its physical variant costs are unchanged by merely selecting colours/typography; rendering/support/storage/entitlement costs remain unmeasured. Do not invent a Printful SKU for a style.

| Policy | Benefit hypothesis | Cost / risk / proof needed |
|---|---|---|
| All styles free | Coherent with fonts and #514; richer previews may improve conversion; simpler restore/share behavior | No direct style revenue; needs conversion/retention evidence |
| Future styles premium | Potential incremental revenue and differentiation | New entitlement/paywall/restore/archive edge cases; buyer confusion; maintenance and support costs; separate approval in fenced lanes |

Possible incremental one-time fees to research, **not a recommended price**: US$0/$5/$10 or C$0/$7/$14. At a modeled 2.9% fee, adding $5/$10 to an existing order yields $4.855/$9.71 before other costs; CAD $7/$14 yields C$6.797/C$13.594. A separate standalone charge also incurs the assumed fixed fee: USD $4.555/$9.41; CAD C$6.497/C$13.294. At zero price there is no standalone payment and no payment fee. These are marginal receipts, **not net margins**; no operating-cost data or willingness-to-pay experiment was run. Existing entitlements/grandfathering, accessible previews and share recipients would require policy decisions. The explicitly free fifth style in #514 is not reopened by this pack.

## Candidate-price calculation table — estimates, not true invoice margins

| Scenario | USD prices → modeled US contribution $ (%) | CAD prices → modeled CA contribution C$ (%) |
|---|---|---|
| 20x20 poster | 59 → 38.75 (65.7%); 69 → 48.46 (70.2%); 79 → 58.17 (73.6%) | 83 → 53.85 (64.9%); 97 → 67.44 (69.5%); 111 → 81.03 (73.0%) |
| 16x16 black frame | 119 → 67.69 (56.9%); 129 → 77.40 (60.0%); 139 → 87.11 (62.7%) | 167 → 94.08 (56.3%); 181 → 107.67 (59.5%); 195 → 121.27 (62.2%) |
| 14x14 frame colours | 99 → 52.18 (52.7%); 109 → 61.89 (56.8%); 119 → 71.60 (60.2%) | 139 → 72.36 (52.1%); 153 → 85.95 (56.2%); 167 → 99.54 (59.6%) |
| 18x18 canvas | 99 → 57.03 (57.6%); 109 → 66.74 (61.2%); 119 → 76.45 (64.2%) | 139 → 70.55 (50.8%); 153 → 84.15 (55.0%); 167 → 97.74 (58.5%) |
| 20x20 canvas | 109 → 61.99 (56.9%); 119 → 71.70 (60.3%); 129 → 81.41 (63.1%) | 153 → 77.51 (50.7%); 167 → 91.10 (54.6%); 181 → 104.69 (57.8%) |
| two 16x16 posters | 79 → 42.43 (53.7%); 89 → 52.14 (58.6%); 99 → 61.85 (62.5%) | 111 → 58.08 (52.3%); 125 → 71.68 (57.3%); 139 → 85.27 (61.3%) |
| three 16x16 posters | 109 → 54.57 (50.1%); 129 → 73.99 (57.4%); 149 → 93.41 (62.7%) | 153 → 74.17 (48.5%); 181 → 101.35 (56.0%); 209 → 128.54 (61.5%) |
| three 12x16 canvases | 249 → 143.83 (57.8%); 279 → 172.96 (62.0%); 299 → 192.38 (64.3%) | 349 → 172.44 (49.4%); 391 → 213.22 (54.5%); 419 → 240.41 (57.4%) |
| landscape 20x16 poster | 49 → 30.04 (61.3%); 59 → 39.75 (67.4%); 69 → 49.46 (71.7%) | 69 → 41.65 (60.4%); 83 → 55.24 (66.6%); 97 → 68.84 (71.0%) |

## Minimum evidence required before the owner signs off any launch

1. Exact variant IDs and dimensions confirmed again at time of approval; destination eligibility and manufacturing region checked separately.
2. Store-specific cost estimates for exact items and realistic US/CA destinations, with product cost, shipping, tax, currency and discount status separated. No customer PII needed.
3. True fulfillment invoice/estimate reconciliation and actual aggregate payment-fee basis. Quote-based launch forecast must still be labeled a forecast.
4. Updated contribution math using those figures, sale-tax treatment, refunds/reprints reserve and expected promotions. The 62–70% context is not a substitute.
5. Physical proof assets and a separate owner-approved build/fulfillment issue. Nothing in this pack authorizes a catalog, price, checkout, print-pipeline or production-config change.

## Research / validation ledger

Commands ran in the owner checkout or the stated temporary folder. Only temporary artifacts were written by the researcher.

- GitHub `fetch_issue` and `fetch_issue_comments` for #519: open issue read; zero comments.
- `Get-Content ASTRA_PROGRAMME.md; Get-Content ASTRA_BRIEF.md`: read scope/fences. AGENTS.md was provided and read in the parent context.
- `rg -n '62.?70|margin|14.?14|variant' docs star-map-app-final/docs -g '*.md' | Select-Object -First 70`: located cost provenance and older reports.
- `rg --files star-map-app-final | Select-String 'shipping.*(json|md)$|print.*(json|md)$|margin|rollout-matrix'`: located matrix/catalog/model files.
- `rg -n 'PRINTFUL_VARIANT|PRINT_COGS|PRINT_MARGIN_STRIPE|PRICE_PRINT|CANVAS' star-map-app-final/wrangler.toml`: read only relevant public catalog identifiers; no secrets.
- `Get-Content star-map-app-final/docs/upsell-rollout-matrix.md | Select-Object -First 150`: found March data; not used as current cost truth.
- `Get-Content star-map-app-final/src/lib/printCatalog.ts | Select-Object -First 100`; `Get-Content star-map-app-final/src/lib/printMargin.ts | Select-Object -Skip 128 -First 55`; `Get-Content star-map-app-final/data/printful-shipping.json | Select-Object -First 100`: inspected provenance and proxy inputs.
- `Get-Content star-map-app-final/scripts/generate-upsell-rollout-matrix.mjs | Select-Object -First 170`: read only; **did not run** it because it loads dotenv/account credentials.
- Read-only Node extraction of US/CA rates from committed JSON: poster 4.49/5.17, framed 9.84/10.77, canvas 10.05/17.12 USD.
- `node "$env:TEMP/astra-programme/519-fetch-catalog.cjs"`: exit 0; anonymous GET products 1/2/3 and Bank of Canada FX; selected minimal nonpersonal fields saved in `519-public-catalog-evidence.json`.
- `node "$env:TEMP/astra-programme/519-margin-model.cjs"`: exit 0; generated the candidate arithmetic table above. Inputs and formulas included; it makes no service calls.
- Anonymous POST `https://api.printful.com/shipping/rates` with variant 19306 quantity1 and public example destination Chapel Hill NC 27514, US: HTTP 401 Unauthorized; no order was created. No credential retry attempted. Web-tool opening the catalog/FX JSON first returned inaccessible; direct public GETs subsequently succeeded.
- Additional anonymous GETs `/products/variant/6242`, `/products/variant/4654`, `/products/variant/19302`: HTTP 200; used to identify product families, before filtered snapshot fetch.
- Official public web reads: Printful canvas/framed product pages, product-pricing explanation, shipping packaging policy, API docs, Stripe Canada pricing. Search results from third parties were not used for numeric claims.
- A guessed `printVariants.ts` path and wildcard shell path searches failed; subsequent exact `printCatalog.ts`/`printMargin.ts` reads succeeded. No test pass inferred from searches.

**Not run:** authenticated Printful calls, actual account invoices, actual Stripe fee audit, checkout or paid order, live fulfillment simulation, product proof orders, test suites, build, deployment, configuration/price changes. This is a research document, not an implementation validation. No claim that true fulfillment costs or account-specific margins have been verified. Independent commercial review and missing cost evidence remain outstanding.

### Packaging verification

The committed fetch script writes its snapshot beside itself; the committed margin script prints the table without writing files. From the repository root, `node --check docs/decisions/519-fetch-catalog.cjs` and `node --check docs/decisions/519-margin-model.cjs` both exited 0. `node docs/decisions/519-margin-model.cjs` exited 0 and reproduced the candidate arithmetic table. The relocated fetch script was syntax-checked, not rerun; the research snapshot above is retained. `git diff --cached --check` passed before commit. No application tests were run for this documentation-only branch.
