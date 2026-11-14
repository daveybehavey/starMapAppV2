# IA-1c report

## Base and isolation

- Fetch succeeded: `git fetch origin` in `C:/Users/ReuseTechBC/projects/starMapAppV2`.
- Exact fetched base: `90d84850282ebcee4e050fec3744c1984e89a78f` (matches the brief).
- `git rev-parse --is-shallow-repository` returned `false`; no unshallow needed.
- Created fresh worktree with `git worktree add -b fix/merch-apparel-explicit-size C:/Users/ReuseTechBC/projects/sm-ia1c origin/main`.
- All edits, dependency installation, and validation ran in the fresh worktree. The original checkout was not switched or edited. Fetch/worktree registration necessarily updated shared Git metadata.
- This explicit bridge brief governs the work; no push, PR, deploy, sends, production configuration, or Stripe/Printful API access occurred.

## Re-verified census at the base

Paths below are relative to `star-map-app-final/`; line numbers refer to the unmodified base.

| Location | Verified mechanism |
| --- | --- |
| `src/lib/merchCatalog.ts:132-146` | `tee_unisex_bc3001`: DTG garment; S, M, L, XL, 2XL, 3XL; Black, Navy, White, Athletic Heather. |
| `src/lib/merchCatalog.ts:155-168` | `hoodie_unisex_g18500`: DTG garment; same size list; Black, Navy, Sport Grey. |
| `src/lib/merchCatalog.ts:74,100,121` | Stickers, magnets, pins have dimension sizes and no colour lists. |
| `src/components/EditorExperience.tsx:494-495` | Size and colour state start as empty strings. |
| `src/components/EditorExperience.tsx:603-604` | Requested-family effect seeds the first size and first colour in separate statements. |
| `src/components/MerchPurchasePanel.tsx:65-66` | Product change seeds first size and colour in separate statements. |
| `src/components/MerchPurchasePanel.tsx:116,125` | Size display falls back to first size, masking the empty `Select…` option. |
| `src/components/MerchPurchasePanel.tsx:147-148` | Checkout payload falls back to first size and first colour. |
| `src/components/MerchPurchasePanel.tsx:151` | Existing disabled condition is only in-flight or shipping-country missing. |
| `scripts/unit/merchMobileParity.test.mjs` | Existing five shared-panel and desktop/mobile parity pins. |
| `src/lib/loveItGuarantee.ts:20` | Policy explicitly excludes apparel size refunds/exchanges. |

No material census difference. Searched the application source for size setters, merch size fields, and family URL parameters. The only editor size writes are initialization, requested-family seeding, and the shared panel callbacks. Shop cards (`src/app/shop/page.tsx:532,630`), default catalogue links (`src/lib/merchCatalog.ts:299`), saved-map offers (`src/lib/mapCommerceLinks.ts:90`), and Meta editor routing (`src/lib/metaCheckout.ts:118`) carry family only. The checkout route separately accepts `merch_size`, but does not populate editor state. `startMerchCheckout` (`EditorExperience.tsx:2464-2480`) forwards panel options without a size default. No explicit-size entry path into this state was found.

## Change and rule

`isApparelMerchFamily` in `src/lib/merchCatalog.ts` is the single apparel definition: match a catalogue family by ID whose technique is `dtg`. At this base this means exactly the tee and hoodie; a runtime catalogue test pins that exact set and excludes all three dimension-size families. No catalogue entries/options changed.

Explicit choice is represented by the existing size string: apparel starts/resets to `""`, and only the size select supplies a nonempty apparel value. Both requested-family seeding and product changes clear apparel size, including switching between garments or returning to one. The apparel display uses the state directly, preserving the `Select…` placeholder; the payload uses that same state without a substitute. Checkout adds `isApparel && !size` to its existing disabled condition. Returning to the placeholder disables checkout again. A plain helper line explains the requirement.

Every non-apparel branch retains the original seeding, display and payload expression; the added disabled predicate is false for those families. Desktop and mobile still share the same panel/state.

Colour finding for Jack: colour still silently defaults to the first option at requested-family seeding, product changes, select display (`MerchPurchasePanel.tsx:91` at base), and payload construction. This is intentionally unchanged and explicitly pinned. No colour gate was added.

## Validation commands and results

PowerShell, from `C:/Users/ReuseTechBC/projects/sm-ia1c/star-map-app-final` unless otherwise stated. Existing cached Node used; no runtime install:

```powershell
$env:PATH='C:/Users/ReuseTechBC/AppData/Local/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/bin;'+$env:PATH
$env:TZ='UTC'
node --version
# v22.23.5
```

The first `npm ci` completed successfully (751 packages) but the system npm launcher selected Node v26.13.0/npm 11.20.0 and emitted an engine warning despite PATH. No dependency manifest/lockfile changes or other installs were made. An incidental base `npm run test:unit` followed that launcher; its results were not used as the authoritative comparison. Subsequent npm commands explicitly used the Node 22 executable through PATH plus npm's CLI script, ensuring their child `node` commands use Node 22.

- Base and final plain suite: `node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run test:unit`. This is the unchanged plain `npm run test:unit` script, `node --test scripts/unit/*.test.mjs`, without filtering. Base: exit 1, 3143 tests, 3126 pass, 17 fail. Final: exit 1, 3150 tests, 3133 pass, 17 fail. Both ran with Node 22.23.5 and TZ=UTC. Exact failure name-sets are below and identical.
- Focused: `node --test scripts/unit/merchMobileParity.test.mjs`: exit 0, 12/12 pass (five existing plus seven new). All 12 exact names are present as passing tests in the final plain command output. An initial pin-development run caught CRLF in a line matcher; the matcher was corrected to handle CRLF/LF before validation.
- Negative control: temporarily replaced `disabled={checkoutInFlight || shippingCountryMissing || apparelSizeMissing}` with the original `disabled={checkoutInFlight || shippingCountryMissing}` using a saved in-memory copy and `try/finally` restoration. Ran the same focused command: exit 1, 11 pass, one fail, named `IA-1c: apparel checkout requires a size alongside the existing gates`. Restored the exact original file and reran: exit 0, 12/12 pass. No mutation committed.
- `node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run typecheck`: exit 0, clean.
- `node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build`: exit 0; production webpack compilation and all 120 static pages succeeded. Prebuild regenerated `public/merchant-feed.xml`; its one-line generated change was restored afterward.
- `git diff --check`: clean.

The source pins lock all four guarded size expressions (including their unchanged non-apparel branches), size setter wiring, empty placeholder, existing in-flight/shipping gates, exact apparel census, and unchanged colour expressions. They are source construction tests, not a browser interaction claim.

### Base failure name-set

- business profile never publishes phone; href stays empty
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

### Final failure name-set

- business profile never publishes phone; href stays empty
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

## Scope attestation

The final branch diff adds/changes only:

- `IA1C-REPORT.md`
- `star-map-app-final/src/components/MerchPurchasePanel.tsx`
- `star-map-app-final/src/components/EditorExperience.tsx` (helper import and size seeding only)
- `star-map-app-final/src/lib/merchCatalog.ts` (apparel helper only)
- `star-map-app-final/scripts/unit/merchMobileParity.test.mjs`

No other tracked file changes are retained. Build outputs/dependencies are local ignored artifacts; the generated tracked merchant feed was restored. Validation logs are outside the worktree (`C:/Users/ReuseTechBC/projects/ia1c-*.log`). No price, catalogue option, policy, checkout route/session, config, production/customer data, or colour behaviour changes.
