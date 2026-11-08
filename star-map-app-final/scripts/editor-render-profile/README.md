# Editor render profile harness

Pinned dense scene and measurement scripts for the 2026-11-08 editor render performance brief.

- `referenceScene.mjs` — **do not change** between before/after timings
- `profile.mjs` — Node mocked-Canvas draw-call + wall-time profile
- `browserProfile.mjs` — Chromium synthetic rasterization of the measured draw-call mix

```bash
TZ=UTC node scripts/editor-render-profile/profile.mjs
TZ=UTC node scripts/editor-render-profile/browserProfile.mjs
```

Attribution memo: `docs/EDITOR_RENDER_PERFORMANCE.md`  
Equivalence pin: `scripts/unit/editorRenderEquivalence.test.mjs`
