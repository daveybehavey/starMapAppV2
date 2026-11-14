# IA-1b banner-only bridge report — run-ia1bd

## Delivery and base

- Branch: `fix/print-modal-banner-overlap-b`.
- Fresh worktree: `C:\Users\ReuseTechBC\projects\sm-ia1bd`.
- Base after successful `git fetch origin`: `33827fd7adba560d918cff5b8e8b31e1e03ff710`.
- `git rev-parse --is-shallow-repository`: `false`; no unshallow required.
- FIRST operation: `Get-PSDrive C | Select-Object Name,Free,Used` measured **23,405,383,680 bytes (21.798 GiB)** free. Passed the 6 GiB gate before creating the worktree or installing dependencies.
- Created with `git worktree add -b fix/print-modal-banner-overlap-b C:/Users/ReuseTechBC/projects/sm-ia1bd origin/main`.
- Bundle return: `C:\Users\ReuseTechBC\projects\qia1bd.bundle` (incremental; requires the base above).
- The trusted bridge brief supplies the complete task and supersedes ordinary issue/PR routing. No push, PR, deployment or sends. The original checkout's files/branch were not changed; fetch and worktree registration only. `sm-ia1bc` was not touched. ASTRA_BRIEF.md and ASTRA_PROGRAMME.md are absent at this fetched base; the supplied fences were observed.

## Census at base (all paths below are under star-map-app-final)

1. `src/components/PaywallModal.tsx:419`: outer `fixed inset-0 z-50` container with `bg-black/40`. Dialog at 424–430; backdrop onClick at 420, Escape at 269–273, close button at 440–445. Mounted through `createPortal(..., document.body)` only when `paywallOpen && mounted` in `src/components/EditorExperience.tsx:4419–4489`; caller state at 481. All opening paths converge on this same component.
2. `src/app/globals.css:540–560`: `.cookie-banner` fixed, bottom/left/right 0.75rem, z-index 50. Existing banner-aware `html:has(.cookie-banner)` layout rules at 532 and 536. `@media (max-width: 640px)` at 605, explanatory IA-4 comment at 606–613, and `.cookie-banner` at 622–627 override to relative with automatic bottom/left/right. The >=768 rule at 658–664 adjusts desktop horizontal placement. No existing modal suppression.
3. `src/components/AnalyticsConsentManager.tsx:98` initializes unset; 103–109 reads stored consent and subscribes to `starmap:analytics-consent`. Lines 155–161 persist choices using ANALYTICS_STORAGE_KEY. Lines 167–168 render the banner solely on unset consent, without any modal guard. Mounted in `src/app/layout.tsx:290`. This component is unchanged.
4. Established modal stack: `src/components/ui/Modal.tsx:89`, `src/components/FullscreenPreview.tsx:52`, `src/components/EditorDrawer.tsx:60` all use z-50. No established z-60+ modal tier or shared modal-open event/context/body marker was found in components/hooks. `ui/Modal.tsx:65–74` temporarily manages body overflow/padding; `FullscreenPreview.tsx:10–34` restores/sets inert ancestor siblings. Those are component-local lifecycle mechanisms, not a shared overlay-state channel. Consent's event communicates consent only. Existing CSS :has() makes DOM presence the smallest applicable presentation mechanism.

Census matches Jack's verified answer. The specified pre-fix defect targets **width >640px**. At <=640px the banner is already in-flow; this fix deliberately leaves that presentation inert and unchanged. No mug ordering work was done.

## Change and lifecycle

Added one unconditional `data-paywall-modal="open"` marker to the outer PaywallModal element. Added one `@media (width > 640px)` rule: `html:has([data-paywall-modal="open"]) .cookie-banner { visibility: hidden; pointer-events: none; }`.

This is option (a), suppression, without React shared state or an event/effect. The browser derives the guard directly from mounted DOM: initial mount, all open paths, close button, Escape, backdrop, navigation/unmount, and multiple mounted instances cannot leave a stale global flag. Visibility preserves dimensions and existing body padding; the hidden banner is not hit-testable or keyboard-focusable. When the last modal disappears, existing consent rendering alone determines whether the banner returns. It does not restore a banner whose consent is settled.

At <=640px the new CSS does not apply. The existing top-of-page banner remains visible beneath the translucent backdrop where it did at base; the guard does not remove it, shift content, or modify the mobile override. This follows the explicit width-scoped direction, rather than claiming mobile suppression. No z-index, backdrop, copy, analytics gating, consent persistence, catalogue, ordering, price, payload, format availability or checkout logic changed.

## Commands and results

Commands ran inside `sm-ia1bd/star-map-app-final` unless otherwise noted. Test/build processes used Node **v22.23.5** and `TZ=UTC`, set in PowerShell:

```powershell
$env:PATH='C:\Users\ReuseTechBC\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin;'+$env:PATH
$env:TZ='UTC'
```

- `npm ci --no-audit --no-fund`: exit 0, 751 packages, existing Playwright patch applied. Installation used the PC default Node v26.13.0 and emitted an engine warning; all validation below used Node 22. Node 22 obtained with `npm exec --yes --package=node@22 -- node --version`; resolved executable with `npm exec --yes --package=node@22 -- node -p process.execPath`.
- `node --test scripts/unit/paywallBannerLayering.test.mjs`: **4/4 pass**. Source pins cover unconditional marker, desktop-only hiding/non-interaction, unchanged normal CSS including mobile, and unchanged unset-consent JSX/choices/provider gate. Baseline SHA-256 snapshots normalize CRLF to LF.
- Negative control: temporarily changed the guard's selector to `[data-paywall-modal="removed"]`, removing its match to the actual mounted modal. The same focused command exited 1, failing the guard pin (and the normal-styles pin because its exact guarded addition was no longer recognized). Restored the original CSS in `finally`; rerun exited 0, 4/4 pass. No mutation committed.
- Plain discovery command `npm run test:unit` expands to `node --test scripts/unit/*.test.mjs`: final output discovers **all 4 IA-1b pins**. Base: **3,150 tests, 3,133 pass, 17 fail**. Final: **3,154 tests, 3,137 pass, 17 fail**. Both exit 1. Exact sorted name-sets compared equal (listed below). No unrelated fixes.
- An earlier exploratory baseline overlapped npm installation and had missing-module failures; discarded. The reported baseline ran after npm ci completed, with both production files restored to base and the new pin file outside the test directory. Source diff was empty before that run.
- `npm run typecheck`: **exit 0**, no diagnostics.
- `npm run build`: **exit 0**, compiled successfully; 120/120 static pages generated. Build skips its internal type validation, so the separate successful typecheck above is the type evidence..
- `git diff --check`: exit 0.

The build pre-step regenerates public/merchant-feed.xml. Its generated output was preserved outside the repository and the tracked file restored byte-for-byte to base; no generated feed change is delivered.

### Exact full-suite failure name-sets

**Base name-set = final name-set**, each containing these same 17 names:

1. PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)
2. aggregate rating helpers are referenced nowhere outside the lib module
3. business profile never publishes phone; href stays empty
4. city prune: next.config keeps the host redirects alongside the city map
5. city prune: next.config redirects pin the full 21-entry map, one hop, no chains
6. composition: the renderer consumes the SAME clip path for the sky and the watermark
7. deploy-production Cloudflare step exports key/email secrets directly and never references the removed token
8. fails with the exact command and spec when Playwright discovers zero tests
9. fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text
10. fixture pagination, exact bytes, metadata, expiration, checksums and private manifest
11. frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper
12. no public copy states a review count or a numeric rating for StarMapCo
13. passes when every named critical smoke command discovers tests
14. retired posts permanently redirect one hop to the survivor
15. saved-map API sanitizer validates and retains fontWeight
16. source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
17. wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers

## Local visual evidence

Used installed Playwright Chromium, real PaywallModal and AnalyticsConsentManager components bundled with installed esbuild, and actual globals.css compiled with the installed Tailwind PostCSS plugin. A local isolated React harness supplied open/unmount controls, print intent and no-op checkout callbacks. Only Next navigation/link were substituted for local harness use; no application/service activation flags were set. All browser requests other than the intercepted local fixture document were blocked. No checkout button was activated, API called, credentials loaded, or customer data used.

Local commands (scripts retained outside the repository at `C:\Users\ReuseTechBC\projects\run-ia1bd-evidence`):

```powershell
node C:/Users/ReuseTechBC/projects/run-ia1bd-evidence/build-harness.cjs
node C:/Users/ReuseTechBC/projects/run-ia1bd-evidence/build-css.cjs
node C:/Users/ReuseTechBC/projects/run-ia1bd-evidence/visual.cjs
```

Visual assertions passed at **390x844, 640x844, 641x844, 768x844, 1280x844**: banner initially visible; position relative <=640 and fixed above; at >640 hidden with pointer-events none while modal mounted; banner height unchanged; restored after close button, Escape, backdrop click, and unmount; after Decline the banner stays absent across another open/close. No browser page errors. At <=640 computed banner state was unchanged while open. These are component-harness results, not full editor end-to-end or production verification. Production mobile screenshot closure remains Jack's gate after merge.

- [1280x844, closed](IA1B2-evidence/IA1B2-desktop-closed.png)
- [1280x844, open](IA1B2-evidence/IA1B2-1280-open.png)
- [641x844, open](IA1B2-evidence/IA1B2-641-open.png)
- [390x844, open — unchanged mobile presentation](IA1B2-evidence/IA1B2-390-open.png)
- [All viewport/lifecycle assertion results](IA1B2-evidence/visual-results.json)

## Bundle validation

`git bundle verify` passed in the implementation worktree and in a separate local test clone. Bundle advertises both HEAD and `refs/heads/fix/print-modal-banner-overlap-b`, with exactly the base SHA above as prerequisite. Test clone is `C:\Users\ReuseTechBC\projects\sm-ia1bd-bundle-check`; it was created using `--no-local` to transfer reachable main history rather than copy implementation objects from the shared object store. The implementation commit was confirmed absent before importing the bundle. Bundle import, checkout, and the four focused pins passed; clone working tree was clean.

Exact commands (paths abbreviated only by normal current working directories):

```powershell
# Implementation worktree
 git bundle create C:/Users/ReuseTechBC/projects/qia1bd.bundle 33827fd7adba560d918cff5b8e8b31e1e03ff710..HEAD fix/print-modal-banner-overlap-b
 git bundle verify C:/Users/ReuseTechBC/projects/qia1bd.bundle
# Projects directory, then test clone
 git clone --no-local --no-checkout --single-branch --branch main C:/Users/ReuseTechBC/projects/starMapAppV2 C:/Users/ReuseTechBC/projects/sm-ia1bd-bundle-check
 git fetch C:/Users/ReuseTechBC/projects/starMapAppV2 refs/remotes/origin/main:refs/remotes/base/main
 git bundle verify C:/Users/ReuseTechBC/projects/qia1bd.bundle
 git fetch C:/Users/ReuseTechBC/projects/qia1bd.bundle refs/heads/fix/print-modal-banner-overlap-b:refs/heads/fix/print-modal-banner-overlap-b
 git checkout fix/print-modal-banner-overlap-b
 node --test star-map-app-final/scripts/unit/paywallBannerLayering.test.mjs
```

After recording this evidence, the report commit was amended, the bundle regenerated with the same create command, and verification repeated. The final bundle was fetched into a new `ia1bd-final` ref in the same test clone, checked out, and the four pins rerun; final HEAD was compared with the implementation HEAD. No dependency installation was necessary in the test clone.

Git had no configured author identity. The first commit attempt failed before creating a commit; subsequent commit/amend used per-command `-c user.name=Codex -c user.email=codex@localhost`. No shared/global Git configuration was changed.

## Scope attestation

Delivered changes are limited to PaywallModal's DOM marker, globals.css's presentation guard, the four source pins in scripts/unit/paywallBannerLayering.test.mjs, this report, and the five visual evidence files linked above. No file outside that scope is added or changed in the delivered commit. Installation/build caches and raw verification logs remain local. No PC cleanup/deletion command was used. No push, PR, merge, deployment, bridge send, production configuration change, activation flag, payment/session/checkout-route change, price/amount/line-item change, mug ordering change, Stripe/Printful API call, or real order/customer-data access occurred.
