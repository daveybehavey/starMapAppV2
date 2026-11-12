# run-q10-parity audit / proposed PR body

Base: origin/main c4359fe4bff9266b18826bab88c97ed9d5deed4d. Branch: fix/meta-adapter-promo-parity.

## Outcome: reference gap; tests-only delivery

STOP on production implementation under the brief's reference-behaviour fence. The adapter already implements the chair's requested boundaries, but exact parity with website redemption cannot be demonstrated: the reference has no code-specific seasonal time gate. Do not treat this bundle as clearance for live Meta traffic. Human direction is needed on whether the reference should acquire those rules in separately approved work. No production code, reference semantics, disclosure, configuration, pricing, payment, or email code changed. No push, PR creation, merge, deployment, or live service inspection performed. This inlined owner brief authorizes the local bundle workflow in place of the normal issue/PR workflow.

## Parity table

All adapter campaign dates are finite 2026 dates in America/Los_Angeles. End dates include the entire final minute; rejection begins at the following midnight.

| Dimension | Adapter | Website reference | Finding |
| --- | --- | --- | --- |
| XMAS15 start | Nov 1 00:00 PDT = Nov 1 07:00Z | No seasonal start check | Adapter meets chair; reference gap |
| BLACKFRIDAY25 start | Nov 27 00:00 PST = Nov 27 08:00Z | No seasonal start check | Adapter meets chair; reference gap |
| BLACKFRIDAY25 end | Through Dec 1 23:59 PST; rejects Dec 2 00:00 PST = Dec 2 08:00Z | No seasonal end check | Adapter meets chair; reference gap |
| XMAS15 end | Through Dec 26 23:59 PST; rejects Dec 27 00:00 PST = Dec 27 08:00Z | No seasonal end check | Adapter meets chair; reference gap |
| Timezone | Explicit America/Los_Angeles calendar dates, including DST | No seasonal timezone evaluation | Cannot claim boundary parity |
| Recognized codes | Only XMAS15 and BLACKFRIDAY25, trimmed/case-insensitive | General Stripe codes plus configured-code fast path | Intentionally narrower adapter; exact set differs |
| Print products | All mapped prints and enabled merch use print compatibility | Print accepts non-digital_comp coupons; product scope, currency, minimum and margin validated later | Shared order compatibility; final eligibility downstream |
| HD single / HD pack3 | Both seasonal codes always rejected | Single accepts only digital_comp-tagged coupons; pack3 rejects manual coupons | Matches ordinary seasonal coupon metadata; code names themselves are not excluded by reference |
| Stripe active state | No Stripe/network lookup; local date/product gate applies first | Active-code list and coupon validity; configured ID path uses coupon validity | Adapter does not defer its boundaries to Stripe; checkout does |
| Signed carry | Date/product filter reruns on creation and reading; 24-hour expiry | Editor hands accepted code to checkout for final resolution | Carry cannot extend adapter window; checkout does not recheck seasonal dates |
| Disclosure | Existing dropped-promo handling unchanged | N/A | PR #637 preserved |

## Audit evidence

- `src/lib/metaCheckout.ts`: META_SEASONAL_CODES and filterMetaCoupon implement the two finite windows, Pacific date formatting and shared order compatibility. resolveMetaCheckout applies the filter before redirect/carry. No divergence from the chair's four requested boundaries found.
- `src/app/api/meta/checkout/route.ts`: GET captures one timestamp, resolves parameters and creates the signed carry; no session creation or Stripe lookup.
- `src/lib/metaCheckoutCookie.ts`: createMetaCheckoutCarry and readMetaCheckoutCarry both call filterMetaCoupon; reads also enforce signature, product binding and 24-hour expiry.
- `src/lib/checkoutPromotions.ts`: canUseManualPromotionCode and isManualPromotionCompatibleWithOrder depend on order type, plan and digital_comp metadata, not code names or dates. The reference does not establish either seasonal window.
- `src/app/api/checkout/route.ts`: resolvePromotionCodeId (lines 584-647) resolves configured IDs or lists active Stripe codes; no seasonal allowlist or time check. estimatePromotionDiscountCents (lines 688 onward) checks minimum/currency/product scope; createCheckoutSession applies the print margin guard. Both GET and POST use the shared compatibility policy after resolution.
- `src/lib/christmasCampaign.ts`: campaign phases govern publicity, explicitly not redemption. They cannot serve as checkout eligibility enforcement.

## Validation

Test evidence is recorded below. Local tooling and raw logs are under untracked `.tools/` and are excluded from the commit/bundle. Node 22.22.0 is prepended to PATH for all verification commands.

### Completed test evidence

| Check | Tests | Pass | Fail | Result |
| --- | ---: | ---: | ---: | --- |
| Full unit suite BEFORE | 2964 | 2947 | 17 | Captured unchanged baseline |
| New boundary suite | 41 | 41 | 0 | Pass |
| Full unit suite AFTER | 3005 | 2988 | 17 | Identical failure-name set |

Both full runs exited 1 with zero skipped/cancelled/todo tests. Failure names were extracted from TAP `not ok` records, stripped of sequence numbers, sorted, and compared with PowerShell Compare-Object: before 17, after 17, differences 0. This is green under the brief's Windows-baseline rule, not an assertion that the whole suite passes. No new failure name was introduced. Existing failures were not repaired in this task.

New coverage: 18 boundary cases (four transitions plus final eligible minute triplets), 16 product cases (six print SKUs and both HD plans for each code), 2 normalization cases, 2 non-renewal cases, 2 signed-carry expiry cases, and the exact two-code allowlist case. Tests import the real adapter and shared checkout compatibility policy using the existing tsAliasLoader; no copied implementation and no live service access.

### Exact commands

All npm invocations used the installed npm CLI with Node 22 explicitly selected, since the machine default is Node 26. From `star-map-app-final/`:

```powershell
$env:PATH = "$((Resolve-Path ..\.tools).Path);$env:PATH"
& node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci
& node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:unit
node --test scripts/unit/metaPromotionBoundary.test.mjs
& node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:unit
& node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run lint
& node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
```

These execute `npm ci`, `npm run test:unit` (before and after), `npm run lint`, and `npm run typecheck` without relying on the default Node. Output was redirected to `.tools/install.log`, `before.log`, `new-tests.log`, `after.log`, `lint.log`, and `typecheck.log`. Install exited 0. The dependency installer reported existing audit/deprecation and install-script approval warnings; no dependency changes or approval changes were made.

### Identical failure names (before AND after)
- aggregate rating helpers are referenced nowhere outside the lib module
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
- rebaseUntouchedDefaultDateTime yields 21:00 wall time in the target timezone
- retired posts permanently redirect one hop to the survivor
- saved-map API sanitizer validates and retains fontWeight
- source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it
- wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers

### Final static validation and delivery

- `npm run lint`: exit 0; 0 errors, 14 warnings in existing source files; none in the new test file.
- `npm run typecheck`: exit 0.
- `git diff --cached --check`: exit 0 after removing extra trailing blank lines.
- Only this report and `scripts/unit/metaPromotionBoundary.test.mjs` are included. All production/reference files remain unchanged.
- Bundle commands from the worktree root, after committing:

```powershell
git bundle create C:\Users\ReuseTechBC\projects\qparity.bundle fix/meta-adapter-promo-parity ^origin/main
git bundle verify C:\Users\ReuseTechBC\projects\qparity.bundle
```

The bundle uses origin/main c4359fe4bff9266b18826bab88c97ed9d5deed4d as its prerequisite. No push or traffic enablement is part of delivery.

The first commit attempt stopped because Git had no author identity; consequently its bundle commands had no new commit to package and failed. Retried with command-scoped agent identity only (no repository/global configuration mutation):

```powershell
git -c user.name=Codex -c user.email=codex@users.noreply.github.com commit -m "test(meta): pin promo boundaries and document reference parity gap"
```

Bundle creation and verification both exited 0. Git reported the bundle is okay and confirmed the required base c4359fe4bff9266b18826bab88c97ed9d5deed4d. After recording this result, the report commit was amended and the final bundle recreated and verified again.
