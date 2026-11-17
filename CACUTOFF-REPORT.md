# CACUTOFF report — run-cacutoff, lane 1

Implementation complete. Lint, typecheck, final build and render smoke pass. Full unit and commerce smoke are not all-green: 17 unit failures and one saved-map hydration failure reproduce at the unchanged base. No out-of-scope fix was made; these remain explicit acceptance limitations.

## Work order and setup

The owner's 2026-11-17 bridge brief authorizes this work without an issue and requires bundle-only delivery (no push, PR, merge, deployment, or sends).

- C: disk gate: 49.86 GiB free before cloning (minimum 6 GiB).
- Initial checkout `git fetch origin`: succeeded.
- Fresh clone: `git clone https://github.com/daveybehavey/starMapAppV2.git C:\Users\ReuseTechBC\projects\sm-cacutoff-source`.
- Fresh clone `git fetch origin`: succeeded; exact `origin/main` base: `e13dd41899fd9c3d68048846a39fb19709fb100d`.
- `git worktree add -b fix/ca-christmas-order-by-dates C:\Users\ReuseTechBC\projects\sm-cacutoff origin/main`.
- Full clone, not shallow (`git rev-parse --is-shallow-repository` returned `false`).
- Node: `C:\Users\ReuseTechBC\agent-node\node-v22.23.5-win-x64`, v22.23.5. This directory is prepended to PATH for every npm/Node validation command. Tests use `TZ=UTC` and run sequentially.

## Cutoff values

| Key | Base | Head |
| --- | --- | --- |
| framed_ca | 2026-12-03 | 2026-12-03 |
| framed_us | 2026-12-08 | 2026-12-08 |
| poster_ca | 2026-12-10 | 2026-12-03 |
| poster_us | 2026-12-09 | 2026-12-09 |
| mug_ca | 2026-12-08 | 2026-12-03 |
| mug_us | 2026-12-07 | 2026-12-07 |
| card_ca | 2026-12-08 | 2026-12-03 |
| card_us | 2026-12-07 | 2026-12-07 |

## Shipping basis

Checked on 2026-11-17: [StarMapCo shipping policy](https://starmapco.com/shipping) specifies 2–5 business days before shipment and 8–13 business days in transit to Canada. [Canada Post's November 12 announcement](https://www.canadapost-postescanada.ca/cpc/en/our-company/news-and-media/corporate-news/news-release/2026-11-12-canadas-holiday-delivery-network-is-ready-for-canadians) gives December 10 as the national Regular Parcel send-by date. That is a shipment deadline, not an order deadline.

Counting from the business day after a December 3 order, production ends December 7–10. Adding transit gives December 17 at the fast end, approximately December 23 at the midpoint, and December 31 at the slow end, excluding weekends and December 25/28 holidays. Thus December 3 offers a buffer and aligns with the existing framed date; it does not guarantee arrival before Christmas. December 24 is not the worst case. The historic framed_ca comment is deliberately untouched as instructed.

## Compact tables

Both `/black-friday` and `OccasionGiftPage` had these rows:

| Product / destination | Before |
| --- | --- |
| Framed print · Canada | Dec 3 |
| Framed print · US | Dec 8 |
| Posters | Dec 10 |

Both now use:

| Product / destination | After | Shared key |
| --- | --- | --- |
| Framed print · Canada | Dec 3 | framed_ca |
| Framed print · US | Dec 8 | framed_us |
| Posters · Canada | Dec 3 | poster_ca |
| Posters · US | Dec 9 | poster_us |

All four date cells call the existing shared `formatOrderByDisplayDate` function, now exported. That function reads `CHRISTMAS_ORDER_BY_DATES`; neither compact table contains a literal date. The tables keep their existing styling and the exact sentence: “Buffered estimates for standard shipping, not guarantees.”

## Files changed

- `star-map-app-final/src/lib/christmasCampaign.ts`: three Canada cutoff values; accurate shipping rationale and Dec 11 phase comment; earliest-product documentation; exported existing formatter. Phase logic remains unchanged.
- `star-map-app-final/src/app/black-friday/page.tsx`: shared date formatting, separate Canada/US poster rows, corrected stale table comment.
- `star-map-app-final/src/app/gifts/OccasionGiftPage.tsx`: same compact table correction.
- `star-map-app-final/src/app/compare/starmapco-vs-the-night-sky/page.tsx`: Canada poster prose changes to Dec 3.
- `star-map-app-final/scripts/unit/checkoutRecoveryTrustChristmas.test.mjs`: cutoff, summary, and earliest-product expectations; compact-table derivation regression check.
- `star-map-app-final/tests/black-friday.spec.ts`: four expected compact rows.
- `star-map-app-final/tests/occasion-gifts.spec.ts`: four expected compact rows.
- `CACUTOFF-REPORT.md`: this evidence report.

The sitewide banner derives Canada Dec 3 holders as framed prints, canvas wraps, posters, mugs and keepsake cards. The US earliest line remains Dec 7 for mugs and keepsake cards. The poster summary is US Dec 9 / Canada Dec 3.

## Deliberately unchanged

- framed_ca value and historic comment; framed_us, poster_us, mug_us, card_us.
- Campaign phase logic, including December 11 digital phase start.
- Prices, SKUs, promo codes, checkout, payments, downloads, print pipeline.
- Shipping table, production configuration, permissions, secrets and customer data.
- Other pages beyond the specifically named comparison-copy correction; no new pages or images.
- Existing documentation other than this required report; no deleted tests.
- No push, PR, merge, deploy, or outbound messages.

## Grep proof

`rg` was unavailable in PATH; used Git's tracked-file grep from the repository root instead. This sweeps the repository, not just the named pages, and excludes documentation and the dependency lockfile:

```powershell
git grep -n -i -E 'Canada[[:space:]]+Dec(ember)?[[:space:]]+(10|8)|_ca[^[:cntrl:]]*2026-12-(10|08)|Posters[[:space:]]+Dec[[:space:]]+10' -- ':!*.md' ':!package-lock.json'
```

Output: empty; exit 1 (no matches).

The broad audit command was also run:

```powershell
git grep -n -E 'Dec(ember)? (10|8)|2026-12-(10|08)' -- ':!*.md' ':!package-lock.json'
```

Its remaining matches are legitimate US framed Dec 8 values/copy/assertions, Dec 10 campaign-phase test inputs, the required Canada Post national **send-by** comment, and explanatory comments. There are no stale Canada Dec 8/10 order-by claims. A literal zero-hit assertion for every Dec 8 would contradict the explicit requirement to preserve framed_us. The shipping-carrier send-by comment is also explicitly required by the brief. Historic framed comments were left untouched.

The named additional sources (`src/data/seoOccasions.ts`, `src/lib/printCatalog.ts`, and `src/app/star-map-poster/`) had no stale matches and needed no changes.

## Unit validation

All commands below run from `star-map-app-final/` with Node v22.23.5 first in PATH and `$env:TZ='UTC'`. No production environment files or credentials were copied. `npm ci` passed (755 packages installed; approximately 28 minutes). Existing dependency audit warnings were not addressed in this bounded change.

The repository unit script is `node --test scripts/unit/*.test.mjs`; it was expanded with `--test-concurrency=1` to meet the explicit sequential-run requirement:

```powershell
node --test --test-concurrency=1 scripts/unit/*.test.mjs
node --test --test-concurrency=1 scripts/unit/checkoutRecoveryTrustChristmas.test.mjs scripts/unit/contentWave*.test.mjs scripts/unit/noInstantClaims.test.mjs
```

| Check | Base | Head |
| --- | --- | --- |
| Full unit suite | 3,154 tests: 3,137 pass / 17 fail | 3,155 tests: 3,138 pass / 17 fail |
| Focused suite | 70 pass / 0 fail | 71 pass / 0 fail |

No skipped or cancelled unit tests. Both full runs exited 1; both focused runs exited 0. The extra head test guards compact-table derivation. The contentWave and noInstantClaims tests pass unchanged. All 17 failure names and leading error signatures match between base and head. They include Windows file-URL/path handling, CRLF-sensitive source assertions, POSIX permission expectations, and `spawnSync npm.cmd EINVAL`; these were not silently fixed. Source dumps in diagnostics can differ where the authorized comparison-page copy changed, but the failing assertion and error are the same.

Matching baseline/head failures:

- business profile never publishes phone; href stays empty
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

Raw local logs (outside the deliverable branch): `C:\Users\ReuseTechBC\projects\cacutoff-{base,head}-{unit,focused}.log` and `cacutoff-install.log`.

## Lint, typecheck, build and browser validation

- `npm run lint`: exit 0; 0 errors, 17 warnings in unchanged files.
- `npm run typecheck`: exit 0.
- `npm run build`: initial head attempt and immediate retry each compiled successfully and generated 120/120 pages, then exited 1 with Next.js 16.4.1 `SecurityFatalError`: installed version affected by a known security vulnerability. No dependency upgrade or configuration change was made.
- Baseline `npm run build`: same compilation/page-generation success and the same final `SecurityFatalError` / exit 1. For this comparison, the four changed application files were temporarily restored from the exact base; `git diff e13dd41899fd9c3d68048846a39fb19709fb100d -- src` had zero lines. The committed head was restored afterward.
- Final cached head build retry: **exit 0**, compiled successfully and generated all 120 pages. Next continued via its built-in retry; the dependency advisory still applies and is reported here, not silently suppressed.

Initial standard browser commands:

```powershell
node scripts/run-playwright-with-ci.mjs tests/black-friday.spec.ts tests/occasion-gifts.spec.ts --workers=1
npm run qa:smoke:render
npm run qa:smoke:commerce
```

All three initial invocations exited 1 before running tests: pages and commerce encountered the Next.js advisory; render continued through Next's built-in retry but the default Turbopack server produced ENOENT for a malformed path combining the C: junction and D: real path. The failed local dev-server processes were stopped. No repository configuration was changed to work around this.

`C:\Users\ReuseTechBC\projects` is a junction to `D:\projects`. For local browser validation, started a persistent webpack dev server from the same worktree's real path, `D:\projects\sm-cacutoff\star-map-app-final`:

```powershell
node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3004
```

Node 22, TZ=UTC, CI=1, NEXT_DIST_DIR=.next-playwright, and the existing Playwright config's local-only dummy service values, entitlement fallback, and popup setting were used. No real credentials or env files were used. The server started via Next's built-in retry and the repository runner reused it. Re-ran the same three commands sequentially:

| Browser check | Result |
| --- | --- |
| Black Friday + occasion pages | 8 pass / 1 fail; all date-table assertions passed |
| `npm run qa:smoke:render` | **9 pass / 0 fail**, exit 0 |
| `npm run qa:smoke:commerce` | **31 pass / 1 fail**, exit 1 |

The page failure was `wedding-star-map renders and opens the editor at 390px`, a timeout at `occasion-gifts.spec.ts:61` waiting for the editor URL after all table assertions. Isolated retry passed (1/1):

```powershell
node scripts/run-playwright-with-ci.mjs tests/occasion-gifts.spec.ts --workers=1 --grep wedding-star-map.*390px
```

The commerce failure was `Editor map_id hydration > loads saved map from map_id query`, at `map-hub-editor.spec.ts:35`, waiting 30 seconds for the first canvas to appear. Re-running the map spec at head gave 1 pass / 1 fail. Running the identical unchanged map spec with the entire application `src/` restored to base gave the **same 1 pass / 1 fail and the same missing-canvas assertion**:

```powershell
node scripts/run-playwright-with-ci.mjs tests/map-hub-editor.spec.ts --workers=1
```

Thus commerce smoke is not all-green; the remaining failure reproduces at base and was not fixed outside scope. The buy-path application code is unchanged. A combined `--grep` retry attempt exited 255 because the repository runner passes arguments through the Windows shell and a regex pipe became a shell pipe; it was replaced with the two explicit commands above, not counted as a passing test.

Local evidence logs are `cacutoff-{lint,typecheck,build,build-retry,base-build,build-final,pages,render,commerce,pages-webpack,render-webpack,commerce-webpack,wedding-retry,map-retry,base-map}.log` under `C:\Users\ReuseTechBC\projects`.

The build's generated merchant feed was preserved outside the worktree and the tracked feed restored; it is not in the branch diff. `next dev` generated an untracked app-level AGENTS.md; after stopping the dev server, it was moved intact to `C:\Users\ReuseTechBC\projects\cacutoff-next-generated-AGENTS.md`. No files were deleted as cleanup. The source clone's optional node_modules junction and all evidence/checkouts remain available.

## Bundle verification and handoff

Code commit: `f1cc192f2d4b5e3bae2fb65964419018cc0be3ed`. Author identity follows the existing local bridge checkout: `Codex <codex@localhost>`; configured only in the fresh clone (not globally). The first commit attempt lacked an identity and made no commit; after applying the existing bridge identity, the commit succeeded.

Preflight commands (all passed):

```powershell
git bundle create C:\Users\ReuseTechBC\projects\qcacutoff-preflight.bundle refs/heads/fix/ca-christmas-order-by-dates
git bundle verify C:\Users\ReuseTechBC\projects\qcacutoff-preflight.bundle
git clone --single-branch --branch fix/ca-christmas-order-by-dates C:\Users\ReuseTechBC\projects\qcacutoff-preflight.bundle C:\Users\ReuseTechBC\projects\sm-cacutoff-preflight-check
git -C C:\Users\ReuseTechBC\projects\sm-cacutoff-preflight-check rev-parse HEAD
```

Verification reported complete history and exactly one ref, `refs/heads/fix/ca-christmas-order-by-dates`. Full test-clone checkout succeeded and HEAD equaled the code commit above.

Final deliverable: `C:\Users\ReuseTechBC\projects\qcacutoff.bundle`, containing only the branch ref and its complete reachable history, including this committed report. The final bundle is separately verified and test-cloned after the report commit; final commit ID, clone result, bundle SHA-256, and this report are recorded in `C:\Users\ReuseTechBC\projects\run-cacutoff.out`. No push, PR, merge or deployment is performed.
