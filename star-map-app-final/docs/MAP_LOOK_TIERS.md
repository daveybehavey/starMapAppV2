# Map look tiers

Three editor tiers control star-map rendering without exposing every render knob up front:

| Tier | Preset base | Mat | Frame | Technical ring | Polish |
|------|-------------|-----|-------|----------------|--------|
| **Minimal** | `clean` | Transparent (PNG) | Off | Off | Off |
| **Polished** | `signature` | Filled | On | Navy Gold + Vintage only | Vignette/glow |
| **Custom** | User controls | User | User | User | Per visual mode |

## Typography slots

Each tier bundles **title**, **subtitle**, and **dedication** (date/location line) per style in `src/lib/mapLookTiers.ts` → `TIER_TYPOGRAPHY`. The dedication slot carries the formatted date line at the bottom of the map.

Advanced panel → **Reset to tier** restores typography for the active tier without changing render options.

## Export mat rule

- **Preview / free PNG / HD PNG:** `matPurpose: "preview"` — minimal tier keeps `transparentBackground: true`.
- **Print checkout asset:** `matPurpose: "print"` — always filled mat via `resolveTransparentMat("print", …)` even when the editor tier is minimal.

Implementation: `renderStarMap({ matPurpose })` in `src/lib/renderSky.ts`.

The editor print panel shows a **Minimal tier hint** when checkout is open: preview stays transparent, but the uploaded print JPEG includes a filled border.

## Print safe margin

Print exports (`matPurpose: "print"`) inset sky and typography by `PRINT_SAFE_MARGIN_RATIO` (4%, minimum 16px) via `resolvePrintSafeInset()` so trim and bleed at the printer do not clip stars or text. Preview and PNG exports are unchanged.

## Poster aspect ratio

Physical poster SKUs are square (18×18 unframed, 14×14 framed). When the map aspect ratio is not `square`, the editor print panel warns before checkout so buyers can switch to Square in Advanced and avoid letterboxing on the print file.

## Tests

### Unit (Playwright spec importing tier helpers)

```bash
cd star-map-app-final
npx playwright test tests/map-look-tiers.spec.ts
```

Covers tier presets, typography, transparent mat, print safe inset, technical ring defaults, snapshot fixture seed.

### Visual snapshots (tier × style matrix)

Fixed fixture: Santorini wedding · 2024-06-01 · seed `map-tier-snapshot-v1`.

| Snapshot | Tier | Style |
|----------|------|-------|
| `navyGold-minimal.png` | minimal | navyGold |
| `navyGold-polished.png` | polished | navyGold |
| `midnightMinimal-minimal.png` | minimal | midnightMinimal |
| `midnightMinimal-polished.png` *(pending baseline)* | polished | midnightMinimal |

Add the fourth row to `tierStyleMatrix` in `tests/map-tier-visual.snap.spec.ts` and run `--update-snapshots` once Playwright + dev server are up locally or on CI.

```bash
cd star-map-app-final
npx playwright test tests/map-tier-visual.snap.spec.ts --update-snapshots   # first run / intentional refresh
npx playwright test tests/map-tier-visual.snap.spec.ts                      # verify
```

Baselines live in `tests/map-tier-visual.snap.spec.ts-snapshots/`.

### Render smoke

```bash
npm run qa:smoke:render
```

## Local visual verify (manual)

1. `npm run dev` (or Playwright webServer on `:3004`).
2. Open `/editor?force=desktop`.
3. Style card → pick tier (Minimal / Polished / Custom).
4. Advanced → confirm **Reset to tier** and technical ring toggle.
5. Free export PNG on minimal → transparent mat; start print checkout → filled mat in uploaded JPEG.
6. Non-square aspect + print panel → square poster warning; minimal tier → filled-border hint.

## Ready-to-deploy checklist (sign-off)

- [ ] All three snapshot baselines pass on CI/local (`map-tier-visual.snap.spec.ts`).
- [ ] `map-look-tiers.spec.ts` green (17+ tests).
- [ ] `qa:smoke:render` green.
- [ ] Manual spot-check: navyGold minimal PNG alpha + print JPEG filled mat + safe margin inset.
- [ ] Wedding page shows sample testimonials with **Sample testimonial** label.
- [ ] No regressions on existing editor flows (sample moment, HD paywall, print checkout).

## Remaining gaps

- Snapshot matrix does not yet include parchment/vintage styles.
- Snapshot tests depend on font loading; flaky on first cold render — re-run if needed.
- Real permissioned testimonials still needed to replace sample wedding cards.
