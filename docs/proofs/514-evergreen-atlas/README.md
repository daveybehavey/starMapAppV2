# Evergreen Atlas — #514 implementation proof

Owner selection/build authorization: [issue #514](https://github.com/daveybehavey/starMapAppV2/issues/514#issuecomment-6610215114). Specification: [merged design](../../design/514-fifth-style-concepts.md). Baseline: `f420491c298c3b259f9e56973ee6a36c23f2770a`.

## Implementation and boundaries

Evergreen Atlas is a free fifth style. The implementation adds its complete independent theme/profile, explicit defaults, minimal/polished typography, two render-preset entries, the shared signature showcase, three style selectors, draft validation and saved-map ID support. The showcase uses automatic typography bindings; the four older showcases still use explicit clones. New tier typography carries no positions, so selecting the style does not reposition authored rows. Explicit colour/font/weight remain protected. `shapeLayoutVersion`, `frameStyle`, `bortleClass` and `starColorMode` are absent from the new style defaults. The existing recipe builder may materialize its ordinary resolved defaults (e.g. Bortle 4.5); that is not a new style default.

Saved-map validation previously discarded `transparentBackground` and `showTechnicalRing`. These two keys are retained **only for Evergreen Atlas** so its explicit defaults and later tier choices round-trip. Historical sanitization, fallback IDs and old preset payloads stay unchanged for older styles.

No checkout, payment, download, print-pipeline, price, flag, watermark, astronomy, global initial style, recipe-version or quality-tuning changes. The renderer changes consist solely of the new theme and profile entries. No downstream style rejection was found in the application-root audit; existing style checks, exhaustive maps and normalizers were inspected. Print/delivery compatibility is not established by this local renderer proof.

## Stable fixture and actual pixels

[Fixture input](../../../star-map-app-final/scripts/evergreen-atlas/fixture.json) and [resolved recipe](fixture-recipe.json): Victoria 48.4284,-123.3656, America/Vancouver, `2026-11-04T05:00:00Z` (November 3 at 9 PM local), seed `default`. The bundled fonts are explicitly loaded through FontFace and `document.fonts.ready` before renderer capture. [Manifest](manifest.json) records file/font hashes and environment metadata. System Chromium 154.0.8037.57, Linux, Node v24.19.0 were used.

These are real `buildRecipeFromState` / `renderStarMap` outputs through temporary local harness routes following the existing `scripts/frame-inset-print-invariance/run.mjs` convention. The routes are removed after capture and are not shipped. Internal unwatermarked rendering uses the existing `watermark: false` test parameter. No live entitlement bypass or production service was used. The thumbnail embeds the actual 1200px output inside SVG; it is not a separately drawn illustration.

- [1200px contact sheet](contact-sheet.png): all five styles; circle/square and rectangle/4:5. Each source PNG is individually committed at 1200px width.
- [Shape contact sheet](shape-contact-sheet.png): 40 labelled geometry samples (all five shapes × all four aspect IDs × legacy/v2, short centered rows, frame on).
- [480-case shape matrix](shape-matrix.json): additionally crosses 10/64-character rows, left/center/right alignment and frame on/off; exact recipe and pixel hashes. The contact sheet is a subset of this full render sweep, not a screenshot of every stress-text case.
- [Mode/tier contact sheet](mode-contact-sheet.png), [matrix hashes](mode-matrix.json), 36 individual PNGs: minimal/polished/custom × astronomical/enhanced/illustrated × classic/cinematic/blueprint/luxe option treatments. Render modes are editor mappings to RenderOptions, not an independent renderer argument. The cross-product explicitly chooses visualMode after applying the mode's glow/line/emphasis treatment at intensity 65.
- Six individual `stars-*.png` captures: ordinary/premium test surfaces × off/subtle/realistic. Premium star rendering can override fixed theme colour as it already does; that path was not changed.
- [Desktop selector](selector-desktop.png), [mobile selector](selector-mobile.png), and `proof-1440.png` / `proof-390.png`: actual selector/focus UI and renderer harness at the requested viewport widths. The selector tests run unpaid and activate the style with Enter.
- [6000 × 6000 digital render](evergreenAtlas-6000.png), [decoded pixel hash](digital-6000.json): direct local renderer at export quality; no download or physical-print pipeline execution.

Enhanced mode already uses the theme palette, so no precedence change was needed. The new default background fill is `#071B17`, with existing vignette, polish/Milky Way and film-grain treatments visible in the result. Astronomical mode retains the existing mode palette (`#050915`, `#9eb6d1`, `#f8fbff`); illustrated mode uses the theme. These differences are intentional preservation of the existing precedence, not evidence that every visual mode has identical green pixels.

## Exact old-style identity

[432-case identity report](identity.json) compares the baseline and candidate using the same browser, fonts, fixture and renderer arguments. **432/432 recipe SHA-256 and raw decoded RGBA SHA-256 pairs match**, including text binding bytes. Each style has 108 cases: three tiers × three visual modes × legacy/rectangle/4:5 or v2/circle/square × three qualities (preview/og/export) × premium false/true. Premium-star overrides are exercised by the separate new-style captures; the old identity sweep uses the existing tier/default star settings.

Representative first raw-pixel SHA-256 pair per style (both revisions have the same value):

| Style | Matching SHA-256 |
|---|---|
| navyGold | `cf8f87b06465a5e0d8be6e81498d482e15c3b5027b1047f5cef80e3dc5be694e` |
| vintageEngraving | `86465603702f7e59894d868de2fc276bfb63414454541b25af96d2578b2f64d0` |
| parchmentScroll | `0c32b2086e221360a2c6dacb205a6723df1d8f21c7de8dd5f8f57f446da312ef` |
| midnightMinimal | `b06b088f735a29805bc575aa5dd82b2f46581b8ce8c2c5a9160e53dfdb90cc00` |

[Source identity](source-identity.json) independently asserts exact source bytes for all 16 old theme/profile/minimal/polished typography entries. [Old catalog identity](old-catalog-identity.json) asserts deep identity of the four existing showcase presets (including bindings), style defaults and tier options. Its serialized baseline/candidate catalog hashes both equal `f2edf31a2f505aaf301bb622825502813bbb9d4b5b5cbc290c17f0a2013dcc25`.

This is exact equality for the recorded matrix plus unchanged old rendering entries/control flow; it is not an assertion that every possible recipe, font rasterizer, browser and OS combination was exhaustively rendered.

## Measured contrast and limitations

[Raw measurements](contrast.json) use WCAG relative luminance on actual renderer RGB values at 1200px. Text figures below compare each solid specified text colour with every pixel of its **text bounding rectangle's actual sky backing**. These are backing samples, not glyph-mask coverage tests.

| Row | Median | 5th percentile | Minimum in box |
|---|---:|---:|---:|
| Title | 9.65:1 | 8.48:1 | 1.03:1 |
| Subtitle | 7.86:1 | 6.68:1 | 1.02:1 |
| Dedication | 7.03:1 | 4.98:1 | 1.01:1 |

Bright sky strokes in these rectangles produce very low local backing ratios, even though most backing pixels are dark. The whole-image `text` diagnostic in the JSON also includes frame/outline pixels and must not be interpreted as a glyph contrast score.

Instrumentation around real fixed-star Canvas fills observed 4,158 changed core samples. A representative faint core at (609,448), radius ~0.997, alpha 0.054375 changed RGB (48,65,61) → (58,74,70): **1.153:1**. The low-alpha 10th-percentile and median-alpha examples measure **1.152:1** and **1.207:1** respectively. These are actual composited/antialiased star samples, not opaque palette ratios and not a 3:1 star-visibility pass.

[Label measurements](label-contrast.json) record 36 labels per case across all 36 mode/tier combinations with labels enabled. They compare pixels immediately before/after actual Canvas fillText. The minimum of each label's **strongest** measured ink pixel reaches only **1.816:1** in the weakest case; case medians range **2.018–4.320:1**. This optimistic core measure does not establish 4.5:1 normal-text compliance. Later sky drawing can also overpaint constellation annotations. Labels remain off in the requested initial defaults. No palette, alpha, overlay or typography deviation was introduced to inflate these measurements.

## Commands and results

Run application commands from `star-map-app-final/`. Local-browser fallback config preserves the ordinary test configuration and turns video off because the environment lacks Playwright ffmpeg. It optionally uses `CHROMIUM_PATH`; without that variable it uses the usual installed Playwright browser.

| Command | Result |
|---|---|
| `npm run lint` | PASS, 0 errors / 12 warnings |
| `npm run typecheck` | PASS |
| `npm run test:unit` | PASS, 2,459 tests |
| `node --test scripts/unit/planetLabels.test.mjs scripts/unit/evergreenAtlas514.test.mjs` | PASS, 17 tests |
| `npm run build` | PASS |
| `CHROMIUM_PATH=/usr/bin/chromium node scripts/run-playwright-with-ci.mjs tests/evergreen-atlas.spec.ts --config scripts/evergreen-atlas/playwright-local.config.ts --workers=1` | PASS, 3 tests: API save/reopen, desktop/mobile shared-preset application + free keyboard selection |
| `CHROMIUM_PATH=/usr/bin/chromium npm run qa:smoke:render -- --config scripts/evergreen-atlas/playwright-local.config.ts` | PASS, 9 tests |
| `CHROMIUM_PATH=/usr/bin/chromium npm run qa:smoke:commerce -- --config scripts/evergreen-atlas/playwright-local.config.ts` | PASS, 32 tests |
| `node scripts/evergreen-atlas/source-identity.mjs ../work/baseline/star-map-app-final ../docs/proofs/514-evergreen-atlas/source-identity.json` | PASS, 16 exact old entries |
| `CHROMIUM_PATH=/usr/bin/chromium node scripts/evergreen-atlas/run.mjs ../work/baseline/star-map-app-final ../docs/proofs/514-evergreen-atlas` | PASS, 432 identities / 480 shape cases / 36 modes / 6000px |
| `CHROMIUM_PATH=/usr/bin/chromium node scripts/evergreen-atlas/label-contrast.mjs ../docs/proofs/514-evergreen-atlas` | PASS, 36 measured mode/tier cases |
| `CHROMIUM_PATH=/usr/bin/chromium node scripts/evergreen-atlas/package-proof.mjs ../docs/proofs/514-evergreen-atlas` | PASS, contact sheets + actual-pixel SVG thumbnail |
| `CHROMIUM_PATH=/usr/bin/chromium node scripts/evergreen-atlas/manifest.mjs ../docs/proofs/514-evergreen-atlas` | PASS, proof/font hashes |
| `git diff --check` (repo root) | PASS |

The initial unit run found an existing source assertion hard-coded to four style defaults. It was updated to five; the complete rerun passes. Initial browser setup/configuration retries were resolved with the explicit local-browser config. `npx playwright install chromium` was blocked with HTTP 403 for the browser CDN; network policy was not changed.

To reconstruct the baseline, from the **repository root** (git archive from inside the app would strip its directory prefix):

```sh
mkdir -p work/baseline
git archive f420491c298c3b259f9e56973ee6a36c23f2770a | tar -x -C work/baseline
ln -s "$PWD/star-map-app-final/node_modules" work/baseline/star-map-app-final/node_modules
```

Use fresh local trees and run render proof before other builds. Next dev can create temporary build directories, generated agent guidance and tsconfig includes; keep those generated changes out of the PR. None of the temporary harness routes is committed.

## Unverified / review gates

- Owner's visual acceptance, especially faint stars, low-contrast sky/text intersections and optional annotations; no blanket WCAG or export-quality approval is claimed.
- CI's pinned Chromium, other browsers/OS/font rasterizers, and independent reviewer approval. Local byte hashes are intentionally environment-specific; GitHub Actions remains authoritative.
- Local dev UI logs contain a root body-class hydration warning; it was not investigated as part of this style addition.
- The full nightly Playwright suite was not run; focused style tests and the required render/commerce smoke subsets were run.
- Physical print samples, delivery/fulfillment validation, real customer download flows and live entitlements remain outside this build's authorized test surfaces.
- Draft only. No merge, deploy, production access or configuration change.
