# PROMO-DISCLOSURE validation — 2026-11-11

Bridge queue brief: Jack; chair condition from PR #627. Local-only delivery on `feat/meta-dropped-promo-notice`, based on `origin/main` at `0e8e2ae1`. No push, PR, merge or deployment.

## Behavior

`resolveMetaCheckout` sets `couponDropped` when the parsed coupon is non-empty and the unchanged coupon filter returns null. `createMetaCheckoutCarry` stores a signed, product-bound `droppedPromo` marker in the existing `starmap_meta_checkout` cookie. The rejected code is not stored. The existing signing helper, key selection, 24-hour expiry and HttpOnly/Secure/SameSite=Lax/path=/ settings are preserved. Missing signing material fails closed.

`src/app/editor/page.tsx` renders the notice server-side above `EditorPageClient`, only with a validated marker and `source=meta_shop`:

> That discount code could not be applied to this item, so the price shown is the full price.

The editor and its purchase controls remain available. Prices, coupon eligibility, `filterMetaCoupon`, and canonical checkout are unchanged.

## Validation

Tests/checks use Node v22.23.4 with `TZ=UTC`. Unit files run sequentially. Commands below run from `star-map-app-final/` unless noted. Dependencies were bootstrapped with `npm ci` (system npm initially used Node 26; validation explicitly used Node 22 via PATH).

| Command | origin/main baseline | Changed |
| --- | --- | --- |
| `node --test --test-concurrency=1 scripts/unit/*.test.mjs` | 2,838 tests: 2,822 pass, 16 fail | 2,848 tests: 2,832 pass, same 16 fail |
| `node --test --test-concurrency=1 scripts/unit/metaCheckout.test.mjs scripts/unit/metaPromoDisclosure.test.mjs` | — | 57 pass, 0 fail |
| `node node_modules/eslint/bin/eslint.js src scripts tests next.config.mjs eslint.config.mjs playwright.config.ts` | exit 0; 0 errors, 14 warnings | exit 0; 0 errors, 14 warnings |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 | exit 0 |
| `git diff --check` (repo root) | — | exit 0 |

Exact failing test names were compared after stripping TAP ordinals: no additions or removals. The targeted tests render the actual async server landing page with the interactive client editor isolated by a test stub; they check the notice and its position before the editor, including unknown/invalid/incompatible/expired codes, retained codes, absent/empty codes, normal editor visits, tampered product/signature/time, expiry, malformed carry and missing signing material. Existing Meta tests also retain canonical checkout and promotion-policy blob fences.

Production build and Playwright browser smoke were not run. GitHub Actions remains the authoritative validator.

Raw local logs: `star-map-app-final/node_modules/.cache/q2-validation/` (not committed).

## Unchanged baseline failures
- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- city prune: next.config keeps the host redirects alongside the city map
- deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- retired posts permanently redirect one hop to the survivor
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers
- fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
- frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
- passes when every named critical smoke command discovers tests
- fails with the exact command and spec when Playwright discovers zero tests
- aggregate rating helpers are referenced nowhere outside the lib module
- no public copy states a review count or a numeric rating for StarMapCo
- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- saved-map API sanitizer validates and retains fontWeight
- fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
- composition: the renderer consumes the SAME clip path for the sky and the watermark

