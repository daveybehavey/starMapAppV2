# A11Y-FULLSCREEN-FOCUS report

## Scope and provenance

- Owner job: `run-a11yfs`, follow-up to the deferred P2 from PR #616. The explicit job authorizes this branch and bundle-only delivery, superseding the usual issue/PR delivery workflow. No push, PR, merge, deployment, or production access.
- Checkout: `C:\Users\ReuseTechBC\projects\starMapAppV2`. `.workdir` was absent there; the supplied environment explicitly identified this checkout.
- Ran `git fetch origin`; base `origin/main`: `380f4d1b0395d9828601a96c15ad3817f9aee453`.
- Fresh worktree: `C:\Users\ReuseTechBC\projects\sm-a11yfs`; branch `fix/a11y-fullscreen-focus`.
- Source repository is not shallow (`git rev-parse --is-shallow-repository` => `false`).
- Total model token usage is not exposed by this session, so no reliable total is available.

## Implementation

Found the inline fullscreen preview at `star-map-app-final/src/components/EditorExperience.tsx` (base lines 4497–4516). Extracted only its wrapper and exit button into `FullscreenPreview.tsx`; integration is now at `EditorExperience.tsx:4497`. All existing classes, preview props, button text/names, and the close-button scroll callback are preserved. There was no backdrop-dismiss handler; none was added. No renderer, saved design, pricing, payment, download, account, or production configuration changes. No dependencies added.

Existing modal inspection: `src/components/ui/Modal.tsx:43` uses `ui/useFocusTrap.ts`, and its Escape listener is at line 47. Reused that actual hook unchanged and mirrored its document-level Escape listener. Also inspected `EditorDrawer.tsx` and `PaywallModal.tsx`. These existing modals do not isolate background app content with `inert` or `aria-hidden`; the latter attributes found there hide decorative elements/backdrops only. Thus there was no background-isolation implementation to reuse. Added native inert isolation locally to the fullscreen component without changing shared modals.

All paths below are relative to `star-map-app-final/`:

1. **Named modal:** `src/components/FullscreenPreview.tsx:48` declares `role="dialog"`, `aria-modal="true"`, `aria-label="Fullscreen preview"`, and `tabIndex={-1}`.
2. **Focus entry/return:** `FullscreenPreview.tsx:16` calls the existing hook. `src/components/ui/useFocusTrap.ts:29` captures the active element, focuses the first control (Exit fullscreen), and restores focus during cleanup at line 65.
3. **Focus trap:** the same hook's real document keydown listener (`useFocusTrap.ts:40`) cycles first/last controls on Shift+Tab/Tab, querying controls each time so preview text-edit controls are included when present. No new trap implementation or dependency.
4. **Escape:** `FullscreenPreview.tsx:37` invokes the same `onClose` callback as the exit button at line 56. `EditorExperience.tsx:4499` retains the original state change and animation-frame scroll behavior.
5. **Background isolation:** `FullscreenPreview.tsx:20` makes siblings on the ancestor path to body inert, excluding the dialog and its ancestors. It runs after focus capture/entry. Prior inert values are retained; layout cleanup at line 11 restores them before the focus hook's passive cleanup returns focus. No CSS or portal relocation is needed.

## Tests and accessible-name sweep

Added `scripts/unit/fullscreenPreview.test.mjs`, using the repository's React test renderer + TypeScript loader conventions. The loader compiles the real component, and the test runs the real unmodified `useFocusTrap` hook. A minimal DOM adapter implements focus/activeElement, ancestry, inert focus rejection, and document key listeners; it does not implement trapping itself.

Both normal and React StrictMode cases assert named modal attributes, focus entry, forward/reverse boundary wrapping with multiple controls, a single-control cycle, Escape dismissal, button dismissal, focus restoration after inert cleanup, prior inert preservation, and listener removal.

Negative-control design: tests focus the last control, dispatch a synthetic Tab through the real registered handlers, and require both `preventDefault()` and `document.activeElement === exit`; Shift+Tab requires the reverse. Without the trap handler, activeElement remains at the opposite boundary and preventDefault remains false. Thus copied implementation logic or an inert DOM fixture cannot make the trap assertions pass.

Existing accessible names `Open fullscreen` and `Exit fullscreen` are unchanged; only the previously unnamed dialog gains `Fullscreen preview`. Swept tracked Playwright specs and e2e paths with `git grep -n -i -E 'fullscreen|full.screen' -- star-map-app-final/tests star-map-app-final/e2e` and `git grep -n -i 'fullscreen' -- '*spec*' '*e2e*'`. No matches (58 tracked spec/e2e-path files in the app); no locator updates required. Full Playwright browser suites and manual assistive-technology testing were not run.

## Validation environment

Node 22.23.5 was obtained with `npx --yes --package=node@22 node --version` and its cached binary directory prepended explicitly to PATH for every suite/typecheck/build run. `TZ=UTC` for all these runs. Initial `npx --yes --package=node@22 -c 'npm ci'` completed successfully but npm itself selected the system Node 26.13.0 (engine warning); this did not alter the lockfile. Validation uses Node 22, not that install runtime.

Base comparison uses a detached worktree at the exact base, `sm-a11yfs-base`, with a node_modules junction to the same installed dependencies. The initial comparison (started while installation was finishing) was discarded: base 189 failures versus final 17. Next.js test mock resolution was affected by the junction; `NODE_OPTIONS=--preserve-symlinks` fixed the 14/14 accountLogout probe. The matched reruns below both use that option after installation completed.

## Validation results

Commands below ran from each worktree's `star-map-app-final/` directory with Node 22.23.5 on PATH and `$env:TZ='UTC'`:

- `npm run test:unit`, with `$env:NODE_OPTIONS='--preserve-symlinks'`, at base: **3,141 tests; 3,124 pass; 17 fail; 0 cancelled/skipped** (exit 1).
- Same command/environment at final: **3,143 tests; 3,126 pass; 17 fail; 0 cancelled/skipped** (exit 1).
- Compared sorted names from every top-level `not ok` TAP line: **exact equality**, 17 names in each set. The base and final failure-name sets are both exactly the list below; no new failing name.
- aggregate rating helpers are referenced nowhere outside the lib module
- business profile never publishes phone; href stays empty
- city prune: next.config keeps the host redirects alongside the city map
- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- composition: the renderer consumes the SAME clip path for the sky and the watermark
- deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
- fails with the exact command and spec when Playwright discovers zero tests
- fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
- fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
- frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
- no public copy states a review count or a numeric rating for StarMapCo
- passes when every named critical smoke command discovers tests
- PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
- retired posts permanently redirect one hop to the survivor
- saved-map API sanitizer validates and retains fontWeight
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers

- `node --test scripts/unit/fullscreenPreview.test.mjs`: **2 pass, 0 fail**.
- Executed negative control: temporarily changed only the test loader to make the actual hook's Tab handler return immediately (focus entry/restore remained active). The same test command returned **exit 1, 0 pass, 2 fail**, at the boundary `preventDefault` assertion. Restored the loader byte-for-byte and reran: **exit 0, 2 pass**. The mutation is not shipped.
- `npm run typecheck`: **pass, exit 0**.

Local evidence logs (outside the branch) are `C:\Users\ReuseTechBC\projects\a11yfs-{base,final}-unit-verified.log`, `a11yfs-focus-final.log`, `a11yfs-negative-control.log`, `a11yfs-typecheck.log`, and `a11yfs-build.log`. No production service objects or credentials were collected.

- `npm run build`: **pass, exit 0** (webpack compilation and all 120 static pages completed). Next skips its built-in type validation by repository configuration; the separate typecheck above passed. The prebuild-generated merchant-feed.xml was restored, so it is not part of this overlay-only change.
- `git diff --check`: **pass**.

## Delivery verification

The incremental bundle is created with the explicit branch ref as well as the requested revision range:

```powershell
git bundle create C:\Users\ReuseTechBC\projects\qa11yfs.bundle 380f4d1b0395d9828601a96c15ad3817f9aee453..HEAD refs/heads/fix/a11y-fullscreen-focus
git bundle verify C:\Users\ReuseTechBC\projects\qa11yfs.bundle
```

The base commit is a prerequisite; this is deliberately not a standalone full-history bundle. Local test clone: `C:\Users\ReuseTechBC\projects\sm-a11yfs-bundle-check`, seeded from the detached base with `git clone --no-local --single-branch --no-checkout`, then supplied the branch through the bundle. Verification results are recorded below.

Additional validation: `node node_modules/eslint/bin/eslint.js src/components/FullscreenPreview.tsx scripts/unit/fullscreenPreview.test.mjs scripts/unit/fullscreenPreview.loader.mjs` passed (exit 0). Its first run flagged `no-this-alias` in the DOM test adapter; replaced that traversal with an equivalent recursive inert check and reran the focused tests (2/2 pass) and lint. This test-only cleanup followed the full-suite runs; production code is unchanged since those runs.

Bundle verification succeeded in both the implementation checkout and the local test clone. The clone initially held only the base history: `git cat-file -e <implementation-commit>` returned exit 1 before bundle import. After detaching the clone at the base, fetching the explicit bundle branch and checking it out reproduced the implementation commit; `git status --short` was empty and `git fsck --no-reflogs` passed. The clone's initial symbolic branch name came from the source repository, so the first fetch into that checked-out branch was refused harmlessly; detaching before fetch resolved it.

The report and test-only lint cleanup are included in the final amended commit. The final bundle is rebuilt and reverified after that amendment, and the local test clone is updated from that exact bundle before handoff. Commit author uses command-local `Codex <codex@localhost>` because no identity was configured; no Git configuration was changed.
