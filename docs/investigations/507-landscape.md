# #507 — digital landscape verify-first

Date: 2026-11-03. Source: main `0343e2d9`. Investigation only; no production code changed.

## Decision: NO-GO for release in the current lane

The geometry helpers accept a wide canvas, but adding a picker option is not sufficient. Unknown aspect IDs currently become square in the dimension resolver, saved-map validation/hydration, and both archive/entitlement dimension derivations. A hypothetical 3:2 binding must produce 6000×4000; the current archive and authority logic instead expects 6000×6000. Those load-bearing systems are under the ASTRA_BRIEF DL-1 fence. Do not implement their changes here. The owner must authorize and coordinate a separate cross-programme issue before landscape can ship.

Text fit also does not promise containment at the longest persisted row length. Measured 240-character samples overflow at size 64 across every tested shape, including square controls. Landscape reduces the usable v2 heart/star/diamond footprint at fixed width and makes some size-10 cases worse. This is not evidence that landscape introduced the existing long-row limitation; it is evidence against a universal fit guarantee.

## Aspect flow and required future work

Paths below are under `star-map-app-final/`.

| Stage | Current source / behavior | Future requirement, not an authorization |
|---|---|---|
| Type + choices | `src/lib/types.ts` AspectRatio; `src/lib/aspectOptions.ts` ASPECT_OPTIONS: square, 3:4, 2:3, 4:5 | Explicit new persisted ID; label and digital eligibility policy |
| Editor | `src/components/EditorExperience.tsx`, `src/app/MobileCreate.tsx` consume ASPECT_OPTIONS and store selection | A shared picker list alone cannot guarantee digital-only usage |
| Preview dimensions | `src/components/PreviewCanvas.tsx` derives height and CSS aspect via aspectRatioToNumber | Consistent landscape dimensions in CSS, canvas, drag coordinates |
| Dimension authority | `src/lib/aspectRatio.ts`: unknown IDs return 1; getExportDimensions derives rounded height from width | Add the ratio centrally, test the existing dimension table unchanged |
| Render recipe | `src/lib/renderSky.ts`: buildRecipeFromState carries aspect; render height uses aspect unless explicit height supplied | Preserve existing recipe bytes; new aspect intentionally changes new recipe identity |
| Draft + saved designs | `src/lib/editorDraft.ts` allowlist; `src/app/api/maps/route.ts` allowlist (fallback square); `src/lib/mapRecipeHydration.ts` allowlist | Round-trip a new ID; legacy IDs and missing fields retain existing semantics |
| Fingerprint | `src/lib/mapRecipeFingerprint.ts` includes aspectRatio in canonical binding | New ID produces distinct binding/fingerprint, not an alias of square; legacy vectors must remain exact |
| HD archive — fenced | `src/lib/downloadArchiveIdentity.ts` expectedDimensionsForBinding allowlists existing aspects | New binding must agree with the final artifact dimensions; no change in this investigation |
| Entitlement authority — fenced | `src/lib/entitlementAuthorityState.ts` publicationDimsForBinding independently maps the same four ratios | Coordinated validator/version/identity review; fixing only the public helper leaves an inconsistent authority |
| Delivery consumers — fenced | Editor export paths use getExportDimensions; archive validates the artifact against binding dimensions | Future full-chain replay, authorization, archive publication/retrieval tests, without weakening entitlement checks |
| Print eligibility — fenced | Shared aspect state/recipe can reach print paths | Owner-defined handling of a digital landscape design entering print selection; hiding one picker is insufficient. Do not add SKUs or silently remap a saved design |

Read-only inspection of fenced source was necessary to identify the dependency explicitly requested by #507. No fenced code, flags, services, secrets, or production data were changed or accessed.

## Reproducible measurements

Run from repo root after app dependencies are installed:

```powershell
$env:ASTRA_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node docs/investigations/507-landscape-probe.mjs
```

Exit 0; 19,440 layout evaluations; Node v26.13.0 (unsupported locally), installed Chrome 156.0.8078.74. The probe ran twice; the final run corrected FontFace weight metadata for 400-only fonts. [Probe](507-landscape-probe.mjs) and [aggregate results plus exact example bounds](507-landscape-results.json) are committed for reproduction. Browser measurement uses a blank page and committed WOFF2 bytes: no application server or external font/network request is needed.

Matrix: width 1200; heights 1200 (square control), 900 (hypothetical 4:3), 800 (hypothetical 3:2); layout versions 1 and 2; rectangle/circle/heart/star/diamond plus legacy birthdaycake; all 15 bundled font families at requested weight 600 (600 face where present, otherwise 400 face with browser synthesis); sizes 10 and 64; two exactly 240-character strings (240 Ws and repeated prose); title/subtitle/dedication default rows; left/center/right at stored anchor x=0.5; frame enabled. Canvas measureText widths feed the actual resolveTextLineLayout, resolveDefaultTextBoxRows, shape profile, and footprint helpers. No mirror of the fit algorithm.

The map API truncates text to 240 characters (`MAX_TEXT_LENGTH`), so this probes the longest persisted API rows. The editor controls have no maxLength and the local draft path does not establish the same finite text limit: there is no defensible global “longest supported UI row.” 240 Ws is a stress sample, not a proof of the widest possible Unicode string. Default rows are measured individually, not simultaneously for inter-row overlap.

### Overflow at size 10, layout v2

Each cell is flagged-overflow cases out of 270 (15 fonts × 2 strings × 3 rows × 3 alignments).

| Shape | 1200×1200 | 1200×900 | 1200×800 |
|---|---:|---:|---:|
| Rectangle | 99 | 99 | 99 |
| Circle | 81 | 81 | 81 |
| Heart | 132 | 153 | 171 |
| Star | 153 | 192 | 207 |
| Diamond | 126 | 159 | 177 |
| Birthdaycake (legacy exploratory case) | 81 | 81 | 81 |

At size 64, **270/270 overflow for each shape at all three aspects in v2**. The 0.5 fit floor means text continues to paint even when no fitting solution exists. Full v1 aggregates are in the JSON; these are not inferred from v2. Circle/cake use canvas text bounds rather than requiring containment in the silhouette; “no overflow” is not “inside the circular sky.”

Example, Cinzel 240 Ws, centered title at 1200×800 v2: measured width at size 10 = 2349.55835px. Rectangle fits to the floor 0.5, width 1174.77917px, still overflowing the framed safe interval. Circle uses scale 0.51073428, width 1200px, no canvas overflow. At size 64 measured width = 15037.18164px; every shape reaches 0.5, fitted width 7518.59082px and spills beyond the canvas. Heart/star/diamond size-10 examples reach the floor and overflow too. Exact anchor, center, rectangle, and font size are retained in JSON.

## Shape footprint

Measured helper outputs for square SVG viewBox [0,0,100,100]:

| Canvas | Legacy scale X/Y, translation | v2 scale X/Y, translation | v2 footprint |
|---|---|---|---|
| 1200×1200 | 12/12, 0/0 | 12/12, 0/0 | 1200, offset 0/0 |
| 1200×900 | 12/9, 0/0 | 9/9, 150/0 | 900, offset 150/0 |
| 1200×800 | 12/8, 0/0 | 8/8, 200/0 | 800, offset 200/0 |

Thus v1 heart/star/diamond/cake stretch horizontally in landscape; v2 preserves proportions and centers a square footprint with side mats. Intrinsic SVG margins remain inside that footprint. The procedural circle uses radius 0.44×min(W,H): at 1200×800 radius 352px, center (600,400), bounds (248,48)–(952,752), independent of layout version. Rectangle occupies the full canvas. These circle/rectangle statements follow the renderer's procedural definitions; the JSON records path-transform helper measurements, not rasterized silhouettes. Birthdaycake is an exploratory legacy path, not a promise to add it to current supported UI shapes.

Heart/star default rows are mapped through the footprint; diamond defaults remain canvas-normalized. Fit uses span samples and disjoint interior intervals for concave shapes. Existing saved positions stay alignment anchors. A wide canvas does not authorize reinterpreting x as a glyph center or silently migrating positions/layout version.

## Limits and next gate

This is a measured layout/metric probe, **not** an end-to-end landscape render/export, pixel comparison, drag test, raster silhouette inspection, or entitlement execution. No feature exists to exercise through the current picker. It does not cover all weights, Unicode shaping, user-dragged anchors, extreme custom rows, unframed/transparent variants, multiple-row collisions, or preview-to-6000px parity. Font fallback stacks in the live app can differ from this direct-font measurement. Node 22 CI reproduction remains required; no CI pass is claimed here.

Proceed only with a separately approved design/implementation scope that (1) resolves digital-only vs print entry policy, (2) coordinates the fenced archive/entitlement chain and legacy identity vectors, (3) defines acceptable overflow/length UX rather than promising impossible fits at the current floor, and (4) proves full rendering/drag/export parity at supported widths. NO-GO is for shipping now, not a claim that landscape geometry is fundamentally impossible.
