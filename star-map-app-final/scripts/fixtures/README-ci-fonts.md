# Deterministic CI fonts

The coordinator supplies `ci-font-manifest.json` unchanged. Its fifteen application families (fourteen editor fonts plus the shared Playfair Display layout font), weights, replay CSS hashes, source CSS provenance and immutable asset URLs are reviewed data. Source CSS hashes document the capture; preparation verifies replay CSS and asset hashes without requesting live CSS. No dynamic font discovery is supported.

Run from `star-map-app-final` after `npm ci`:

```sh
CI=true node scripts/prepare-ci-fonts.mjs --acquire
```

Only explicit `--acquire` permits network access. It downloads missing files from the fixed gstatic URL allowlist with redirects rejected, credentials omitted, a 15-second timeout and a 256 KiB per-asset ceiling. Live remote availability is still required during this acquisition step. Existing corrupted files fail and retain their bytes; acquisition does not silently repair them.

For cached offline verification:

```sh
CI=true node scripts/prepare-ci-fonts.mjs
```

The CLI requires `CI=1` or `CI=true`, including for production builds under test; it does not use `NODE_ENV`. No root, URL, output or command arguments are accepted. Paths derive from the script location. Symlink components are rejected. Preparation validates all assets before atomically publishing `.ci-fonts/responses.json`; failed validation preserves the previous mapping. The ignored `.ci-fonts/fonts/` cache holds hash-named WOFF2 files.

CI jobs set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` to the absolute workspace path `star-map-app-final/.ci-fonts/responses.json` before the existing build/browser commands. Next 16.1.6 requires a plain URL-to-CSS JSON object. Its mocked font fetch reads absolute paths beginning with `/`; other strings become dummy bytes. Generated CSS therefore references verified absolute local font paths ending in `.woff2`. Unknown CSS requests explicitly fail in Next's mocked-response path. Next development mode may report a fallback after a loader error; preparation and the production build remain required gates.

Playwright selects `next dev --webpack` only when CI and this exact deterministic mapping path are set, and starts a fresh server in that mode. Normal development and production deployment commands retain their existing behavior.

Run the existing lint, typecheck, unit and production build gates, then the full hosted 30-test commerce suite and UI/render smoke on the exact draft head. Synthetic unit-test headers only test validation mechanics; they are not visual fixtures or suite equivalence. Real captured fonts do not guarantee production appearance. Independent exact-head review, at most one bounded repair and fresh verification remain required. Revalidate PR #271 and #273 separately without merging or silently rebasing them.
