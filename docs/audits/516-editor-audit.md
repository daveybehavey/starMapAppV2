# #516 — fresh-eyes editor/render audit

Read-only audit, 2026-11-03. Source baseline: `c77b47a200e006fb9b36cfb207063c0d96d19005`. Live surface: https://starmapco.com/editor, Chrome at 1440×1000 and 390×1000. No production code, payment, configuration, or data changes; browser interactions used the sample moment and disposable local browser state only. No checkout, share/save-to-server, or download action was invoked.

## Findings

### E1 — P2: numeric size accepts values that change when the draft restores

**Measured live:** sample moment → Customize more → Text Styling → enter 999 in the title Size input → Tab → wait 1 second. Input remained `999`, min=`10`, max=`64`, validity=false/rangeOverflow=true. The local draft stored size **200**. This is a concrete edit/restore mismatch, not only a missing native constraint message.

**Source:** `star-map-app-final/src/components/EditorExperience.tsx:2926`–2932 and `src/app/MobileCreate.tsx:1158`–1162 pass Number(input.value) directly to updateTextBox. `src/lib/editorDraft.ts:342` clamps to 10–200. `src/lib/textFit.ts:77` applies only a minimum to rendering. Native number min/max attributes do not clamp onChange. New size sliders in main cap at 64, making out-of-range numeric values disagree with their thumb position too (source-derived; live deployment did not yet expose those sliders).

**Smallest fix:** keep temporary numeric text while editing; on commit validate the intended 10–64 UI range, with a clear treatment for legacy sizes >64. Do not globally clamp saved legacy designs or modify renderer defaults. Test empty, negative, decimal, >64, and restored legacy values across both surfaces.

### E2 — P2: desktop font/color/alignment controls lack associated names

**Measured live:** after opening the title style controls, its font select, color input, and alignment select had no `aria-label`, no associated `labels`, and no id. Their adjacent visible labels were not associated. Mobile equivalents have htmlFor/id wiring. The desktop line-color input in Advanced controls likewise had no associated label/name.

**Source:** `EditorExperience.tsx:2896` (Font), `:2955` (Color), `:2968` (Align); `src/components/AdvancedPanel.tsx:209`–214 (Line Color). Size is already fixed on current main by #509 and is not filed as a current-main missing-name defect. Shared `src/components/LocationSearch.tsx:223` also has an unassociated Location label, though its placeholder may supply fallback naming in some accessibility APIs.

**Smallest fix:** unique row-specific ids/htmlFor or explicit accessible names; name advanced color. Preserve visual behavior. Verify actual accessibility names, not merely the presence of visible label text.

### E3 — P2: advanced toggles expose generic “On/Off” rather than the setting and state

**Source:** `AdvancedPanel.tsx:143`–168 (grid/ring), `:273`–295 (glow/planets), `:347`–354 (moon) render separate descriptive spans and On/Off buttons without aria-label/aria-labelledby or aria-pressed. Several buttons therefore have the same accessible name. Shape/frame/style choices also rely heavily on color rather than exposing selected state; contrast with the correctly implemented map-look radiogroup.

**Evidence:** live control inventory after Advanced controls finished loading contains generic On/Off buttons with null aria-pressed/aria-checked. This does not constitute a full screen-reader audit, but the DOM state is verified.

**Smallest fix:** name each toggle by setting, expose pressed state, and use proper radio semantics for mutually exclusive choice groups. Keep native keyboard activation and visible labels.

### E4 — P2: long text silently changes at the save boundary and overflow is not surfaced

**Source:** text controls in `EditorExperience.tsx:2885`–2892 and `MobileCreate.tsx:1083`–1092 have no maxLength; `src/lib/editorDraft.ts:363` retains raw text; saved-map sanitizer `src/app/api/maps/route.ts:9,155` truncates to 240 characters. `src/lib/textFit.ts:1192` reports overflow, but `src/lib/renderSky.ts:1997`–2000 paints the line and returns bounds without exposing that warning to the editor. The measured #507 report in `docs/investigations/507-landscape.md` already documents 240-character floor overflow even for square controls; those are prior measurements, not newly executed in this audit.

**Impact:** a long dedication can preview differently from a saved/shareable recipe, and text that exceeds available capacity has no explicit warning. This audit did not invoke a server save to reproduce truncation; that part is established by source only.

**Smallest fix:** define and enforce a consistent new-input limit with a counter/warning before save; expose existing overflow as UI feedback. Preserve existing saved designs and the fit floor. Any fenced delivery/identity work must go to its owner rather than this audit.

### E5 — P2: desktop Quick Look discards its explicitly requested tier

**Source:** `AdvancedPanel.tsx:65`–67 passes `mapLookTier: clean ? minimal : polished` into applyCustomRenderOptions, but the helper at `:34`–35 overwrites every supplied tier with `custom`. The explicit preset tier never survives. `src/lib/mapLookTiers.ts:409` trusts a present tier; background/finish behavior consults that tier at `:422` and `:432`.

**Smallest fix:** apply a full preset through a separate preset action that preserves its intended tier, or explicitly redefine Quick Look as custom and remove the misleading tier argument. Pin intended preset identity and rendered finish in tests. No change made here.

### E6 — P2: mobile advanced controls and tier transitions diverge

The detailed control-by-control record is the companion #518 audit. Mobile lacks nine desktop sky/grid/ring controls and retains an old tier when changing common advanced options. This is confirmed by source, live visibility, and direct helper measurement. Avoid opening duplicate fixes: track the detailed repair under #518 follow-up.

## Checks that passed / claims intentionally not made

- Focused existing fit/anchor suite: **50 tests passed, 0 failed** on local Node v26.13.0. Commands below. This supports the exercised cases, not universal correctness.
- Live sample editor opened at desktop and mobile widths; customization controls were inspected after dynamic panels loaded.
- Synthetic forward-version draft (`schemaVersion:999`, known sentinel and birthday occasion) remained unchanged after mount at both widths. A duplicated mobile raw draft writer still merits follow-up coverage, but this probe did **not** reproduce corruption and is not filed as a confirmed defect.
- Current main includes size sliders; live snapshot did not. Production commit/version was not verified. This is deployment-state uncertainty, not authorization to deploy or a defect attributed to the slider PR.
- No P0/P1 incident established. No pixel/raster comparison, all-font/all-shape sweep, manual assistive technology session, touch-device gesture session, server save/share, purchase, HD download, print, or entitlement test was performed. CI was not run for this docs-only audit.

## Exact commands and results

Run from `star-map-app-final/` unless stated otherwise. Temporary scripts are audit harnesses outside the repo, not production edits.

| Command | Result |
|---|---|
| `node "$env:TEMP/astra-programme/audit-live.cjs"` | Exit 0. First pass captured panels before desktop dynamic AdvancedPanel loaded; corrected probe waited for exact “Advanced controls”. Final result: desktop 120 visible controls, mobile 93; Sky Elements/Planet Names present only desktop. |
| `node "$env:TEMP/astra-programme/audit-size.cjs"` | Exit 0; numeric 999, invalid native range, saved draft 200. |
| `node "$env:TEMP/astra-programme/audit-draft.cjs"` | Exit 0; seeded future draft unchanged after desktop/mobile mount. |
| `node "$env:TEMP/astra-programme/audit-tier.mjs"` | Exit 0; actual helper results: mobile minimal/flat=true; desktop custom/flat=false for the same minimal→enhanced option edit. |
| `node --test scripts/unit/textDragClamp.test.mjs scripts/unit/textAnchorPersist.test.mjs scripts/unit/renderTextLayoutS93.test.mjs scripts/unit/renderTextFit.test.mjs *> "$env:TEMP/astra-programme/fit-tests.log"` | Exit 0; 50/50 passed; output summary inspected with `Select-String '^ℹ |^✖ |^test at '`. |
| `git rev-parse HEAD` (repo root) | Confirmed c77b47a2 baseline before audit measurements; later parent work may change branch. |
| `git grep -n -E 'mapLookTier: preset|applyCustomRenderOptions|Sky Elements|showTechnicalRing|showGrid' c77b47a2 -- star-map-app-final/src/components/AdvancedPanel.tsx` (root) | Confirmed immutable baseline line references. |
| `git grep -n -E 'Math.max\(REFERENCE|ctx.fillText\(box.text|bounds.set|overflow:' c77b47a2 -- star-map-app-final/src/lib/renderSky.ts star-map-app-final/src/lib/textFit.ts` (root) | Confirmed render/floor/overflow references. |

Additional read-only Get-Content and rg inspected the named modules, config, store setters, map-look tier resolution, hydration, and draft normalization. GitHub tools read #516 and #518 completely (both had zero comments). Web open of the live editor returned inaccessible; browser automation succeeded. Node26 is outside the supported range; results are indicative, GitHub Actions remains authoritative. No npm install/build/lint/typecheck/full unit/smoke suite run for this audit.
