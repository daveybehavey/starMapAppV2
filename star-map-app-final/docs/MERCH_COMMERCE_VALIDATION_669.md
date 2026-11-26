# Issue 669 validation

Runtime: Node 22.23.5. No production credentials, provider mutations or paid orders used.

- npm ci --no-audit --no-fund: dependencies installed; initial installer used host Node26, all reported verification below used supported Node22.
- npm run lint: zero errors, 17 existing warnings.
- npm run typecheck: passed.
- Targeted commerce/settlement/shipping/contribution/route-race suites: 155/155 passed.
- Updated authorized scope fences (metaCheckout and checkoutInteriorTiming): 87/87 passed.
- Final editor region-forwarding regression plus merchandise helper suite: 11/11 passed.
- npm run test:unit: 3155 passed / 18 failed / 3173 total (before the additional passing editor-forwarding test). All 18 failures reproduced by name against unchanged main 2319c97b in an isolated snapshot with the same Node22, dependencies and --preserve-symlinks. These are NOT a green full-suite result and are not waived.
- npm run build: compiled and generated pages, then the installed Next16.4.1 security advisory check stopped the first run. Retry status recorded in PR.
- npm run qa:smoke:commerce: web server startup blocked by the same Next security advisory; no browser smoke result claimed.
- npm audit --omit=dev --json: 3 moderate dependency findings; Next fixAvailable16.4.6 reported. No dependency upgrade mixed into this PR.
- git diff --check: passed.

## Reproduced baseline failures
- business profile never publishes phone; href stays empty
- city prune: next.config redirects pin the full 21-entry map, one hop, no chains
- city prune: next.config keeps the host redirects alongside the city map
- rebaseUntouchedDefaultDateTime yields 21:00 wall time in the target timezone
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

## Independent review
A separate Codex reviewer found and verified corrections for region/cache collisions, draft-vs-confirmed identity, failure persistence, retained retry claims, alternate fallback, stable expiry and provider identity/recipient readback. New real retry/KV/authority tests cover retained drafts, GET-only reconciliation, manual-confirmation binding, unpaid refusal, and missing-native-configuration refusal. This is synthetic/source review, not a release approval.

Release still requires approved verified cost profiles, live Stripe event subscription correction, dependency/security resolution, passing hosted checks and staging proof. Cost-pending/reconciled drafts require explicit operator review; no unattended confirmation claim.
