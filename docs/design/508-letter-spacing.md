# #508 — per-row letter spacing design

Status: proposal for review, **not approved for implementation**. Date: 2026-11-03. Baseline: main `0343e2d9`. No production code changes.

## Proposed contract

Add optional `TextBox.letterSpacingEm?: number`, a per-row rendering property rather than a global RenderOptions toggle. Proposed UI: “Letter spacing,” range **0–0.20 em**, step **0.01 em**, numeric value plus slider. This deliberately excludes negative tracking in the first version: overlapping advances and nonmonotonic metrics would complicate fit and hit testing. Range and naming are product decisions awaiting approval.

Absent means current rendering. UI displays absent as 0 without writing it. Zero is also current rendering and is omitted from persisted new payloads; resetting a previously spaced row removes the property. Do not materialize 0 on load, preset application, duplication of an unspaced row, or default construction. No migration of existing designs or positions. Nonzero values are user-owned; style/tier changes must not reset them. Do not extend typography ownership machinery unless a separate approved design introduces automatic spacing.

Write validation: finite numeric values within [0, 0.20], quantized to hundredths at the UI edit boundary. API writes reject invalid/nonfinite/out-of-range values rather than silently changing a design. On hydration, absent/zero takes the legacy path; valid nonzero is preserved; present malformed values should fail validation/recovery explicitly, not silently load a differently rendered saved design. This requires a consistent reviewed policy across draft and server normalizers. Unknown fields from older writers must not be silently stripped once the new feature is enabled.

## Existing implementation and invariants

All paths below are relative to `star-map-app-final/`.

- `src/lib/renderSky.ts::drawText` resolves base font size, measures width through getCachedTextWidth, calls resolveTextLineLayout, then paints at layout.anchorX/centerY and publishes layout.bounds.
- Its current metrics cache key is text plus font, so adding spacing only at fillText would produce stale/incorrect widths and collisions.
- `src/lib/textFit.ts::resolveTextLineLayout` treats stored x as an **alignment anchor**, samples the unfitted vertical span for conservative capacity, fits once with a 0.5 floor, then converts anchor → center, clamps with final dimensions, and converts back for drawing.
- `src/components/PreviewCanvas.tsx` derives drag centers from the actual rendered rectangle, persists an anchor via resolveTextCenterToAnchorX, and has a pendingShapeRecheckRef correction after a new stored-position render. The comment asserting rect dependence only on row must be revisited for a spacing-aware path; font/text/size/spacing changes also invalidate rectangles.
- `src/lib/textHitTest.ts` gives exact rectangle hits precedence over padded hits. New spacing must feed that same authoritative rectangle, not a second estimate.

These are P1-sensitive invariants. No change may interpret stored position.x as a glyph center, clamp an anchor with center math, use a stale fitted width to persist a position, or update a foreign/read-only recipe in the store.

## Measurement and drawing

For nonzero spacing, let t be letterSpacingEm and F0 the existing resolved base font size in logical canvas pixels. At candidate fit scale s, use font size F(s)=F0×s and tracking L(s)=t×F(s) pixels. Thus tracking scales with the fitted font, preview width, and export width; DPR is applied by the existing canvas transform, not multiplied into L twice. Example: t=0.10 and F0=40 means 4px unfitted spacing, 2px at s=0.5.

Use the **same native canvas text shaping/letter-spacing mechanism for measurement and drawing**. Set font, text direction, and letterSpacing before measureText and fillText. Native measurement decides ligatures, whitespace, grapheme behavior and trailing-spacing semantics: do not approximate width as text.length×spacing, iterate UTF-16 code units, or draw characters separately. Those approaches break combining marks, emoji, scripts and kerning. Capability detection and metric/paint parity on all supported browser/export runtimes are a release gate. If unavailable, do not silently paint a spaced recipe with zero spacing; prevent enabling the feature there and return an explicit unsupported-renderer error for an existing spaced design. A shaping-compatible fallback would require a separate decision.

Bracket the nonzero row's context state with save/restore, including letterSpacing, so it cannot leak into later rows, constellation/planet labels, or watermark. Existing label code already sets letterSpacing in other contexts; test state isolation in both directions. The absent/zero branch must retain the old measurement, cache key, font strings, draw calls, and layout algorithm exactly. Do not “clean up” that branch as part of this feature.

For nonzero rows, use a separate metric cache keyed by text, full font string, numeric spacing in pixels, direction, and a font-readiness generation (plus any other shaping state actually set). Clear/invalidate on font readiness changes. Do not reuse a cached zero-spacing width. Derived fitted widths are not persisted.

### Nonzero fit procedure

The current algorithm assumes measured width scales linearly with font size. Native tracking measurement can round differently across fonts/runtimes. The new path must measure at the final size rather than rely on that assumption:

1. Compute the same raw anchor, row, provisional canvas clamp, and safe intervals over the **unfitted height** F0×1.2 as today's resolver. Keep the same frame padding, shape layout version, footprint and profile inputs. Calculate anchor-aware capacity C over every required row/interval, with no concavity bridging.
2. Measure W(1) using the nonzero settings. If C>0 and W(1)≤C, choose s=1. If C≤0 or W(0.5)>C, choose the existing floor s=0.5 and mark no-capacity/overflow honestly.
3. Otherwise perform a deterministic, bounded bisection over [0.5,1], retaining the fitting lower endpoint, for 20 iterations. Each candidate measures W(s) with L(s). Positive tracking is intended to make width nondecreasing; font/runtime monotonicity is a precondition to prove in tests. If violated, fail the feature's compatibility gate rather than ship an unproven solver. This procedure is for nonzero rows only.
4. Remeasure at the chosen s with the exact font/settings to be painted. Use that measured width, height F(s)×1.2, and final span intervals to resolve placement. Do not multiply the initial width by s. Clamp in center space using final dimensions; convert back to the drawing anchor; calculate bounds from that same width and anchor.
5. Re-evaluate containment and expose overflow at the floor; do not lower the floor, expand the shape, alter row positions silently, or claim that long strings always fit. Retain drawText's current line-height convention. Actual ink overhang is distinct from advance bounds and is an open test risk.

Implementation may share pure interval/placement helpers with the old resolver only if old-path byte/metric/pixel goldens remain unchanged. The bisection design requires performance validation before acceptance (20 measurements only when fitting, bounded cache, no per-frame unbounded loops).

## Anchors, shape rows and interaction freshness

Let A be stored normalized x, w the **fresh fitted** width in pixels, and W the logical canvas width. Before clamping:

| Align | Glyph center in normalized coordinates | Recover persisted anchor from clamped center c |
|---|---|---|
| left | A + w/(2W) | c − w/(2W) |
| center | A | c |
| right | A − w/(2W) | c + w/(2W) |

The actual rendered center after fit/clamp must come from `(bounds.x + bounds.width/2)/W`; the raw stored anchor may have been shifted for display. Increasing tracking holds the authored anchor unless containment requires a display clamp. Merely editing spacing must not rewrite stored x/y as an unsolicited migration. A subsequent explicit drag/nudge commits the correctly converted anchor based on the new rendered rectangle.

Diamond width changes with row and footprint. Sample the full vertical span, not only its center, and preserve both legacy stretched and v2 uniform geometry. Heart/star capacity is the intersection of disjoint interior intervals across span-critical rows; never use their outer envelope through a cleft/notch. A left/right anchor gets only the capacity on its own side in its containing interval. Circle/cake currently use canvas text bounds: this feature must not redefine their placement contract.

Treat rectangle freshness as a render identity: box ID + text + font/weight + size + tracking + alignment + position + canvas dimensions + shape/layout/profile/frame inputs + font-ready generation. On spacing/font/size/shape/aspect changes, invalidate prior hit/drag bounds until the matching text layer has rendered. Do not persist a center calculated with the previous spacing width. During an active drag, cancel/defer the drag commit when a typography revision invalidates its snapshot, then resume only on a fresh rectangle; do not mix old pointer offsets and new geometry.

After drag/nudge commit, perform the existing stored-position recheck only when both the rendered position **and typography/layout revision** match current store state. Preserve readOnly and foreign-recipe guards. Clear pending work before a corrective write. Because width now depends on tracking and remeasurement, do not assume the old one-pass fixed-point proof automatically holds. Proposed acceptance: one correction plus a verification render; if verification would require another write, report a failing case in tests and block release, never loop corrective state writes indefinitely. The approved implementation must establish termination/fixed-point behavior across diamond/concave rows before replacing any existing proof.

## Persistence, hydration and archive identity

Draft normalization (`src/lib/editorDraft.ts`) constructs explicit box objects; saved-map sanitization (`src/app/api/maps/route.ts`) also enumerates fields. Both would otherwise drop a new property. Include valid nonzero values explicitly, preserve absence on read/write, and test duplicate/share/recovery/hydration paths rather than assuming object spread everywhere. `buildRecipeFromState`, mapRecipeHydration consumers, and store updates must carry the same optional value without defaults or position conversion. A reset should remove the property, not serialize null.

**Load-bearing gate:** `src/lib/mapRecipeFingerprint.ts::stableMapRecipeFingerprint` enumerates text, size, fontFamily, color and align; it does not automatically include new TextBox properties. A renderer-only spacing implementation would therefore render different pixels under the same binding. `src/lib/downloadArchiveIdentity.ts` freezes that binding as fingerprint contract v1 and defines contract/renderer versions as archive identity components. These systems are fenced by ASTRA_BRIEF.

Future coordinated contract proposal: keep legacy absent/zero designs on the exact v1 canonical field set, ordering, bytes, fingerprint, contract version, and renderer identity. Use a separately approved new binding contract for recipes with nonzero tracking, including the validated per-row value and appropriate renderer identity. Identity selection must be server-derived from the saved recipe; a client must not choose an older contract to omit tracking. Existing archived artifacts and entitlements must remain readable under their original identity. **Do not implement conditional fields under frozen v1 or globally bump old identities.** If the DL-1 owner cannot approve a dual-compatible contract/renderer strategy, the feature remains blocked. This document makes no changes or version assignments in that programme.

## Required proof plan for a future implementation

These are proposed tests, **none were run as part of this design-only issue**.

| Area | Cases and required evidence |
|---|---|
| Legacy identity | Golden absent/zero recipes before/after: serialized recipe/binding/fingerprint/version tuple unchanged; same cached archive identity; hydration and reset do not insert fields |
| Legacy pixels | Fixed committed fonts and deterministic recipes: exact pixel bytes at square + every current portrait ratio, all shapes/layout versions, fit and non-fit rows, frame on/off, transparent mat, preview and export widths; old path unchanged |
| New measurement | 15 fonts and supported weights, 10/64 sizes and legacy saved sizes beyond UI max, t=0/.01/.20, short/240-character/overlong strings, whitespace, ligatures, combining marks, emoji and RTL; native measure/paint parity, capability gate, width monotonicity and final-size containment |
| Anchor math | Left/center/right, interior and edge anchors, stored x unchanged by spacing edit, exact center↔anchor round trip with fresh width; no unwanted center shift on aligned rows |
| Shape fit | Diamond apex/default/dragged rows; heart cleft and star notch; span-critical rows; floor/no-capacity cases; v1/v2; fitted nonzero bounds remain in one valid interval when capacity permits |
| Freshness | Change tracking mid-drag/mid-nudge, font load completion, size/aspect changes before pointer-up, stale render completion, stored vs preview positions; no stale-width persistence or infinite correction loop |
| Selection | Close rows and overlapping padded targets; exact rendered rect wins, nearest-center tie behavior unchanged after spacing changes |
| Persistence | Save/load, draft recovery, duplication, share/read-only view, reset-to-zero, invalid input rejection; no property stripping or silent migration |
| Pipeline | Both render entry points, preview logical px/DPR and 1200/6000px outputs; text layer/export geometry parity; all relevant caches invalidate |
| Identity/security (separate gate) | New nonzero values cannot collide or downgrade to v1; old identities and entitlements remain valid; server-loaded recipe governs archive preparation and replay; no change until fenced owner approval |
| Performance | Sustained slider input and drag on mobile: measured frame times, font-load/cache behavior, bounded solver calls and memory, no metrics cache contamination between rows |

## Open decisions and release blockers

1. Owner approval for 0–0.20 em and no negative tracking; whether scripts should expose the control.
2. Native canvas support and deterministic shaping across supported export/browser runtimes. No silent fallback is acceptable.
3. Measured performance budget for repeated fit queries; the proposed solver is deliberately precise but unbenchmarked.
4. A new fixed-point proof for spacing-aware correction and behavior for unavoidable overflow/ink overhang. Existing long-row overflow cannot be “fixed” by scope creep here.
5. DL-1 owner approval of compatible new binding/renderer identity. This is a hard dependency, not incidental follow-up work.
6. Print/checkout/download consumers are fenced; any future implementation touching them needs an explicitly approved separate scope. No prices/SKUs/promos/config work is authorized.

## Work performed for this document

Read issue #508 and its empty comment list, AGENTS.md and ASTRA_BRIEF.md. Inspected the source modules named above plus TextBox in store.ts. Ran `git diff --cached --check` after staging this document (result recorded in the PR). No implementation, runtime tests, rendering measurements, or CI validation are claimed for this design pass. Independent design review remains required; draft PR only, no merge/deployment.
