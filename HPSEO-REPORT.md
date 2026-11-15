# run-hpseo2 — homepage striking-distance push

## Authorization and base

- Approved scope: David's 2026-11-14 HP-SEO bridge brief supplied with this job, citing the programme board and sales push. Its explicit issue/PR workflow waiver applies. No issue created, no push, no PR, no merge, no deployment.
- Fresh full clone from `https://github.com/daveybehavey/starMapAppV2.git` into `C:\Users\ReuseTechBC\projects\sm-hpseo2`. Neither the original checkout nor `sm-hpseo` was reused.
- Ran `git fetch origin`, then `git rev-parse origin/main` before branching. Verified base: **`ffa00121355e9d1043a7888b20b9fd2f15c214ea`**, unchanged from the brief's last-known head.
- Branch: `fix/homepage-striking-distance`, created directly from that fetched base.
- Initial C: disk gate: **12.42 GiB free**, above 6 GiB. No disk cleanup or deletion performed.
- Node **22.23.5**, official Windows x64 archive verified against its published SHA-256. Node 22 directory prepended to PATH; **TZ=UTC** for validation. No production secrets or service credentials were used.
- Read root `AGENTS.md`. The fresh origin does not contain `ASTRA_BRIEF.md` or `ASTRA_PROGRAMME.md`; the supplied job brief is the complete approved scope. The repository's `QUEUE.md` concerns a different programme item; no claim is made to have independently retrieved the external HP-SEO board or raw GSC file.

## Evidence and response

Source: the supplied GSC snapshot, 2026-10-17 through 2026-11-13 (28 days). These figures are provided evidence, not a new live pull.

| Evidence | Homepage response |
| --- | --- |
| `/`: position 8.97, 86 impressions, 7 clicks, 8.1% CTR; 7 of the property's 10 clicks | Keep the homepage as the target. Name custom star maps in the H1 and give the title, descriptions, and hero a clear gift purpose. |
| `anniversary star map`: position 63.5 | Anniversary language in title, description, hero, and occasion copy; contextual hero link to `/anniversary`. |
| `anniversary night sky print`: position 38 | Explain using a wedding date for an anniversary night sky print in homepage occasion copy. |
| `baby star map gift`: position 42 | Mention a baby's birth in both descriptions and hero; explain using birth date/place and adding a name or dedication. |
| `are star maps accurate`: position 50 | Answer that exact question in the existing FAQ, explaining calculation inputs and approximate-time limitations. The visible answer and FAQ JSON-LD share the existing builder. |
| `starmapco`: position 1 | Retain the brand in the title; do not treat this as a branded-search problem. |
| `/star-map-generator`: 87 impressions, position 45.6; `free star map generator`: position 46.25 | Contextual free-preview link from the homepage hero. No changes to the generator page and no retargeting of this job. |
| Birthday gift intent specified by the brief; no birthday query metric supplied | Birthday language in title, descriptions, hero and occasion copy; contextual hero link to `/birthday`. |

**Scale:** 86 homepage impressions in 28 days is a small opportunity. This is a bounded, inexpensive relevance/internal-link improvement, not a traffic flood or a promise of rankings or sales. No post-change ranking result exists because this branch has not been published.

## Exact before/after copy

| Field | Before | After |
| --- | --- | --- |
| Homepage title (also Open Graph and Twitter title) | Custom Star Map — Preview Free, Print or Download \| StarMapCo | Custom Star Map Gifts for Anniversaries & Birthdays \| StarMapCo |
| Meta description, print enabled | Create a personalized star map for any date and location — preview the exact night sky for free, then order a framed print, unframed poster, or HD digital download. Perfect for anniversaries, weddings, and birthdays. | Give a star map for an anniversary, birthday or baby's birth. Preview the sky calculated for your date and place free, then choose a print or HD download. |
| Meta description, digital only | Create a personalized star map for any date and location — preview the exact night sky for free, then order an HD digital download. Perfect for anniversaries, weddings, and birthdays. | Give a star map for an anniversary, birthday or baby's birth. Preview the sky calculated for your date and place free, then choose an HD download. |
| H1 | The night you became everything. | Your moment. Your custom star map. |
| Layout default title (unchanged) | StarMapCo \| Custom Star Map & Constellation Map | StarMapCo \| Custom Star Map & Constellation Map |

Hero supporting copy: “Celebrate an anniversary, a birthday, or a baby's birth with the stars from your date and place.” Anniversary and birthday are real links. The secondary free-preview note links to `/star-map-generator`; the primary editor CTA and existing homepage preview form retain their destinations and behavior.

The short occasion section explains anniversary, birthday, and baby use cases, then links `/constellation-map` in a sentence about tracing star patterns with constellation lines and labels. All four requested routes exist in the app.

## Claim verification and structured data

All paths below are within `star-map-app-final/` unless stated otherwise.

| New or retained claim relevant to this change | Repository evidence |
| --- | --- |
| Free preview, with no account required | `src/components/HeroEditorDeferred.tsx` submits date/location to the editor without authentication; `src/app/star-map-generator/page.tsx` provides its preview entry; existing `tests/ui-smoke.spec.ts` exercises creating and customizing a visible preview without checkout. |
| Sky calculated for the selected date and place | `src/lib/renderSky.ts`: `computeSky` passes the recipe's stored `datetimeISO`, latitude, and longitude to `computeVisibleStars`; `src/lib/astronomy.ts` uses `astronomy-engine`, the bundled stars, and an observer at that location. |
| Time/timezone matter; approximate time limits accuracy | `src/lib/astronomy.ts` converts local wall time/timezone to an instant; `scripts/unit/astronomyInstant.test.mjs` covers instant handling; `src/app/how-accurate-are-star-maps/page.tsx` already explains time, place, and visibility limitations. The new answer avoids promising an exact photographic reconstruction. |
| Names, dedication text, constellation lines and labels | Existing editor customization and recipe text boxes in `src/lib/renderSky.ts`; the existing homepage customization FAQ and `/constellation-map` page describe these supported options. No new feature is claimed. |
| Poster/framed price range and digital price, verified but not added to copy | `src/lib/printCatalog.ts` USD fallbacks: 16×16 poster 3900 cents, 18×18 poster 4900 cents, framed 14×14 print 9900 cents. `src/lib/pricing.ts` single-HD default is 900 cents. These are repo defaults, not a live price audit; currency/overrides and shipping are handled by existing helpers. |

`src/app/layout.tsx` already emits `#site-schema` with Organization and WebSite, the configured site URL (default `https://starmapco.com`), business profile name/contact information, logo, and sameAs links. The existing organization contract test checks the owner-confirmed founding date. No missing or contradictory item relevant to this job was found; **layout and Organization/WebSite JSON-LD were left unchanged**. The homepage's existing Product schema, offers, and pricing logic were also unchanged. Only the accuracy item in the shared visible-FAQ/schema builder changed.

## Validation

All commands ran from `star-map-app-final/` with Node 22.23.5 and TZ=UTC, sequentially. `NEXT_TELEMETRY_DISABLED=1` was set for checks. `npm ci` passed (755 packages); `npx playwright install --with-deps chromium` passed. No dependency or lockfile changes were made.

Focused command (same at base and head):

```text
node --test --test-concurrency=1 scripts/unit/astronomyInstant.test.mjs scripts/unit/organizationSchema.test.mjs scripts/unit/heroViewportFit.test.mjs scripts/unit/issue206ConversionCopy.test.mjs scripts/unit/printCatalog.test.mjs scripts/unit/pricingLadder.test.mjs
```

| Command | Base | Head |
| --- | --- | --- |
| Focused command above | 58 passed, 0 failed | 58 passed, 0 failed |
| `npm run test:unit -- --test-concurrency=1` | 3,154 tests: 3,137 passed, 17 failed; 0 skipped | 3,154 tests: 3,137 passed, 17 failed; 0 skipped |
| `npm run lint` | Exit 0; 0 errors, 17 warnings | Exit 0; 0 errors, 17 warnings |
| `npm run typecheck` | Exit 0 | Exit 0 |
| `npm run build` | Exit 0 | Exit 0 |
| `npm run qa:smoke:ui` | 18 passed | 18 passed |
| `npm run qa:smoke:commerce` | 32 passed | 32 passed |
| `npm run qa:smoke:render` | 9 passed | 9 passed |
| `npm run qa:smoke` | 23 passed | 23 passed |

The existing homepage browser smoke assertion was updated for the new H1 and extended to verify title/description, contextual hero links, Organization/WebSite types, and equality of the visible accuracy answer with FAQ JSON-LD. No test count was added or removed.

Additional built-page check: started the local production server with `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3006`, then ran `node C:\Users\ReuseTechBC\projects\run-hpseo2-evidence\visual-check.mjs`. At 360×800, 390×844, 1280×800, and 1920×1080 there was no horizontal overflow and the primary CTA remained in the first viewport. Confirmed rendered title, digital-only description, H1, contextual hero URLs, and canonical `https://starmapco.com/`. Inspected 390px and 1280px screenshots. Existing mobile value-prop/trust rows are tightly spaced; a local DOM comparison with the original copy confirms overlap already exists (CSS unchanged). The new copy is readable and does not obscure the primary CTA. Screenshot/geometry evidence stays outside the branch.

The **same 17 unit failures occur at base and head**. Their TAP failure diagnostic blocks are identical after removing only `duration_ms` lines; comparison saved as `unit-failure-comparison.json`. They were not silently repaired:

1. business profile never publishes phone; href stays empty
2. city prune: next.config redirects pin the full 21-entry map, one hop, no chains
3. city prune: next.config keeps the host redirects alongside the city map
4. deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
5. source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
6. retired posts permanently redirect one hop to the survivor
7. wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers
8. fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
9. frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
10. passes when every named critical smoke command discovers tests
11. fails with the exact command and spec when Playwright discovers zero tests
12. aggregate rating helpers are referenced nowhere outside the lib module
13. no public copy states a review count or a numeric rating for StarMapCo
14. PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
15. saved-map API sanitizer validates and retains fontWeight
16. fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
17. composition: the renderer consumes the SAME clip path for the sky and the watermark

Logs and local validation scripts: `C:\Users\ReuseTechBC\projects\run-hpseo2-evidence\` (outside the branch). These are local results; GitHub Actions has not run on this unpublished branch. Build-generated merchant feeds are preserved outside the checkout and restored to the tracked version. The dev server's generated app-level `AGENTS.md` is excluded from the deliverable.

## Explicitly unchanged

- Checkout, payment code, downloads, print pipeline, catalog, prices, currency/shipping behavior, editor logic and preview rendering.
- Every other page, including `/star-map-generator`, `/anniversary`, `/birthday`, `/new-baby`, `/constellation-map`, and the accuracy guide.
- Root layout/default metadata, navigation, footer, Organization/WebSite schema, homepage Product schema and offers.
- Promo/Black Friday copy, promo behavior, existing reviews/testimonials/customer claims, images and assets.
- Dependencies, lockfile, production configuration, secrets, permissions, CI workflows, deployment state and production data.
- No new pages, generated imagery, GitHub issues, pushes, PRs, merges or deploys.

Application edits are limited to `src/app/page.tsx`, `src/app/HomeHero.tsx`, and `src/app/HomeStaticSections.tsx`; the only test edit is the existing homepage smoke in `tests/ui-smoke.spec.ts`.

## Bundle handoff

Artifact path: `C:\Users\ReuseTechBC\projects\qhpseo2.bundle`, containing only `refs/heads/fix/homepage-striking-distance` and its complete reachable history. The source clone is not shallow. Packaging commands are `git bundle create C:\Users\ReuseTechBC\projects\qhpseo2.bundle refs/heads/fix/homepage-striking-distance`, `git bundle verify`, `git bundle list-heads`, and a fresh `git clone --branch fix/homepage-striking-distance` from that bundle into `C:\Users\ReuseTechBC\projects\sm-hpseo2-bundle-test`, followed by commit/tree comparisons and `git fsck --full` in the test clone.

The final commit/hash, bundle checksum, and actual verification/test-clone results are recorded in the companion `C:\Users\ReuseTechBC\projects\run-hpseo2.out`, after packaging this committed report. This avoids a self-referential commit hash in the report. No push or PR is part of this handoff.
