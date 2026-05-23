# Map rendering deploy checklist

Use this before merging or deploying map-tier / renderSky changes. **Do not deploy** until all gates pass and manual spot checks look good.

## Pre-merge commands

From `star-map-app-final`:

```powershell
npm ci
npm run lint
npm run build
```

### Map-focused tests

```powershell
npx playwright test tests/map-look-tiers.spec.ts tests/render-sky-utils.spec.ts tests/map-tier-editor.spec.ts --workers=1
npm run qa:smoke:render
```

Record the passing test count from Playwright output for the PR notes.

### Optional broader smoke

```powershell
npm run qa:smoke:commerce
npm run qa:live-critical
```

Run live-critical only when validating a deployed preview URL (not required for local-only map work).

## Visual / snapshot updates

This repo does **not** use committed Playwright image snapshots for map tiers. Visual checks are:

1. `tests/map-tier-editor.spec.ts` — screenshot byte-size stability on tier re-select
2. `tests/premium-rendering.spec.ts` — saves `test-results/star-map-preview.png` for manual review
3. Manual PNG inspect: Minimal tier free export should show transparency outside the map shape

If you add formal snapshot baselines later, update with:

```powershell
npx playwright test tests/<spec>.ts --update-snapshots
```

Commit only intentional visual diffs; note style/tier intent in the PR.

## Manual editor verification

1. Open `/editor`, apply a sample moment, reveal preview
2. **Style → Map look:** exercise Minimal, Polished, Custom
3. Confirm **Reset typography** restores tier fonts after editing title font
4. Free export PNG — watermark present; Minimal has transparent mat
5. (Staging + test payment) HD export — no watermark; matches preview styling
6. (Staging) Print checkout — asset uploads; corners are filled, not transparent

## Deploy (when approved)

```powershell
npm run deploy:verify
```

Requires Wrangler OAuth on the deploy machine. See `docs/OPS_RUNBOOK.md`.

## Rollback

If production map rendering regresses after deploy:

```powershell
npx wrangler deployments list
npx wrangler rollback <previous-version-id> -y
npm run qa:live-critical
```

Document the rollback version id in the incident thread.

## Docs to keep in sync

- `docs/MAP_LOOK_TIERS.md` — architecture and mat policy
- `docs/PERF_BUDGETS.md` — CWV guidance if preview perf changes
