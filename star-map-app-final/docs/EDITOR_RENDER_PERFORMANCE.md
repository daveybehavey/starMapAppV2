# Editor render performance — attribution memo

**Brief:** StarMapCo EDITOR RENDER PERFORMANCE deep pass (prepared 2026-11-08)  
**Base head (start gate):** `41c2f5124e4272ae2dea12a389df52c3a97a831e` (`main`, 2026-11-08)  
**Suite baseline at start head:** **2683 / 0** (reconciled; matches brief’s 2683/0 expectation; brief’s example SHA `f8de5050` was superseded by later main)  
**App root:** `star-map-app-final/`  
**Reference scene:** `editor-render-perf-dense-v1` — see `scripts/editor-render-profile/referenceScene.mjs`

---

## Start-gate verification

### Discrete pipeline: YES

| Role | File | Entry |
| --- | --- | --- |
| Paint orchestrator | `src/lib/renderSky.ts` | `renderStarMap`, `renderStarMapTextLayer`, `computeSky`, `drawSky`, `drawStarLayer`, `drawConstellations`, `drawText` |
| Editor preview | `src/components/PreviewCanvas.tsx` | Dual canvas: base sky (`includeText: false`) + text overlay |
| Desktop editor host | `src/components/EditorExperience.tsx` | `renderExportFile` / `handleExport("hd")` → 6000px |
| Mobile / simple host | `src/components/SimplifiedEditor/SimplifiedEditor.tsx` | `exportImage` parallel HD entry |
| Astronomy | `src/lib/astronomy.ts` | `computeVisibleStars` |
| Worker offload | `src/hooks/useAstronomyWorker.ts`, `src/workers/astronomy.worker.ts` | Off-main-thread sky for preview |

Flow:

```
Zustand store
  ├─ PreviewCanvas
  │    ├─ baseRecipe (textBoxes: []) + astronomy worker
  │    │     └─ renderStarMap(includeText:false) → base <canvas>
  │    └─ textBoxes / drag preview
  │          └─ renderStarMapTextLayer → overlay <canvas>
  └─ handleExport / exportImage
        └─ offscreen <canvas> → renderStarMap(full, 1200|6000) → PNG
```

### Existing render-equivalence inventory (before this PR)

| Coverage | Mechanism | Scenes | In CI unit suite? |
| --- | --- | --- | --- |
| `scripts/unit/milkyWay.test.mjs` | SHA-256 of mocked Canvas command stream | navyGold, 2 synthetic stars, 66 option/premium/quality cases | Yes |
| `scripts/unit/bortleSky.test.mjs` | Command-stream + one hardcoded hash | London 600×600, 4 styles × Bortle | Yes |
| `tests/map-tier-visual.snap.spec.ts` | Playwright `toHaveScreenshot` | Santorini wedding fixture, 3 tier×style combos | No (not smoke) |
| `tests/premium-rendering.spec.ts` | FNV canvas signatures must *differ* / restore | Live editor sample | `qa:smoke:render` |
| `scripts/evergreen-atlas/` | Real Chromium pixel hashes | Large matrix | Operator only |

**Gap:** no dense (~4k star) polished scene pinned in the unit suite. This PR adds that harness.

### Dense reference scene (fixed for all timings)

| Parameter | Value |
| --- | --- |
| id | `editor-render-perf-dense-v1` |
| datetime | `2024-12-14T02:00:00.000Z` |
| location | Santorini, Greece (36.3932, 25.4615, Europe/Athens) |
| style / tier | navyGold / polished / illustrated |
| canvas (preview) | 900×900 square rectangle |
| HD width | 6000 |
| text boxes | 4 (title, subtitle, dedication, quote) |
| options | constellation lines thin + labels, planets + labels, star glow, technical ring |
| measured sky @900 | **4407 stars**, Mars+Jupiter, moon, **41 constellations / 376 lines** |

Profiler: `TZ=UTC node scripts/editor-render-profile/profile.mjs`  
Browser raster probe: `TZ=UTC node scripts/editor-render-profile/browserProfile.mjs`

---

## Ranked hot paths (reference scene)

Measurements are Node mocked-Canvas wall time for JS orchestration (cold/warm) plus Chromium synthetic rasterization using the same draw-call mix. Host: Cloud Agent VM, Node 22.23.4, TZ=UTC.

### Draw calls per full render (preview 900 / same mix at HD)

| Category | Count | Share of ~5345 draw calls |
| --- | --- | --- |
| Arc fills (stars / halos / discs) | 4526 | ~85% |
| Constellation line strokes | 764 | ~14% (376 lines × 2 passes under polished `cinematicDetail`) |
| fillText (constellation + planet labels + captions) | 42 | <1% |
| fillRect / clearRect / other | ~13 | <1% |
| Radial gradients created | 113 | (halo prep; not all are separate draw calls) |
| beginPath | 5297 | 1:1 with almost every stroke/fill |

### Wall time by path

| Path | Cold (Node JS) | Warm p50 (Node JS) | Chromium raster cold / warm p50 (synthetic mix) |
| --- | --- | --- | --- |
| Full single canvas @900 | ~15 ms | ~5.4 ms | ~9.3 / 2.0 ms |
| Base sky only @900 (editor base) | ~5–11 ms | ~5.0 ms | (dominates full) |
| Text layer only @900 | ~0.4 ms | **~0.06 ms** | ~0 ms |
| Preview export @1200 | ~14 ms | ~5.0 ms | ~5.8 / 2.0 ms |
| HD export @6000 | ~10 ms JS + astronomy | ~4.7 ms JS | **~153 ms cold** / ~1.4 ms warm |
| Astronomy `computeVisibleStars` @900 | **~20 ms cold** | ~0.002 ms cached | — |
| Astronomy @6000 (HD) | ~same catalog cost (~20 ms cold) | cached after | — |

### Per-trigger re-render costs (intended dual-canvas model)

| Trigger | Intended effect | Measured paint cost (Node warm) |
| --- | --- | --- |
| Text keystroke / text colour / font | Text layer only | **~0.05–0.07 ms**, 5 draw calls |
| Text drag | Text layer only | **~0.05 ms** |
| Style / constellation colour / sky options | Full base sky | **~4.7–5.0 ms**, ~5341 draw calls |
| Date / location change | Astronomy recompute + base | Astronomy cold **~6–20 ms** + paint **~3–11 ms** |

### Preview vs HD split

- **Shared orchestrator:** both paths call `renderStarMap` (HD: single canvas, `quality: "export"`, width 6000).
- **Editor specialization:** PreviewCanvas splits sky vs text so caption edits need not redraw stars.
- **Cannot share `VisibleSky` objects across preview and HD:** projection is into canvas pixel space (`astronomy.computeVisibleStars` uses width/height). HD always recomputes astronomy at export size.
- **Duplicate work:** same star loop / constellation stroke logic runs at both sizes; caches (`astronomyCache` LRU 50, `skyCache` LRU 10, `textMetricsCache` LRU 100) help warm identical keys only.

---

## Hot-path ranking and fix class

| Rank | Hot path | Cost on reference scene | How often | Fix class | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **Base sky redraw fired by unstable `onRendered` prop** | Full base ~5 ms JS + raster, ~5341 draw calls — on *every parent re-render*, including text keystrokes | Every EditorExperience render while preview mounted (`onRendered={() => {…}}` inline; listed in base `useEffect` deps) | **Avoid full re-render for localized change** (ref-stabilize callback; do not paint-dep on callback identity) | Draft PR follow-up |
| 2 | Star layer arc fills (per-star `beginPath`+`arc`+`fill`, optional halo) | ~85% of draw calls; dominates base paint | Every base / export render | Draw-call batching by colour/alpha | **Findings-only** — overlapping discs change coverage if batched into one path |
| 3 | Polished double constellation stroke pass (`cinematicDetail`) | 764 vs 376 strokes (~14% of draws) | Every polished/premium base render | Remove second pass | **Findings-only** — changes glow compositing |
| 4 | HD export cold rasterization @6000 | ~153 ms synthetic cold (plus ~20 ms astronomy) | Once per paid HD download | Shared normalized-sky / bitmap pyramid | **Findings-only** — changing projection/sampling is render semantics |
| 5 | Cold astronomy compute | ~20 ms @900 | Date/location change; HD size key miss | Already cached when key repeats; worker offloads preview | No further safe change in-scope |
| 6 | `bvToRgb` per star (navyGold spectral) | ~0.39 ms → ~0.12 ms with Map cache microbench | Every star layer | Memoization of identical colour strings | Optional small follow-up if still warranted after #1 |
| 7 | Constellation `measureText` uncached | Tiny vs star layer | Labelled polished maps | Route through `getCachedTextWidth` | Optional micro follow-up |
| 8 | Text layer | Already ~0.05 ms | Keystrokes / drags | — | Healthy; keep split |

---

## What this PR ships

1. **Equivalence harness** for `editor-render-perf-dense-v1` (`scripts/unit/editorRenderEquivalence.test.mjs` + fixture).
2. **Profiler + pinned reference scene** under `scripts/editor-render-profile/`.
3. **This attribution memo.**

No render-path behaviour changes in this PR.

---

## Findings-only (do not build under this brief’s fences)

1. **Batching star fills or constellation strokes into multi-subpath single `fill`/`stroke`** — shared pixels (overlaps / line joints) would change alpha accumulation → not pixel-equivalent.
2. **Dropping polished double-line constellation pass** — intentional glow compositing.
3. **Normalizing astronomy to unit-space for preview/HD reuse** — float projection differences risk sub-pixel shifts; needs a separately authorized rendering change with pixel proof.
4. **Any change to text anchor / align / clamp / hit-test math** — absolute fence (stored position is an alignment **anchor**; `drawText` uses `ctx.textAlign = box.align`).

---

## Close-out checklist (updated as fix PRs land)

| Item | Result |
| --- | --- |
| Ranked table | Above |
| Equivalence harness | This PR |
| Fix PR: onRendered / base redraw | Planned next draft |
| Deliberately untouched | Render semantics, position/alignment, pricing, Stripe/Printful |
| Suite at start head | 2683/0 |
| Suite after equivalence harness | **2686/0** (+3 dense-scene tests) |
