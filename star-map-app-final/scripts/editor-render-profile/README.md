# Editor render profile harness

Pinned dense scene and measurement scripts for the 2026-11-08 editor render performance brief.

- `referenceScene.mjs` — **do not change** between before/after timings
- `profile.mjs` — Node mocked-Canvas draw-call + wall-time profile
- `browserProfile.mjs` — Chromium production renderer bundled with the lockfile-provided esbuild; actual draw counts and render + full readback wall time

```bash
TZ=UTC node scripts/editor-render-profile/profile.mjs
TZ=UTC node scripts/editor-render-profile/browserProfile.mjs
```

Attribution memo: `docs/EDITOR_RENDER_PERFORMANCE.md`  
Equivalence pin: `scripts/unit/editorRenderEquivalence.test.mjs`

## Honesty fixes for #613

The browser runs the production scene/astronomy/render modules. Timings include
JavaScript, instrumented Canvas calls, raster completion and full RGBA readback;
they do not isolate GPU cost. First samples are first per size, not fresh-process
cold starts. Fonts use browser fallbacks, so these are not pixel goldens.
Set CHROMIUM_PATH for a local Chrome executable, or install Playwright Chromium.
Both profilers accept PROFILE_OUTPUT_DIR (default: this directory).

The Node keystroke metric exercises base sky plus text overlay for the editor
parent/external-recipe update path. It excludes React scheduling and input latency.
The isolated text-layer scenario remains separately named. The late HD astronomy
probe is explicitly post-export warm. Dimension assignments now participate in
both command-stream hashes; the equivalence fixture also retains the original
draw-command hashes to prove the repin changed capture only.

Regression checks (Node 22, TZ=UTC):

```bash
node --test --test-concurrency=1 scripts/unit/editorRenderEquivalence.test.mjs scripts/unit/editorRenderProfileHonesty.test.mjs scripts/unit/editorRenderProfileInstants.test.mjs
node --test --test-concurrency=1 scripts/editor-render-profile/browserProfile.test.mjs
```
