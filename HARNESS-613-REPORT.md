# Harness #613 bridge report — 2026-11-11

## Scope and provenance

- Base: `58bc173a9e72b5c4c5d50ad19aa3cd68323a3b89`, fetched from `origin/cursor/editor-render-equiv-harness-1e31`; matches brief-time head.
- Worktree: `C:\Users\ReuseTechBC\projects\sm-613c`; branch: `fix/613-harness-ts-v2`.
- Harness source commit used for final measurements: `e2f040360772e9cfd65fca96a072a186a054f4ae`.
- Runtime-generated result timestamp: `2026-11-11T20:01:01.802Z`.
- Only profiler/helper, timestamp tests, generated Node results, attribution memo, and this requested report changed. No production code, dense-scene fixture, or equivalence test changed. Stale worktrees/branch were untouched. No push, merge, deployment, or production access.

## Invalid evidence and correction

At the base, `scripts/editor-render-profile/profile.mjs:680-683` fabricated date strings with a three-digit minute field (for example `2024-12-14T02:000:00.000Z`). All eight fail Date.parse. The production astronomy input guard returns an empty sky for them, so the committed date-change astronomy p50 of 0.003 ms measured an early return, not astronomy. The memo's 6–20 ms astronomy / 3–11 ms paint ranges were unsupported and are replaced.

The helper now starts from the real runtime clock (Date.now), adds 70-minute offsets using Date arithmetic, and formats only with toISOString. Before any profiler timing it requires exactly eight finite, canonical, pairwise-distinct ISO instants. No date-string templates remain in the generation path. The results retain all eight input instants and the source SHA.

The corrected date-change loop times computeVisibleStars at eight new astronomy cache keys, then separately times the mocked-Canvas base renderer supplied with that computed sky. Recipe construction is outside those timers. This measures cold-cache astronomy in an already warm process and Node rendering orchestration; it does not measure location changes, process-cold starts, browser raster completion, or UI latency.

## Corrected final full run

| Component | n | min ms | p50 ms | p95/max ms |
| --- | ---: | ---: | ---: | ---: |
| Date-change astronomy (cold cache per instant) | 8 | 2.049 | 2.72 | 13.231 |
| Base paint (supplied sky, mocked Canvas) | 8 | 5.012 | 5.367 | 8.745 |
| Paired combined time | 8 | 7.737 | 8.302 | 21.976 |

The astronomy p50 is approximately 907 times the invalid 0.003 ms signature. Initial fixed-scene astronomy is 18.526 ms; repeated identical cached calls have p50 0.003 ms (20 samples). That valid cached timing is distinct from the discarded invalid-input early return.

The final profiler exited 0, and the dense-scene command hash repeated identically: `ee8146ce24db016694e8020ea90c2de2cb0989a74d168c3df071d0c1c8d310bf`. No real production failure was exposed, so the stop-on-production-failure fence was not triggered. The committed JSON is the complete final profiler output, unedited. One earlier diagnostic full run overlapped installation/unit work; it is retained locally as profile-run.log, but the final run occurred after that work completed. No samples were selected or discarded within the committed run.

browserProfile.mjs does not construct date-change timestamps or import this helper. It and its results were not changed or rerun. Its unforced-completion timers and fixed-pixel workload remain outstanding gate findings; the memo excludes its figures as validated raster evidence. The memo also explains that the legacy computeSky_cold_ms and late hd_astronomy_cold_ms fields do not establish independent cold astronomy costs.

## Validation

Windows; Node **22.23.4**; **TZ=UTC**; full suites sequential (**--test-concurrency=1**).

| Run | Tests | Pass | Fail | Cancelled/skipped |
| --- | ---: | ---: | ---: | ---: |
| Dependency-stable PR-head baseline | 2686 | 2670 | 16 | 0/0 |
| Corrected harness | 2689 | 2673 | 16 | 0/0 |

**Zero new failures. All 16 failure names match exactly.** Main's historical 2683 plus the PR's three equivalence tests gives 2686; this fix adds three timestamp tests for 2689. This Windows result is not an all-green CI claim. GitHub Actions remains the authoritative validator.

An initial baseline was started before dependency installation finished and produced 2638 pass / 18 fail (2656 tests); missing Next modules prevented two files loading. That run was discarded as the comparison baseline. The definitive baseline above ran after installation and postinstall completed, with the three existing changed files restored to PR-head bytes and the two newly added helper/test files held outside the test glob, then all corrected files restored in a finally block. No production files were modified for this baseline.

Exact commands (app directory; prepend the Node 22 bin directory to PATH):

~~~powershell
$env:PATH='C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin;'+$env:PATH
$env:TZ='UTC'
node --version
node --test --test-concurrency=1 scripts/unit/*.test.mjs
node --test scripts/unit/editorRenderProfileInstants.test.mjs
node scripts/editor-render-profile/profile.mjs
~~~

- Node version: v22.23.4. Full suite command: exit 1 for both definitive runs, counts above.
- Isolated timestamp tests: 3 pass / 0 fail, exit 0. Validity, uniqueness, ISO round-trip, runtime-clock origin, malformed input, count, duplicates, and non-canonical representation covered.
- Pre-fix acceptance demonstration: applying the required finite-parse assertion to the old eight-string builder fails; 0/8 parse.
- Self-check trip: temporarily replaced the helper's Date(...).toISOString() expression with the original malformed literal and invoked the actual profiler. Exit 1, `Invalid profile instant: 2024-12-14T02:000:00.000Z`; the profiler heading/timings never started. Original helper restored in finally; no broken mutation committed.
- Installation: `npm ci --ignore-scripts` exited 0 (system Node 26 emitted an engine warning); `npm run postinstall` subsequently ran under Node 22 and successfully applied the existing Playwright patch. Both definitive suites used this same completed installation.
- Targeted ESLint: `node node_modules/eslint/bin/eslint.js scripts/editor-render-profile/profile.mjs scripts/editor-render-profile/profileInstants.mjs scripts/unit/editorRenderProfileInstants.test.mjs`: exit 0, zero errors, one pre-existing unused lastPathHadMove warning. No unrelated lint cleanup.
- `git diff --check`: passed.

Unchanged baseline failures (Windows path/import/spawn differences and source/fixture assertions, including CRLF-sensitive checks; not repaired in this scope):

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

Local full logs are retained under `star-map-app-final/.tmp-harness613c-evidence/` (gitignored, not in bundle). This report carries the transferable counts, failures, commands, mutation evidence, and measurements.

## Handoff

Bundle command (worktree root):

~~~powershell
git bundle create ..\harness613c.bundle fix/613-harness-ts-v2 ^origin/cursor/editor-render-equiv-harness-1e31
git bundle verify ..\harness613c.bundle
~~~

Bundle destination: **C:\Users\ReuseTechBC\projects\harness613c.bundle**. This is an incremental bundle requiring the base commit above. Keep #613 draft; Jack owns import/review and any later approval.
