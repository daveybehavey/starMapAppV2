# #514 — fifth free style: owner selection pack

2026-11-03; baseline `c77b47a2`. **Phase 1 only.** No owner selection is recorded on #514. Nothing here is implemented. Choose one concept on the issue; Phase 2 remains a separate build PR after that decision. All concepts are free for every user, following the existing font policy; no new paywall, SKU, price or entitlement condition.

## Recommendation and choices

Recommend **Evergreen Atlas**: a distinct green palette expands the current navy/charcoal/cream/noir set without requiring a new rendering primitive. Rose Observatory is the more romantic option; Copper Blueprint emphasizes a technical-chart character. Names are proposals, not claims about astronomical appearance.

| Proposed ID / name | Visual intent | Theme background | Vignette | Accent | Fixed-star palette value | Glow |
|---|---|---|---|---|---|---|
| `evergreenAtlas` / Evergreen Atlas | Deep forest, quiet warm silver | #071B17 | rgba(0,8,5,0.65) | #C8D8BB | #EEF5E8 | rgba(163,201,173,0.25) |
| `roseObservatory` / Rose Observatory | Muted plum, rose-gold detail | #21121D | rgba(12,2,10,0.65) | #E4B6B1 | #FFF0E9 | rgba(228,182,177,0.30) |
| `copperBlueprint` / Copper Blueprint | Dark indigo engineering plate with copper | #101A2B | rgba(2,7,18,0.55) | #D6A078 | #E9E4DD | rgba(214,160,120,0.12) |

These are specified candidate colors, not approved pixel proofs. With the proposed enhanced visual mode, verify mode-palette precedence does not replace the intended theme. Preserve every existing style's precedence and defaults.

## Render profiles

Use the current navyGold profile as the explicit baseline for new entries only, with all final values specified below. Do not mutate or alias an existing profile object. Quality-specific tuning remains unchanged across preview/OG/export.

| StyleRenderProfile field | Evergreen | Rose | Copper |
|---|---|---|---|
| useFixedStarColor | true | false | true |
| allowGlow | false | true | false |
| starAlphaFloor | 0.035 | 0.025 | 0.045 |
| starSizeBoost | 0.98 | 1.00 | 0.90 |
| starVisibilityCutoff | 0 | 0 | 0 |
| starAlphaBoost | 1.00 | 1.00 | 0.95 |
| lineStrokeBoost | 1.00 | 0.95 | 1.10 |
| lineAlphaMultiplier | 1.00 | 0.90 | 1.10 |
| lineAlphaClamp | null | null | null |
| lineDashed | false | false | true |
| showMilkyWayBand | true | true | true |
| planetFlatColor | true | false | true |
| starJitterMin | 0.94 | 0.94 | 0.97 |
| starJitterRange | 0.14 | 0.14 | 0.05 |
| minimalDrop | null | null | null |

No new sky-gradient engine, noise layer, image overlay, watermark treatment or astronomy computation. Milky Way remains conditional on the current cinematic-detail path; this profile value alone does not force it on. The existing premium-star path can override a fixed-star profile in applicable modes: include that in proof review rather than changing premium/download behavior.

### Initial RenderOptions for the selected style

For all candidates: mapLookTier=polished; visualMode=enhanced; starIntensity=normal; constellationLines=thin; constellationLabels=false; planetLabels=false; showGrid=false except Copper=true; showTechnicalRing=false except Copper=true; showPlanets=true; premiumStars=off; premiumPlanets=off; planetEmphasis=normal; showMoon=true; moonSize=normal; frameEnabled=true; transparentBackground=false; backgroundColor=""; constellationColor=""; constellationLineScale=1.0 (Copper=1.1). starGlow=false except Rose=true. frameStyle is absent (classic) and bortleClass absent (4.5). New designs use the existing creation-time shapeLayoutVersion=2; selecting a style on an existing design must retain its stored layout version. Do not write a new layout version as a style default.

## Typography and row layout

All fonts already ship locally; no font downloads or license changes. All rows centered; shadow/glow false. Title/subtitle/dedication values below are font / weight / size in reference-canvas units / color. Color and font are automatic only while already automatic; explicitly authored typography is preserved by applyTierTypographyProtected and applyStyleDefaults.

| Concept | Polished title | Polished subtitle | Polished dedication |
|---|---|---|---|
| Evergreen | cormorant / 600 / 48 / #E8F0DF | montserrat / 400 / 20 / #C8D8BB | cormorant / 400 / 22 / #C8D8BB |
| Rose | playfair / 600 / 46 / #FFF0E9 | raleway / 400 / 19 / #E4B6B1 | cormorant / 400 / 23 / #E4B6B1 |
| Copper | bebasNeue / 400 / 48 / #E9E4DD | montserrat / 400 / 18 / #D6A078 | montserrat / 400 / 16 / #D6A078 |

Minimal-tier typography: same fonts/colors, title size reduced by 4, subtitle by 2, dedication by 2; weights unchanged. Custom tier does not overwrite authored rows. The new style's default text font/color (for newly added rows) uses its polished title font and subtitle color. New showcase preset uses standard title/subtitle/dedication positions x=0.5 and y=0.12/0.18/0.88 on circle/square; shape-specific row helpers still govern a later shape change. Applying the style alone must not reposition authored rows. No letter-spacing property: #512 has its own unresolved identity gate.

## Preset and tier wiring plan

Add exactly one style entry to config.styles, visible in both consumers. Add the selected ID to StyleId and explicit validation/normalization allowlists, including editorDraft and saved-map API. Add a new STYLE_THEME and STYLE_RENDER_PROFILES entry, STYLE_DEFAULTS entry and minimal/polished TIER_TYPOGRAPHY entries. Do not change the global initial selectedStyle (navyGold), any existing profile, tier mapping, old preset or old recipe version.

One optional showcase ProPreset for the chosen concept: ID `<styleId>-signature`, name equal to the concept, style=new ID, renderMode=classic, intensity=65, shape=circle, aspectRatio=square, renderOptions as specified above, three rows “Our Place in the Stars” / “Victoria · November 3, 2026” / “Every night, together” with the polished typography and positions above. Thumbnail path `/presets/preset-<styleId>-signature.svg`; generate from the approved output, do not draw a misleading surrogate. Add automatic typography bindings through existing constructors. The catalogue label “Pro Presets” does not authorize a paywall; selected style remains free.

Audit all StyleId exhaustive maps and fallback lists before building. Existing saved style IDs and missing-value fallback semantics must remain byte-identical. The fingerprint already includes selectedStyle, so a new ID distinguishes the new design, but future build still requires review of downstream support; do not modify fenced download/print/checkout code to force compatibility. If those consumers reject the ID, record the dependency and stop the affected build.

## Proof assets and acceptance plan

After owner selection, render actual application output, not generative mockups:

1. Stable fixture: Victoria 48.4284,-123.3656, timezone America/Vancouver; instant 2026-11-04T05:00:00Z; seed default; sample text above. Commit exact fixture and use bundled fonts after fonts.ready.
2. Contact sheet: chosen concept beside all four existing styles, 1200px width, circle/square plus rectangle/4:5; unwatermarked internal proof only via existing test seams, never bypassing live entitlements.
3. Shape matrix: rectangle/circle/heart/star/diamond, current four aspect IDs, legacy/v2 masks, short/long rows at 10/64 and left/center/right, frame on/off; mobile 390px and desktop 1440px screenshots.
4. Mode/tier matrix: minimal/polished/custom; astronomical/enhanced/illustrated; classic/cinematic/blueprint/luxe; star effects and label contrast. Verify intended palette actually reaches pixels. Do not change old mode precedence to improve the new concept.
5. Golden comparison: exact old recipe/binding/pixel bytes unchanged when the new ID is not selected. New ID round-trips through draft/save/reopen and desktop/mobile selectors. Test automatic vs explicit text ownership and absence of new default fields.
6. Accessibility and image proof: inspect foreground contrast on dark backgrounds and representative faint stars; test focus/keyboard selection; no numeric contrast or export-quality claim until measured. 6000px digital render proof through authorized local test surfaces; physical print samples and delivery validation remain owner's gated lane.

Proposed assets: fixture JSON, contact-sheet PNG, individual selected-style PNGs and labelled desktop/mobile screenshots under the existing proof convention discovered during build. No proof assets have been generated in this design pass; the palette/profile tables are specifications, not finished renders.

## Effort and selection gate

Planning estimate for any one concept: 1–2 engineer-days wiring/fixtures; 1–2 days rendering/regression proof and accessibility; 0.5–1 day review corrections (2.5–5 days total, excluding CI queues, gated dependencies or physical samples). Evergreen/Copper are at the lower end because they use restrained fixed-color profiles; Rose needs extra glow/spectral contrast review. Estimates are not measurements or commitments.

Owner decision needed on #514: choose **Evergreen Atlas**, **Rose Observatory**, or **Copper Blueprint**, with any palette/type changes. Record the pick before starting Phase 2. Phase 1 can be reviewed independently; do not close the issue as fully built when this document merges.

## Inspection and verification

Read #514 and all comments (none at inspection), config.ts styles, renderSky.ts STYLE_THEME/STYLE_RENDER_PROFILES and drawBackground/drawSky, styleDefaults.ts, proPresets.ts, mapLookTiers.ts, editorDraft.ts and saved-map style allowlist. No code implemented. No runtime tests, proof renders, CI validation, or customer/production service access performed for this document. Staged whitespace check result is recorded in its draft PR. Programme fences fully apply.
