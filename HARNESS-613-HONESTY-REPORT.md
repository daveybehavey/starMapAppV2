# PR #613 harness honesty — fix round 1

Base: `121612b3` (`origin/cursor/editor-render-equiv-harness-1e31`).
Worktree: `C:\Users\ReuseTechBC\projects\sm-q7`.
Branch: `fix/613-harness-honesty`. Harness source commit: `cc6035c8`.
The owner's self-contained bridge brief governs this local-only delivery. No push,
PR mutation, merge, deployment, production configuration or production source edits.

## Five findings

1. **Fixed:** browserEntry.mjs bundles the production `renderSky.ts` and its real
   astronomy/catalog dependency graph with the lockfile-provided esbuild. It builds
   the shared reference recipe and calls `renderStarMap`. Canvas methods execute
   normally while wrappers count actual calls, including offscreen contexts.
   Chromium integration coverage removes captions and proves measured text-draw
   volume falls; a unit check verifies the bundled production graph.
2. **Fixed and accurately labelled:** the timed region includes full-canvas
   `getImageData`. `render_plus_full_readback_ms` includes JS, Canvas instrumentation,
   completed raster work and readback; it is not isolated GPU/Skia time. A deterministic
   timer test proves readback happens after rendering and before the timer stops.
   Browser coverage checks full RGBA byte counts. First samples mean first per size
   in one process; fonts are browser fallbacks, not a pixel-equivalence baseline.
3. **Fixed:** `text_keystroke_base_plus_text` runs production base-sky and text-overlay
   entry points for each changed caption, reusing the worker sky. This reproduces
   the render work of the parent/external-recipe update path, including its base
   redraw; React scheduling/input latency is excluded. Base/overlay timing and
   draw counts are separate evidence. `preview_text_layer_only` remains explicitly
   isolated. Integration coverage requires >4,000 base arc fills, constellation
   strokes and caption text draws, and checks base draw volume against the base scenario.
4. **Fixed:** width/height assignments, including same-value resets, are captured
   in both command-stream hashers. All three equivalence pins include dimensions;
   each gains exactly two commands. Original draw-command hashes are also retained
   and asserted unchanged. A post-draw width/height reset regression test changes
   the stream/hash without changing any draw command.
5. **Relabelled:** `hd_astronomy_post_export_warm_ms` replaces the incorrect cold
   name because HD export already populated that key. It does not claim a cold
   measurement. Integration coverage requires the warm field and rejects the old name.

## Validation

Windows, Node **22.23.4**, `TZ=UTC`, unit files run sequentially.
A preliminary baseline overlapped dependency installation and was discarded;
the authoritative baseline below ran after installation completed and before edits.
`npm ci` succeeded (its npm launcher used the host Node 26); all test/profile/lint
commands below invoked the explicit Node 22 executable.

PowerShell setup:

```powershell
$node22 = 'C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$env:TZ = 'UTC'
$env:CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
```

Commands from `star-map-app-final/`:

- Baseline and final: `& $node22 --test --test-concurrency=1 scripts/unit/*.test.mjs`
- Targeted: `& $node22 --test --test-concurrency=1 scripts/unit/editorRenderEquivalence.test.mjs scripts/unit/editorRenderProfileHonesty.test.mjs scripts/unit/editorRenderProfileInstants.test.mjs` — **10 passed, 0 failed**.
- Chromium regression: `& $node22 --test --test-concurrency=1 scripts/editor-render-profile/browserProfile.test.mjs` — **1 passed, 0 failed**.
- Browser profile: `& $node22 scripts/editor-render-profile/browserProfile.mjs` — succeeded at **900, 1200, 6000** pixels, with full readback and actual call counts; replaces the stale synthetic JSON.
- Node profile: `& $node22 scripts/editor-render-profile/profile.mjs` — result recorded below.
- Harness lint: `& $node22 node_modules/eslint/bin/eslint.js scripts/editor-render-profile/*.mjs scripts/unit/editorRenderEquivalence.test.mjs scripts/unit/editorRenderProfileHonesty.test.mjs` — **0 errors**, one existing `lastPathHadMove` unused-variable warning.
- `git diff --check` — passed.

GitHub Actions was not triggered; local checks do not replace its authoritative validation.

| Suite | Tests | Pass | Fail |
| --- | ---: | ---: | ---: |
| Branch-tip baseline | 2689 | 2673 | 16 |
| Fixed harness | 2693 | 2677 | 16 |

**Zero new failures.** All 16 failure names are identical, compared programmatically.

Node profile succeeded; dimension-aware repeat hashes are identical. Keystroke
base draw calls: **5341**; overlay: **5**.

Existing failures (unchanged):

- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- city prune: next.config keeps the host redirects alongside the city map
- deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- retired posts permanently redirect one hop to the survivor
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers
- fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
- frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
- passes when every named critical smoke command discovers tests
- fails with the exact command and spec when Playwright discovers zero tests
- aggregate rating helpers are referenced nowhere outside the lib module
- no public copy states a review count or a numeric rating for StarMapCo
- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- saved-map API sanitizer validates and retains fontWeight
- fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
- composition: the renderer consumes the SAME clip path for the sky and the watermark

## Files touched

- `HARNESS-613-HONESTY-REPORT.md`
- `star-map-app-final/docs/EDITOR_RENDER_PERFORMANCE.md`
- `star-map-app-final/scripts/editor-render-profile/README.md`
- `star-map-app-final/scripts/editor-render-profile/browser-profile-results.json`
- `star-map-app-final/scripts/editor-render-profile/browserEntry.mjs`
- `star-map-app-final/scripts/editor-render-profile/browserProfile.mjs`
- `star-map-app-final/scripts/editor-render-profile/browserProfile.test.mjs`
- `star-map-app-final/scripts/editor-render-profile/canvasDimensions.mjs`
- `star-map-app-final/scripts/editor-render-profile/measureBrowserRender.mjs`
- `star-map-app-final/scripts/editor-render-profile/profile-results.json`
- `star-map-app-final/scripts/editor-render-profile/profile.mjs`
- `star-map-app-final/scripts/unit/editorRenderEquivalence.test.mjs`
- `star-map-app-final/scripts/unit/editorRenderProfileHonesty.test.mjs`
- `star-map-app-final/scripts/unit/fixtures/editor-render-dense-v1.json`

## Delivery

Local commits only. Bundle command from the worktree root:

```powershell
git bundle create ..\q7.bundle fix/613-harness-honesty ^origin/cursor/editor-render-equiv-harness-1e31
git bundle verify ..\q7.bundle
```

Bundle path: `C:\Users\ReuseTechBC\projects\q7.bundle`.
The bundle requires the original branch-tip prerequisite `121612b3`.
