# #518 — mobile/desktop editor parity audit

Read-only, 2026-11-03. Source pinned to main `c77b47a200e006fb9b36cfb207063c0d96d19005`; live sample inspected at https://starmapco.com/editor in Chrome, 1440×1000 and 390×1000. No implementation, production configuration, payments, download, or print mutation. No purchase or server save/share was invoked.

## Confirmed gaps

### M1 — P2: nine desktop rendering controls have no mobile counterpart

Desktop `star-map-app-final/src/components/EditorExperience.tsx:3438` mounts AdvancedPanel. Mobile instead has its own Advanced section (`src/app/MobileCreate.tsx:1456` onward) and never mounts that component. Missing controls, with exact desktop action lines in `src/components/AdvancedPanel.tsx`:

| Property | Desktop line | Mobile result |
|---|---:|---|
| showGrid | 144 | Missing |
| showTechnicalRing | 160 | Missing |
| starIntensity | 256 | Missing discrete subtle/normal/bold selector; mobile's separate percentage Intensity control is not this field |
| starGlow | 273 | Missing |
| showPlanets | 288 | Missing |
| planetEmphasis | 312 | Missing |
| planetLabels | 331 | Missing |
| showMoon | 347 | Missing |
| moonSize | 371 | Missing |

**Measured live:** after sample → Customize more and desktop Advanced expansion, Sky Elements and Planet Names were present on desktop and absent mobile. Source search confirms none of those fields is wired by MobileCreate. Saved values still live in the shared store and can render on mobile; the defect is lack of edit/inspection controls, not proof that hydration drops them.

**Smallest fix:** reuse the same AdvancedPanel or shared option group on mobile, preserving current values and absence/default semantics. Add parity assertions and mobile browser checks for every field rather than copying a fourth list.

### M2 — P2: the same advanced edit can produce a different rendering tier

Desktop `AdvancedPanel.tsx:34`–35 always writes `mapLookTier:'custom'` for individual advanced edits. Mobile handlers such as `MobileCreate.tsx:1469` (constellation lines), `:1534` (visual mode), `:1581` and `:1609` (premium effects) call plain setRenderOptions. `src/lib/store.ts:427` only merges; `src/lib/mapLookTiers.ts:409` trusts a present tier instead of inferring again.

**Measured using the real helpers:** start with applyMapLookTier('minimal','navyGold'), change visualMode to enhanced. Mobile-shaped payload resolves `{tier:'minimal',flat:true}`; desktop-shaped payload resolves `{tier:'custom',flat:false}`. Thus this is more than a stale selected badge: shouldUseFlatSkyBackground differs. Neither probe altered production state.

**Smallest fix:** share a user-edit helper with the same tier semantics across both surfaces; do not change default construction or hydration. Cover each shared advanced field, not only visualMode.

### M3 — P2: accessibility parity is worse on desktop text styling

Mobile Font, Color and Align use htmlFor/id pairs at `MobileCreate.tsx:1136`, `:1179`, `:1189`. Desktop counterparts at `EditorExperience.tsx:2896`, `:2955`, `:2968` have unassociated visible labels. Live DOM inspection confirmed desktop selects/color input lack associated labels/aria-label while mobile supplies the label bindings. Advanced line color is similarly named on mobile but not desktop.

**Smallest fix:** standardize row-specific programmatic labels across both. Current main Size labels/sliders are already wired by #509; do not reopen that fixed issue. Shared On/Off and color-only selection semantics remain separate accessibility work documented in #516.

### M4 — P3: desktop Quick Look preset controls are unavailable on mobile

Desktop `AdvancedPanel.tsx:56`–79 offers renderPresets through Quick Look; MobileCreate contains no corresponding renderPresets/getRenderPresetOptions control. The top Render Mode picker and Map Look tiers are different state operations and are not one-for-one substitutes. This is an availability gap, not necessarily a product blocker if mobile omission was intentional; no such exception was found in the inspected programme.

**Smallest fix:** owner-confirm the intended parity, then reuse the shared Quick Look control while addressing the desktop tier-overwrite defect recorded in #516. Do not blindly copy the buggy wrapper.

## Control-by-control comparison

This covers the editor configuration surfaces, not fenced purchase configuration. “Shared” means same source/config/store pipeline; it does not claim every combination received a browser test.

| Control / flow | Desktop vs mobile | Default / persistence assessment |
|---|---|---|
| Location + exact coordinates | Both LocationSearch | Shared source/store; location confirmation/placeholder rules shared |
| Date / optional local time / timezone | Both DateTimeControls | Parent draft restore + shared date provenance; no new difference found |
| Sample moment / start empty / occasion | Both available | Mobile duplicates some occasion state/effects; see restore notes |
| Occasion presets / pro presets | Both wired | Shared config; not every preset measured |
| Render mode | Both wired | Shared mode config; no specific option-count gap found |
| Intensity percentage | Both wired | Same conceptual control; distinct from starIntensity enum |
| Text content | Both edit same TextBox fields | No maxLength on either; shared truncation mismatch filed in #516 |
| Add/remove/collapse text row; add caption | Both available | Same store actions; no independent schema |
| Font | Both 15 shared fontOptions | Values shared; desktop name association gap M3 |
| Weight | Both 400/500/600/700, absent shown 600 | Buttons desktop vs select mobile; no value gap found |
| Size number + slider | Both in current main, 10–64 | Same size field; out-of-range typing flaw shared (#516). Live deployment lacked new slider; deployment commit unverified |
| Color / align | Both same fields/options | M3 label difference; no stored-value difference found |
| Shadow / glow | Both bool fields | Both use row-specific toggle naming/pressed semantics |
| Map Look minimal/polished/custom | Both shared tier data | Shared applyMapLookTier/applyTierTypographyProtected |
| Reset typography | Both protected tier typography action | Explicit ownership preserved; not a reset-all of authored fonts |
| Four styles | Both config styles | Both apply defaults + tier typography protections; all legacy hydration combinations untested |
| Shapes | Both rectangle/heart/circle/star/diamond | Same set and HD badges; mobile text tiles vs desktop icons are presentation difference |
| Shape background | Both color control for nonrectangle | Same fallback and payload |
| Aspect | Both ASPECT_OPTIONS: square,3:4,2:3,4:5 | Same stored IDs; no landscape option |
| Frame enable / classic-double-fine | Both FRAME_STYLE_OPTIONS | Same absent/classic resolver; no missing option found |
| Bortle class | Both BortleControl | Shared behavior/default display |
| Constellation lines/color/scale/labels | Both available | M2 tier side effect differs; line color naming better on mobile |
| Visual mode | Both available | M2 demonstrated renderer difference |
| Preview fidelity | Both standard/high | Shared store field; same options |
| Premium stars/planets | Both available | Same values, M2 tier side effect differs; no payment action tested |
| Grid / technical ring / seven Sky Elements | Desktop only | M1 |
| Quick Look | Desktop only | M4 |
| Preview drag/nudge | Shared PreviewCanvas | 50 existing fit/anchor tests passed; touch gestures not tested on device |
| Share image / Save & Remix / preview-HD actions | Both call parent handlers | Wiring inspected only; server/save/download actions not executed |

## Restore / hydration comparison

The parent EditorExperience owns validated draft restore (`:857` onward), atomically applying textBoxes/style/aspect/shape/renderOptions (`:874` onward), pins absent shapeLayoutVersion/Bortle/frameStyle, and blocks invalid draft writes (`:903`). MobileCreate consumes that same Zustand state; there is no separate mobile renderer recipe schema. Parent saved-map hydration also supplies the shared store before/around the mobile child.

Mobile does duplicate raw localStorage occasion handling (`MobileCreate.tsx:334`–390), reading/writing selectedOccasion outside the validated helper. That is a maintenance risk, not a demonstrated data-loss defect here. A synthetic future-version draft with a sentinel remained byte-equivalent after desktop and mobile mount in the live probe. No claim of corrupted hydration is made. Future tests should cover invalid/forward schema, denied storage, rapid viewport remount, concurrent saved-map hydration, and occasion edits before restore completes.

## Exact executed commands and results

From `star-map-app-final/`:

- `node "$env:TEMP/astra-programme/audit-live.cjs"` — exit 0; final probe waited for desktop dynamic Advanced controls. 120 desktop / 93 mobile visible controls in this sample state; Sky Elements/Planet Names true vs false. Counts are state-dependent, not totals of all possible controls.
- `node "$env:TEMP/astra-programme/audit-tier.mjs"` — exit 0; actual helper outputs mobile minimal/flat=true, desktop custom/flat=false.
- `node "$env:TEMP/astra-programme/audit-draft.cjs"` — exit 0; synthetic future draft unchanged after mount at both widths.
- `node --test scripts/unit/textDragClamp.test.mjs scripts/unit/textAnchorPersist.test.mjs scripts/unit/renderTextLayoutS93.test.mjs scripts/unit/renderTextFit.test.mjs *> "$env:TEMP/astra-programme/fit-tests.log"` — exit 0; 50 pass/0 fail.

From repo root:

- `git grep -n -E 'mapLookTier: preset|applyCustomRenderOptions|Sky Elements|showTechnicalRing|showGrid' c77b47a2 -- star-map-app-final/src/components/AdvancedPanel.tsx` — source locations confirmed.
- `git grep -n -E 'size: Number|Font</label>|font-select|constellationLines: preset|visualMode: mode|premiumStars: preset|selectedOccasion from draft|Sync selectedOccasion|localStorage.setItem|showEditor' c77b47a2 -- star-map-app-final/src/app/MobileCreate.tsx` — mobile action/restore locations confirmed.
- `rg -n 'planetLabels|showGrid|showPlanets|showMoon|milkyWay|horizon|projection|starIntensity|starGlow' star-map-app-final/src/app/MobileCreate.tsx star-map-app-final/src/components/AdvancedPanel.tsx` — desktop field wiring found; corresponding mobile fields absent.

Additional Get-Content/rg read config/font list, parent MobileCreate props, store merge setter, tier resolver, draft validator and shared controls. GitHub issue #518 and empty comment list read fully. No code modifications. No lint/typecheck/build/full-unit/commerce/render smoke rerun for this docs audit. Local Node v26.13.0 is unsupported; focused test results are indicative, not authoritative CI. No physical device/assistive technology testing, full persisted-matrix round trip, pixel comparison, or production commit mapping performed.
