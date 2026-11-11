# StarMapCo Meta checkout adapter — 2026-11-10

Branch: `feat/meta-checkout-adapter`. Base: current `origin/main` at `905ac521`
(fast-forwarded from `e9e46f1d` before implementation). No PR, merge, deployment,
Commerce Manager changes, live purchase, or OurImprint changes are included.

`GET /api/meta/checkout` performs an exact product allowlist lookup and one 302
to the editor, with `source=meta_shop`. Unknown/malformed/excluded IDs return
302 `/shop` without setting cookies. Enabled merch uses the existing literal
public beta/per-family flag gates. Print availability and all payment/fulfillment
decisions remain with the existing editor and checkout.

## Coupon division of responsibility

The adapter performs syntax, two-code seasonal-window, and exported compatibility
policy checks only. It never imports, copies, or reimplements Stripe lookup.
It reuses `createReferralCookieValue` / `parseReferralCookieValue` for the signed
code inside a dedicated first-party `starmap_meta_checkout` cookie:
httpOnly, Secure, SameSite=Lax, path `/`, maximum age 86,400 seconds. Missing signing
configuration fails closed for coupon carry, using the existing referral signing
secret precedence. The carry reader also enforces the 24-hour age and campaign
window. Invalid codes clear previous carry on a valid product arrival.

The server-rendered editor page reads the cookie and passes its filtered contents
to the client. The existing editor promo selector includes the carried code as
`promoCode` in its ordinary checkout POST. Buyer edits/clearing remain authoritative;
the carried code is not added to persistent localStorage. Digital plan intent uses
the same carry payload and labels the corresponding existing paywall choice.

**Checkout is the final authority** for existence, activity, currency, minimum
amount, precedence and session creation. Current main can surface manual-promotion
rejection/lookup errors; it does not promise a silent full-price fallback in every
case. That existing behavior is preserved under the zero-diff fence. This is a
material limit of the brief's original silent-drop wording, even with the addendum.

## Assumptions and unverified integration points

1. The translation boundary assumes a fixed endpoint receiving exactly one
   `product_id`, optional `quantity`, and optional `coupon_code`, with ordinary
   query encoding decoded once by URLSearchParams. These names are assumptions,
   not a verified Meta contract. No aliases, placeholders, cart-list fields, or
   additional Meta parameters are implemented. Extra query fields are ignored;
   duplicate/missing product IDs fail closed; duplicate coupons are dropped.
2. Meta sends one canonical feed retailer ID, with exact case and no whitespace
   normalization. Multi-product carts are not supported by this scoped brief.
   The allowlist includes only its six print IDs, `hd_single`, `hd_pack3`, and five
   explicit `merch:<family_id>` IDs. Gift, subscription, add-on, and unknown IDs
   are excluded. **The existing GMC generator uses IDs such as
   `print_poster_unframed`: the separate Meta feed must align with the brief's
   canonical IDs before live testing.** No feed IDs are guessed or translated.
3. A single 302 to an editor is acceptable to Meta. Redirect tolerance and whether
   Meta demands an immediate session remain unverified. No configure-first page
   is built without the documented fallback trigger, and no session is minted.
4. Quantity is a single decimal string: absent/`1` means one; exact `2` selects the
   existing second-copy toggle on the four eligible prints. All other quantities
   are clamped to one and logged without logging raw user data. Digital/merch
   quantity two is clamped. Existing toggles, availability, disclosure (second
   copy 10% off), and checkout pricing remain authoritative; no bulk price exists.
5. The two public codes use finite 2026 Pacific windows: BLACKFRIDAY25 starts
   Nov 27 00:00 and ends Dec 1 23:59:59.999; XMAS15 starts Nov 1 00:00 and ends
   Dec 26 23:59:59.999. XMAS15 uses the brief's continuous validity-through-Dec-26
   assumption even while campaign publicity changes. Neither renews next year.
   Both are print coupons, never digital_comp coupons. Codes normalize to uppercase.
6. No digital-plan deep-link parameter exists in the editor. The specified fallback
   carries `single`/`pack3` via the cookie and marks the matching paywall choice;
   it does not auto-purchase or create a new plan query parameter. Buyers retain
   the normal choice among checkout buttons.
7. Currency is never set by the adapter. Existing country/shipping currency logic,
   pricing, promotions, margins, holds, asset requirements, handoff tokens and
   fulfillment remain authoritative. Disabled print checkout still permits editor
   arrival. Merch uses existing build-time literal environment reads and requires
   both beta and family flags; deployment must build with the intended flags.
8. The explicit build assignment overrides the prep brief's feed/documentation
   prerequisites for implementation. No live catalog identity, Meta preview,
   checkout-URL acceptance, real purchase/webhook fulfillment, or production probe
   is claimed. Those remain for the later human gate and Commerce Manager step.
   No BF dry-run checklist activation is assumed because shops going live before
   Dec 1 has not been established.

## Validation

All commands run from `star-map-app-final` with Node **22.23.4** prepended to PATH.

| Command | Result |
| --- | --- |
| `npm run test:unit` at clean base `905ac521` | 2,778 tests; 2,761 pass; 17 fail; 0 skipped (2,758 top-level) |
| `npm run test:unit` at implementation head | 2,811 tests; 2,794 pass; 17 fail; 0 skipped (2,791 top-level) |
| `node --test scripts/unit/metaCheckout.test.mjs` | 33/33 pass, A1–A7 plus cookie/translation/fence cases |
| `npm run lint` | Pass, 0 errors; 14 warnings in existing code |
| `npm run typecheck` | Pass |
| `git diff --check` | Pass |
| `npm run qa:smoke:commerce -- --reporter=line` | 31 pass, 1 fail in the host's Vancouver timezone: draft replacement expects Jan 2, receives Jan 3 |
| Same failed browser case with temporary UTC context | 1/1 pass; no application or tracked test changes |
| Full commerce smoke with temporary UTC context | 32/32 pass (1.7m) |
| `npm run build` | Pass (webpack production build, 119 static pages generated) |
| Local HTTP probes against the smoke dev server | Pass: 302 print/second-copy/attribution; signed XMAS15 carry appears in the editor's server-rendered client props; subscription returns 302 `/shop` with no cookies |

The 17 full-suite failure names match base/head exactly. They include Windows
absolute-path ESM imports, CRLF-sensitive source assertions, timezone expectations,
fixture/platform assertions and existing policy/source checks. No unrelated tests
or implementation were changed to mask them. Raw local logs:
`C:\agent\meta-905ac521-base-unit.log`, `C:\agent\meta-head-unit.log`,
`C:\agent\meta-focused.log`, `C:\agent\meta-lint.log`,
`C:\agent\meta-typecheck.log`, `C:\agent\meta-commerce-browser.log`,
`C:\agent\meta-commerce-utc-probe.log`, `C:\agent\meta-commerce-utc.log`,
`C:\agent\meta-build.log`. Chromium was initially absent and was installed with
`npx playwright install chromium` before the reported browser-enabled smoke run.
The first attempt (`meta-commerce.log`) also logged local Cloudflare emulator
SQLite locking warnings; it was stopped after the browser-enabled reruns finished
and is not counted as a successful smoke run. UTC probes
use a temporary, uncommitted config that extends the repository config with
`use.timezoneId = 'UTC'`; the full command is
`npm run qa:smoke:commerce -- --config .tmp/meta-utc-playwright.config.ts --reporter=line`.

A3 exercises the real signed-cookie reader and existing exported editor promo
selector, with source-wiring assertions through the server page/client/editor to
the existing checkout payload assignment. It does not claim a Stripe integration
purchase. A6 executes every mapped product across quantity/coupon combinations
with network access trapped and a Stripe constructor trap: zero calls. A7 starts
a fresh process to test the real literal env gate with a family disabled.

## Protected file evidence

`git diff --exit-code 905ac521 -- src/app/api/checkout/route.ts src/lib/checkoutPromotions.ts`
returns 0 with no output. Committed base blob IDs, pinned in a unit test
(normalizing checkout CRLF to Git's LF representation):

- `src/app/api/checkout/route.ts`: `4f8b28bed8d8d58e214e9bda2d50a2d5b264ed00`
- `src/lib/checkoutPromotions.ts`: `927699d1920cc4905f7bbe20c75daaf728a2e467`

## Files changed

- `src/app/api/meta/checkout/route.ts`: arrival adapter, carry/attribution cookies.
- `src/lib/metaCheckout.ts`: translation boundary, exact allowlist, windows/policy,
  editor links and quantity rules.
- `src/lib/metaCheckoutCookie.ts`: signed promo carry and bounded reader.
- `src/app/editor/page.tsx`, `src/app/editor/EditorPageClient.tsx`,
  `src/components/EditorExperience.tsx`: cookie-to-existing-client-checkout wiring.
- `src/components/PaywallModal.tsx`: carried digital-plan choice label.
- `src/lib/printCatalog.ts`: Meta feed refresh governance note for SKU/copy/price changes.
- `scripts/unit/metaCheckout.test.mjs`, `metaCheckout.hooks.mjs`,
  `metaCheckoutStripe.stub.mjs`, `metaCheckoutDisabledMerch.mjs`: acceptance tests
  and isolated route dependency/flag probes.
- `docs/META_CHECKOUT_ADAPTER_BUILD.md`: this review handoff.
