# X2 Canadian copy consistency — stopped at ownership collision

Operator task X2, 2026-11-03 (America/Vancouver). Draft only. Implementation is blocked; this is a partial source audit, not a completed site-wide copy correction.

## Scope stop

Open PR changed-file lists were inspected for #527, #566, #567, #568, #569, #570, #571, #572, #576, #577, #578, #579, #581 and #582.

- #568 owns `star-map-app-final/src/data/seoOccasions.ts`, `src/components/HomeOfferStack.tsx`, and wedding/anniversary pages.
- #571 owns `star-map-app-final/src/app/shop/page.tsx` and several other marketing routes.
- #570 owns homepage and Black Friday page.
- #576 owns birthday, generator and gift-ideas pages; #577 owns blog content.

The requested marketing/shop scope collides with these tasks. Per the operator's explicit stop rule, no customer-facing implementation, workaround in another component, or borrowed branch changes are included. This new audit path has no overlap with the inspected file lists.

## Confirmed copy defects left for the owning tasks

Paths below are relative to `star-map-app-final/`. Remote main content was checked through the GitHub connector; line numbers refer to that inspected content.

| Evidence | Finding | Bounded follow-up after ownership clears |
| --- | --- | --- |
| `src/data/seoOccasions.ts:102` | New-baby description says “HD from $9” without a currency. The Valentine's, where-we-met and first-date entries also contain bare-dollar prices. | Use the existing currency-labelled price helpers for displayed amounts; avoid duplicating price literals. |
| `src/data/seoOccasions.ts:32` | Engagement description says “free shipping $89+” without currency, destination eligibility or subtotal qualification. Other occasion entries repeat an unqualified $89 threshold. | Reuse the site's canonical free-shipping disclosure after checking its currency/destination/subtotal rules. Do not change the threshold or policy. |
| `src/data/seoOccasions.ts:727` | One FAQ combines bare-dollar framed+HD $106, posters $39–$49, canvas $79, card $19 and digital $9. | Derive amount and currency labels from existing helpers. This audit does not establish a numerical catalog mismatch. |
| `src/app/shop/page.tsx:47` | Visible merch description uses “colors”. | Use “colours” for Canadian copy once #571 ownership clears. |
| `src/data/seoOccasions.ts:248` and first-home FAQ | Mixed spelling includes “personalize” and “neighborhood” alongside “favourite”. | Align editorial spelling to Canadian usage; retain routes, identifiers, assets and user-entered design text. |

## Catalog comparison and limits

Read-only inspection of `src/lib/printCatalog.ts` shows USD fallback prices of $39/$49 for the two unframed sizes, $99 framed, $79 canvas and $19 card; corresponding CAD fallbacks are $55/$69, $139, $111 and $27. `src/lib/pricing.ts` defaults standalone digital to 900 cents and the digital print add-on to 700 cents, so $106 framed+HD is consistent with USD fallbacks ($99 + $7). These are source defaults, not verified live totals.

The existing `formatPrice` explicitly appends the ISO currency code. Bare-dollar prose bypasses that convention. The shop already uses `formatPrice` for primary price labels; do not replace that working behaviour or assume every shop amount is ambiguous.

No price/SKU/promo value, catalog or payment helper was modified. Environment overrides and production totals were not accessed. No numerical price drift is confirmed by these sampled rows. Exhaustive routes, all variants, live page metadata and deployment state remain unaudited after the collision stop.

## Judgement calls / owner questions

- Keep SEO URL slugs such as `/personalized-star-map` unchanged. Should established search-target titles retain “personalized” while editorial body copy uses Canadian spelling? Record a style decision before broad title/metadata replacements.
- Should static metadata omit amounts, or use the existing server price helpers with explicit USD/CAD labels? Do not invent a parallel currency selection policy.
- Unqualified free-shipping language requires the canonical eligibility disclosure; this task does not authorize a threshold, destination or discount policy change.
- Delivery-speed phrasing requires evidence and owner judgement; no stronger delivery promise was introduced. No customer-facing claim of immediate delivery was added.
- No checkout, Stripe/payment, HD-download/DL-1, print-order, price/SKU/promo or production-config/flag edits are authorized here.

## Validation and provenance

- Read root `AGENTS.md` locally and from remote main. The explicit operator task supplies authorization and requires one draft PR; no additional issue was created.
- Local `git status --porcelain`: clean. Local HEAD was `d2660d6`; it is not represented as current main.
- `git fetch origin`: failed because the configured proxy was unreachable. No bypass attempted. GitHub connector reads and branch/file/PR operations were used instead.
- Scoped `rg`, `sed` and source reads inspected marketing/shop copy, pricing defaults and formatter. An exploratory search named nonexistent `printPricing.ts`; corrected reads used `pricing.ts`.
- GitHub connector fetched current-main AGENTS, occasion data, shop page, print catalog, pricing, commerce facts, shipping and print checkout disclosure configuration read-only.
- Application tests, lint, typecheck, build and pixel comparisons were not run for this documentation-only stop. No application, render input or design asset changes exist in this patch; no measured rendering-equivalence claim is made.
- GitHub Actions remains authoritative where workflows trigger. Independent review is pending.

One task, one branch, one draft PR. Never mark ready, merge, deploy, dispatch production workflows or enable auto-merge. Rollback: revert the single documentation commit.
