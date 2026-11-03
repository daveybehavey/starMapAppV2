# #515 — verify-first result and bounded star-colour wiring

2026-11-03, baseline main c77b47a2. Fixed-versus-spectral drawing exists; an independent within-style gradient-variant implementation does not. Build only the star-colour control, and stop the gradient portion at this report.

## Source verification

- `src/lib/renderSky.ts` STYLE_RENDER_PROFILES.useFixedStarColor (baseline lines 211,266,283,300,323) selects the ordinary star branch at 1369. Navy uses spectral; engraving/parchment/minimal use fixed palette colour. This is a real drawing primitive, not merely a UI stub.
- The premium bright-star branch at 1363 independently uses spectral colour. New explicit fixed mode must feed palette.star there too, while absence retains the historical spectral premium branch.
- Parchment's contrast compensation qualifies dark fixed ink (1277 onward); drawSky disables premium stars for parchment (1579). Spectral parchment would invalidate that treatment. The shared control is disabled there and explains fixed ink; a retained choice resumes on another style.
- drawBackground (1070 onward) paints one parameterized radial vignette, an optional overlay, and parchment wash; RenderOptions has backgroundColor/visualMode/Bortle but no independent sky-variant enum or variant gradient definition. Existing visual modes are not interchangeable with within-style gradient presets.
- `rg -n 'skyVariant|skyGradient|gradientVariant|starColorMode|useFixedStarColor' star-map-app-final/src` before edits found only six useFixedStarColor occurrences, all in renderSky. No named persisted colour-mode field existed. This does not negate the real internal drawing primitive; it requires plumbing, which this issue supplies.

## Implemented behavior

Optional RenderOptions.starColorMode=fixed|spectral, absent=style default. One shared labelled control in desktop AdvancedPanel and mobile Advanced. No initialization/default write, no tier switch, no new pricing/entitlement gates. Explicit modes use the existing palette/spectral algorithms in ordinary and premium paths; no astronomy, shape, fit or pixel-position changes. Parchment always keeps its qualified fixed ink, even if a recipe carries spectral from another style.

Conditional recipe spread omits the key when absent/invalid. Draft validation retains valid values and rejects malformed ones; the saved-map API allows valid values and drops invalid ones in keeping with that sanitizer's pattern. Editor and simplified-editor merge hydration explicitly clear an absent choice so a previous session override cannot leak into a legacy design. The whole renderOptions object already participates in the canonical fingerprint; nonzero selections change that existing input, unlike the omitted per-text-row field that blocks #512. No archive/version/entitlement code was changed.

## Measured evidence

Before edits, a disposable local Chrome probe loaded the sample preview and injected proposed starColorMode and skyGradientVariant values through the dev store. For all four styles, both 900×900 canvas PNG-dataURL SHA-256 values were unchanged; an existing backgroundColor override changed output (positive control). This corroborates that no independent option was wired, not that no internal colour branch exists.

After wiring, rerunning the same probe showed:

| Style | spectral vs original | fixed vs original |
|---|---|---|
| navyGold | identical | changed |
| vintageEngraving | changed | identical |
| parchmentScroll | identical | identical (ink guard) |
| midnightMinimal | changed | identical |

The **absent-mode baseline hashes remain exactly identical before/after for all eight sampled canvases**. JSON snapshots are [baseline](515-star-colour-baseline.json) and [after](515-star-colour-results.json). This is a sample PNG byte comparison, not exhaustive raster proof at every export width, premium effect or mode. Snapshot flags retain the probe's original “injected” naming.

Desktop/mobile UI probe passed at 1440×1000 and 390×1000: fixed/spectral changes update state; spectral survives autosave; parchment select disables and displays fixed; returning to navy restores spectral; resetting Style default omits the field from persisted draft. Initial probe mistakenly expected an envelope.data object and failed; corrected to the actual flat draft envelope, then both passed.

Local API POST→GET tests passed for absent, fixed, spectral and invalid values (invalid omitted). Only synthetic local recipes, localhost:3004 and local development storage were used; generated IDs are not included in evidence.

## Commands and outcomes

App cwd, local Node v26.13.0 (unsupported; CI Node22 authoritative):

- `node --test scripts/unit/starColorMode.test.mjs` initially 3/4 passed; failed carry-through assertion exposed the omitted recipe-builder field. Fixed it; rerun 4/4. Added draft validation cases; final focused run below.
- `node --test scripts/unit/starColorMode.test.mjs scripts/unit/editorDraft.test.mjs` — 26/26 passed.
- `npm run lint` and `npm run typecheck` — final outcomes recorded in PR.
- `npm run test:unit *> "$env:TEMP/astra515-unit.log"` — 2444 tests, 2428 passed, 16 failed. Same failure names observed earlier in the Windows/Node26 checkout, including CRLF source pins, timezone and manifest checks; not all reproduced on clean baseline. No fenced fixes attempted.
- `node "$env:TEMP/astra515-browser.cjs"` before/after — exit0; two canvas hashes per style plus mode comparisons and background positive control. It uses sample moment, waits for fonts and rendering, and hashes canvas.toDataURL().
- `node "$env:TEMP/astra515-ui.cjs"` — initial harness envelope error; corrected final exit0, both widths passed.
- `node "$env:TEMP/astra515-api.cjs"` — exit0, four local API cases passed.
- Read-only Node comparison of JSON snapshots using assert.deepEqual on before arrays — exit0, eight absent-mode canvas hashes identical.
- `git diff --check -- star-map-app-final` and staged whitespace check — results recorded in PR.

Independent source review found no actionable defect; reviewer separately ran five new unit tests successfully. Full local production build, commerce/render smoke, all-style premium-on pixel comparison, 6000px output and physical-device/assistive-technology checks were not performed for this issue. No claim that the gradient feature exists or is implemented. Future gradients need a separate specification/issue, not a speculative selector here.
