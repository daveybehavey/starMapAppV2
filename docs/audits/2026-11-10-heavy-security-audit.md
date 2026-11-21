# Heavy repo-wide security audit — 2026-11-10

Read-only-first deep pass of `daveybehavey/starMapAppV2` (`star-map-app-final/`).  
**Deliverable:** classified findings + invariant pins only. No dependency upgrades. No production probing. Payments / Stripe / Printful payload / idempotency / entitlement-transition / price code are **findings-only**.

| Field | Value |
| --- | --- |
| Start head (untouched `main`) | `bb5b74785e1aa3ec06f561c64bbaa573474586b9` |
| Brief-time main head | `d277cef6` (reconciled: `#611` then `#612`/`#619` and others landed) |
| Baseline suite at start head | **2748 pass / 0 fail** (brief expected 2683/0; delta explained by merged coverage/Lighthouse work on `main`) |
| Suite command | `TZ=UTC PATH="$(dirname $(nvm which 22)):$PATH" npm run test:unit` from `star-map-app-final/` (Node **v22.23.4**, sequential) |
| Report location | `docs/audits/2026-11-10-heavy-security-audit.md` — matches existing repo-root `docs/audits/*` convention (`516-editor-audit.md`, `517-storefront-audit.md`, …) |
| Production code changed | **None** (honest zero) |
| Dependency upgrades | **None** |
| Live probing / sends | **None** — source + local build/tests only |

---

## Start gate

### Suite baseline reconciliation

| Metric | Brief-time | Start head `bb5b7478` |
| --- | --- | --- |
| Pass | 2683 | **2748** |
| Fail | 0 | **0** |

Green on untouched `main` → gate passed. Delta (+65) is explained by merged PRs after brief prep (notably `#612` coverage expansion and subsequent main commits through `#619`); not an unexplained red/green flip.

### Sibling-collision inventory (open PRs vs `main`)

**Statement:** this audit **did not edit** any file path currently changed by an open PR. Findings that touch overlapped paths are flagged with the PR number. New files only: this report + `star-map-app-final/scripts/unit/securityAuditInvariantPins.test.mjs`.

| PR | Title (abbrev) | Files (count) | Security-relevant paths |
| --- | --- | --- | --- |
| #527 | owner decision packs | 4 | docs only |
| #581 | Sentry wiring assessment | 1 | docs only |
| #584 | W6 download authority audit | 1 | docs only |
| #585 | Canadian copy audit | 1 | docs only |
| #586 | storefront silent-failure stop | 1 | docs only |
| #587 | mobile storefront scope stop | 1 | docs only |
| **#608** | backup slice 1 DO census / EntitlementAuthority export | 10 | `EntitlementAuthorityDO.ts`, `api/ops/entitlement-authority/export/route.ts`, export scripts/tests |
| **#609** | backup slice 3 Referral/Consistency/Review export | 11 | `ReferralDiscoveryDO.ts`, `ConsistencyCoordinatorDO.ts`, `ReviewRequestLedgerDO.ts`, `ReviewRequestSuppressionDO.ts`, `api/ops/do-backup/export/route.ts`, `lib/doBackupExport.ts` |
| **#610** | backup slice 2 Gift/PrintOrder export | 13 | `GiftCertificateGrantDO.ts`, `PrintOrderAuthorityDO.ts`, `api/ops/durable-objects/export/route.ts`, `lib/durableObjectExport.ts` |
| #613 | editor render equivalence harness | 9 | tests/docs/profile only |
| #614 | PreviewCanvas onRendered stable | 2 | `PreviewCanvas.tsx` (editor; ANCHOR rule untouched) |
| #615 | coverage remainder | 13 | unit tests only (incl. planned `adminAuthReal.test.mjs`) |
| #616 | a11y round 2 | 10 | UI clients/layout (not auth APIs) |
| #617 | SEO JSON-LD / sitemap | 35 | storefront pages/schemas |
| #618 | docs for entitlement/print/backup | 10 | **docs +** `entitlementsStore.ts`, `giftCertificates.ts`, `printful.ts`, `printOrders.ts`, `printFulfillmentPostSubmit.ts` |

Note: brief listed coverage `#612` as open; `#612` is **merged** on current `main`. Marathon-adjacent open work is `#616`/`#617`/`#618`.

### Audit inventory counts

| Surface | Count |
| --- | --- |
| API routes audited (`src/app/api/**/route.ts`) | **45** |
| Durable Object classes audited | **7** |
| Inbound webhook routes audited | **2** (`/api/stripe/webhook` + `/api/stripe` re-export; `/api/printful/webhook`) |
| `npm audit` advisories classified | **20** (1 low, 19 moderate; 0 high/critical) |
| Header/CSP emission surfaces checked | middleware (absent), `next.config.mjs`, `wrangler.toml`, `cloudflare-worker.ts`, `src/app/layout.tsx`, Set-Cookie sites |

---

## Area 1 — Auth / session

### Route classification summary

Auth primitives in use: `PRINT_ADMIN_TOKEN` (`src/lib/adminAuth.mjs:7-32`), premium cookie `starmap_premium`, account cookie `starmap_account_session`, claim tokens, Stripe/Printful webhook secrets, gift codes, review opt-out HMAC. **No `CRON_SECRET`** in this app.

| Bucket | Count (approx) | Verdict |
| --- | --- | --- |
| Admin-gated (`requireAdmin` / `hasValidAdminToken`) | 13 | OK — fail-closed when token empty (`adminAuth.mjs:10`) |
| Premium-cookie gated mutators | 9 | OK — 401 before entitlement work |
| Claim / magic / code / HMAC bearers | 8 | OK |
| Webhook signature/secret | 3 (+ `/api/stripe` alias) | OK (see Area 3) |
| Intentional-public / capability-URL | ~20 | intentional-public |
| Gaps | 1 | **F-AUTH-1** |

Full method table (condensed; every claim cited):

| Route | Methods | Required | Actual check | Verdict |
| --- | --- | --- | --- |
| `/api/account/access-email` | POST | premium cookie + recoverable | cookie → 401; `hasRecoverableAccess` → 403 (`access-email/route.ts`) | OK |
| `/api/account/magic/request` | POST | public + rate limit | rate limit; generic success | intentional-public |
| `/api/account/magic/claim` | POST | magic token | coordinator `consumeMagicToken`; sets account cookie (`magic/claim/route.ts:44-95`) | OK |
| `/api/account/magic/logout` | POST | clear session | clears cookie only (`logout/route.ts:6-15`) | **F-AUTH-1** |
| `/api/account/my-sessions` | GET | account cookie | cookie + KV `account:session:*` | OK |
| `/api/account/recover` | POST | public recovery | rate limit; generic success | intentional-public |
| `/api/account/sessions` | GET | admin | `requireAdmin` | OK |
| `/api/analytics/checkout-diagnostics` | GET/POST | admin GET; public POST telemetry | gated GET; rate-limited POST | OK / intentional-public |
| `/api/analytics/funnel` | GET/POST | dashboard token GET; public POST | `hasFunnelDashboardAccess` (`funnelDashboardAccess.ts:30-38`) | OK (non-prod open if token unset — documented) |
| `/api/analytics/funnel/reconcile` | POST | admin | `requireAdmin` | OK |
| `/api/bulk-quotes` | POST | public lead | flag + rate limit + honeypot | intentional-public |
| `/api/checkout` | GET/POST | public; QA headers need admin | handoff + `resolveQaRequestContext` | intentional-public |
| `/api/geocode` | GET | public | rate limit | intentional-public |
| `/api/maps` | POST/GET | public UUID capability | rate limit; UUID on GET | intentional-public |
| `/api/marketing-attribution` | POST | public | rate limit; sets UTM cookie | intentional-public |
| `/api/promotions/subscribe` | POST | public | rate limit + honeypot | intentional-public |
| `/api/promotions/subscribers` | GET | admin | `requireAdmin` | OK |
| `/api/entitlements/claim` | GET | claim token | `claim:{token}` + governing token; may set premium cookie | OK |
| `/api/entitlements/link` | POST | premium cookie | cookie → 401; digital access gates | OK |
| `/api/entitlements/consume` | POST | premium cookie | cookie → 401 | OK |
| `/api/entitlements/compensate` | POST | premium cookie + consume token | cookie → 401 | OK |
| `/api/premium` | GET | optional cookie | soft `paid:false` if absent | OK |
| `/api/download/archive` | GET/POST | claim / protocol session | `requireEntitledSession` / `resolveSession` | OK |
| `/api/gift-certificates/certificate` | GET | **session_id bearer** (accepted design) | rate limit + `session_id` (`certificate/route.ts:12-58`) | audited-clean (fidelity) |
| `/api/gift-certificates/redeem` | POST | gift code | code + grant DO | OK |
| `/api/ops/download/resend` | POST | admin | `requireAdmin` | OK |
| `/api/ops/search-console/query` | GET | admin | `requireAdmin` | OK |
| `/api/print/orders/*` (notify/resolve/retry/status) | * | admin | `requireAdmin` | OK |
| `/api/reviews/proof` | POST | admin | `requireAdmin` | OK |
| `/api/print/assets` (+ `[assetId]`, resolve) | * | UUID capability | UUID regex + rate limit | intentional-public (**F-INJ-2** cache note) |
| `/api/referrals/attribution|visit` | POST | public + valid code | code must exist in KV | intentional-public |
| `/api/referrals/link|status` | POST/GET | premium cookie + digital | cookie → 401 | OK |
| `/api/reviews/opt-out` | GET/POST | HMAC | `verifyReviewOptOutToken`; GET confirm-only | OK |
| `/api/stripe/webhook` (+ `/api/stripe`) | POST | Stripe signature | raw body `constructEvent` (`webhook/route.ts:3304-3316`) | OK |
| `/api/stripe/verify` | GET | **session_id bearer** (accepted design) | rate limit; may set premium cookie | audited-clean (fidelity) |
| `/api/stripe/portal` | POST | premium cookie + subscription | cookie → 401 | OK |
| `/api/printful/webhook` | POST/GET | shared secret | `verifyWebhookToken` before body (`printful/webhook/route.ts:46-54,375-406`) | OK auth-before-mutate; see **F-WH-1** |

### Session / cookie analysis

| Cookie | Identity | Flags | Cite |
| --- | --- | --- | --- |
| `starmap_premium` | Stripe Checkout **session id** | HttpOnly; Secure if `NODE_ENV===production`; SameSite=Lax; path `/` | `entitlements/claim/route.ts:62-68`; `stripe/verify/route.ts:289-295` |
| `starmap_account_session` | Opaque UUID → KV | same flags; 30d | `magic/claim/route.ts:89-95` |
| `starmap_ref` | HMAC-signed referral | HttpOnly; **Secure always**; SameSite=Lax | `referrals/attribution/route.ts:71-78` |
| `starmap_ref_src` | base64url UTM JSON | same as `starmap_ref` | `marketing-attribution/route.ts:50-57` |

### Session-id bearer — fidelity to accepted design (not re-litigated)

Design docs and route comments treat Checkout `session_id` as a buyer capability bearer (`docs/post-purchase-access-architecture.md:22,69,212`; `gift-certificates/certificate/route.ts:12-17`).

| Check | Result |
| --- | --- |
| Scope | `/api/stripe/verify` settles/sets premium cookie; `/api/gift-certificates/certificate` returns redeem code until redeemed |
| What it cannot reach | Admin ops; magic hub without account cookie; consume/compensate without cookie first |
| Revocation | Session `revoked` / failed digital evaluation blocks cookie-gated routes; gift code suppressed after redeem |
| Implementation fidelity | **Faithful** — audited-clean as design, not a defect |

Claim-token bearer (`claim:{uuid}`) uses governing-token rotation and TTL (`entitlementsStore.ts` / claim + archive routes) — audited-clean.

### Findings — Area 1

#### F-AUTH-1 — Medium — Magic logout clears cookie but does not revoke server session

- **Seam:** `POST /api/account/magic/logout`
- **Evidence:** `src/app/api/account/magic/logout/route.ts:6-15` sets cookie `maxAge: 0` only. Session row written at `magic/claim/route.ts:81` (`account:session:{token}`) is not deleted.
- **Reachability:** Attacker with a copied `starmap_account_session` cookie remains valid until TTL (~30d) after victim “logs out”.
- **Remediation (recommendation only):** delete/expire the KV session (and coordinator index entry if present) before clearing the cookie; add a pin that logout invalidates a subsequent `my-sessions` call with the old token.
- **Overlap:** none (logout route not in open PRs).

### Audited-clean — Area 1 (method)

| Item | Method |
| --- | --- |
| Admin routes fail-closed | Read `adminAuth.mjs:7-14`; empty configured/candidate → false; confirmed on ops/print/analytics admin routes |
| Entitlement mutators require premium cookie | Read consume/compensate/link/portal — cookie check precedes state mutation |
| Claim governing-token enforcement | Read `entitlements/claim` + `download/archive` reject non-governing tokens before archive access |
| Session-id bearer fidelity | Compared implementation to architecture doc + certificate route comment; behaviour matches accepted decision |
| Webhook auth presence | Stripe signature + Printful token verified before handlers (Area 3) |

---

## Area 2 — Durable Object surfaces

### Binding model (`wrangler.toml`)

| Binding | Class | Lines |
| --- | --- | --- |
| `PRINT_ORDER_AUTHORITY` | `PrintOrderAuthorityDO` | 159–161 |
| `REVIEW_REQUEST_LEDGER` | `ReviewRequestLedgerDO` | 169–171 |
| `ENTITLEMENT_AUTHORITY` | `EntitlementAuthorityDO` | 186–188 |
| `REVIEW_REQUEST_SUPPRESSION` | `ReviewRequestSuppressionDO` | 199–201 |
| `REFERRAL_DISCOVERY` | `ReferralDiscoveryDO` | 212–214 |
| `CONSISTENCY_COORDINATOR` | `ConsistencyCoordinatorDO` | 225–227 |
| `GIFT_CERTIFICATE_GRANT` | `GiftCertificateGrantDO` | 239–241 |

Exported from Worker `cloudflare-worker.ts` (Sentry-wrapped). **No DO `fetch` handlers** on `main` — RPC (+ alarms on some classes) only. Public internet cannot call DO stubs without Worker bindings.

### Cross-cutting observation

**No DO method performs caller authorization** before read/mutate. Trust = Cloudflare binding isolation + Worker/API route gates. Instance id is not cross-checked against `sessionId` arguments inside DOs.

### Per-class entry points (condensed)

| DO | Entry points | Transport | In-DO auth | State reachable |
| --- | --- | --- | --- | --- |
| EntitlementAuthorityDO | `getState`, `apply`, `commit`, `grant`, `compensate`, `rotateCapability`, reward/purchase helpers | RPC | **None** | Ledger JSON via Worker callers (webhook/cookie routes) |
| GiftCertificateGrantDO | `getRow`, `initialize`, `confirmPublished`, `publish` | RPC | **None** | Grant row + KV publish; redeem is code-as-credential |
| PrintOrderAuthorityDO | `getState`, `apply`, bind/claim/terminal/operator/seed helpers | RPC | **None** | Order authority; admin print routes + webhook |
| ConsistencyCoordinatorDO | magic/account/promo RPCs + **`alarm`** | RPC/alarm | **None** / platform alarm | Magic tokens, account sessions, promo docs, email send from alarm |
| ReferralDiscoveryDO | `getAssociation`, `register`, `recordTerminalNegative` | RPC | **None** | Referral association (Stripe webhook gated) |
| ReviewRequestLedgerDO | `getState`, `apply`, **`alarm`** | RPC/alarm | **None** / platform | Review rows; proof is admin-gated |
| ReviewRequestSuppressionDO | `check`, `record`, `clear`, `erase`, `dispatch`, **`alarm`** | RPC/alarm | **None** / platform | Suppression; opt-out HMAC at API |

### Ops / export endpoints

**On `main` today:** only `POST /api/ops/download/resend` and `GET /api/ops/search-console/query` — both `PRINT_ADMIN_TOKEN`, fail-closed. **No DO export routes shipped.**

**Open draft PRs (audited from PR file lists / descriptions, not edited):**

| PR | Route | Auth before DO read | Overlap flag |
| --- | --- | --- | --- |
| #608 | `GET /api/ops/entitlement-authority/export` | `requireAdmin` then `exportState` | **overlap #608** |
| #610 | `GET /api/ops/durable-objects/export` | admin then Gift/Print `exportState` | **overlap #610** |
| #609 | `POST /api/ops/do-backup/export` | admin then multi-DO `exportState` (highest PII) | **overlap #609** |

### Findings — Area 2

#### F-DO-1 — Medium — DO classes have no in-DO authorization (defence-in-depth)

- **Seam:** all seven DO classes’ RPC methods.
- **Evidence:** e.g. `EntitlementAuthorityDO.ts` `getState`/`apply` read/write immediately; same pattern across Gift/Print/Consistency/Referral/Ledger/Suppression.
- **Reachability:** not directly from the public internet; reachable if a Worker bug or stolen binding context calls the wrong instance/method. Amplifies risk of future ops export surfaces.
- **Remediation:** optional defence-in-depth: assert `ctx.id.name` matches expected instance key; scoped export credentials distinct from `PRINT_ADMIN_TOKEN`.
- **Overlap:** DO source files under **#608/#609/#610** — findings-only; do not edit those files here.

#### F-DO-2 — Medium — Upcoming DO export routes share a single long-lived admin token (PR-flagged)

- **Seam:** ops export routes in **#608/#609/#610** (not on `main` yet).
- **Evidence:** PR paths put `requireAdmin` before `exportState`, but return full authority/PII documents over HTTP once that one token is valid.
- **Reachability:** stolen `PRINT_ADMIN_TOKEN` → full DO dump by instance id/name.
- **Remediation:** dedicated backup export secret, short-lived signed ops tokens, allowlisted instance ids, response redaction for PII fields.
- **Overlap:** **#608/#609/#610** — human decision before merge.

### Audited-clean — Area 2 (method)

| Item | Method |
| --- | --- |
| No public DO `fetch` surface | Grep/read all seven DO files — RPC/alarm only |
| Admin print/ops proxies gate token before DO use | Read `print/orders/*`, `reviews/proof`, `ops/*` — `requireAdmin` precedes stub calls |
| Alarms not attacker-callable | Alarm handlers are platform-scheduled (`ConsistencyCoordinatorDO`, ledger, suppression) |
| Export routes absent on main | Glob `src/app/api/ops/**` — only resend + search-console |

---

## Area 3 — Input validation + injection + webhooks

### Webhook verification verdicts

#### Stripe — `src/app/api/stripe/webhook/route.ts` (+ `/api/stripe` re-export)

| Check | Result | Lines |
| --- | --- | --- |
| Raw body | **Yes** — `await req.text()` | 3311–3312 |
| Secret | `process.env.STRIPE_WEBHOOK_SECRET` | 136, 3312 |
| Fail if misconfigured | 500 before verify | 3300–3302 |
| Missing signature | 400 | 3304–3307 |
| Verify before state change | `constructEvent` then dedupe/switch | 3309–3316 → 3318+ |
| Failure rejects | catch → 400 `Invalid signature` | 3313–3316 |

**Verdict: audited-clean** (Stripe recommended pattern). Pinned in `securityAuditInvariantPins.test.mjs`.

#### Printful — `src/app/api/printful/webhook/route.ts`

| Check | Result | Lines |
| --- | --- | --- |
| Body HMAC | **No** — shared secret via `?token=` / `x-printful-token` | 20–24, 46–54 |
| Constant-time compare | Yes | 38–43, 53 |
| Empty secret fail-closed | Yes → 401 | 47–48, 376–378 |
| Auth before mutate | `verifyWebhookToken` before `req.json()` | 375–389 |
| Failure rejects | 401 | 376–378, 404–406 |

**Verdict:** auth-before-mutate **audited-clean**; secret-in-URL model → **F-WH-1**.

### Findings — Area 3

#### F-WH-1 — High — Printful webhook authenticates via query-string shared secret, not body signature

- **Seam:** `/api/printful/webhook`
- **Evidence:** `printful/webhook/route.ts:20-24,46-54,375-378`
- **Reachability:** anyone with `PRINTFUL_WEBHOOK_SECRET` (URL logs, Referer, Printful dashboard copy, GET health check) can POST forged shipping/failure/hold events.
- **Remediation:** prefer provider signed-body webhooks if available; otherwise header-only secret, rotate, never log full webhook URL; keep fail-closed compare.
- **Payments fence:** findings-only — no code change in this PR.

#### F-INJ-1 — Medium — Tracking URL from webhook/admin embedded in email `href` without scheme allowlist

- **Seam:** Printful `tracking_url` → shipping email button
- **Evidence:** ingest `printful/webhook/route.ts:101-105`; admin `print/orders/notify-shipping/route.ts:75-78`; render `lib/shippingNotificationEmail.ts` / `transactionalEmailLayout.ts` (`escapeHtml` only)
- **Reachability:** requires Printful secret (**F-WH-1**) or admin token
- **Remediation:** allowlist `https:` (+ optional carrier hosts); else drop provider URL
- **Fence:** findings-only on webhook/notify path

#### F-INJ-2 — Medium — Print asset GET is a public UUID capability URL with CDN-friendly cache headers

- **Seam:** `GET /api/print/assets?id=`
- **Evidence:** `print/assets/route.ts:113-145` (`Cache-Control: public, max-age=3600, s-maxage=86400…`); UUID gate `printAssets.ts:15-16`
- **Reachability:** knowledge of `assetId` (needed for Printful art pull)
- **Remediation:** short-lived signed URLs; tighten cache to `private`/`no-store` if CDN cache not required

#### F-INJ-3 — Medium — Absolute links / redirects derived from request URL Host

- **Seam:** magic/recover/entitlement/promo email + redirect origins
- **Evidence:** e.g. `account/magic/request/route.ts:117-119`; `entitlements/link/route.ts:51-55`; promo `promotions/subscribe/route.ts` uses `new URL(..., req.url)` with enum-gated paths (not open redirect)
- **Reachability:** only if edge honors hostile Host / forwarded host
- **Remediation:** build absolute links from `NEXT_PUBLIC_SITE_URL` allowlist

#### F-INJ-4 — Low — Funnel dashboard token accepted via query string

- **Seam:** `GET /api/analytics/funnel?token=`
- **Evidence:** `analytics/funnel/route.ts:17-22`; compare via `funnelDashboardAccess.ts`
- **Remediation:** header-only token

#### F-INJ-5 — Low — Latent path join in unused `getShapeData`

- **Evidence:** `lib/shapeUtils.ts:48-54` — `${shape}.svg` without allowlist; no current API consumer found
- **Remediation:** allowlist + resolve/prefix-check before any reuse

### Audited-clean — Area 3 (method)

| Item | Method |
| --- | --- |
| Stripe raw-body HMAC verify-first | Line walk `webhook/route.ts:3299-3316` + behavioural pin |
| Printful auth-before-mutate | Line walk `375-389` + behavioural pin |
| No open redirect via promo `redirect=` | Enum `"1"`/`"editor"` only |
| Geocode SSRF | Fixed Nominatim base; query only in `encodeURIComponent` (`geocode/route.ts`) |
| SQL / D1 | Parameterized binds in DO SQL; no string-concat SQL in API routes |
| KV/R2 key injection | UUID / normalized referral code / server-built R2 keys |
| XSS in transactional email / opt-out | `escapeHtml` on customer fields; opt-out GET confirm-only |
| No `eval`/shell sinks in API | Grep clean under `src/app/api` |

**Gift certificate `session_id` disclosure:** intentional under accepted bearer design — listed as audited-clean fidelity, not a finding.

---

## Area 4 — Dependency audit

Command: `npm audit` in `star-map-app-final/` (lockfile as of start head).  
**No upgrades applied in this PR.**

| Package | Severity | Current | Fixed (advisory / audit hint) | Reachability | Notes |
| --- | --- | --- | --- | --- | --- |
| `@babel/core` | low | 7.29.0 | ≥7.29.13 (advisory range `<=7.29.0`) | **dev-only** (via eslint-plugin-react-hooks) | Arbitrary file read via sourceMappingURL — tooling |
| `@humanfs/node` | moderate | 0.16.7 | ≥0.16.8 | **dev-only** (eslint) | Symlink copy follow |
| `ajv` | moderate | 6.12.6 (also 8.20.0 present) | ≥6.14.0 for v6 line | **dev-only** (eslint) | ReDoS with `$data` |
| `minimatch` | moderate | 9.0.9 / 10.2.6 / 3.1.5 | ≥11.0.1 for affected major lines | **dev-only** (eslint / opennext tooling) | DoS via globparts |
| `glob` | moderate | 10.5.0 / 13.0.6 | audit points at major opennext downgrade | **dev-only** (`@opennextjs/cloudflare` build) | AbortSignal bypass |
| `@node-minify/core` | moderate | 9.0.2 | via opennext chain | **dev-only** | via `glob` |
| `@opennextjs/aws` | moderate | 4.1.14 | audit suggests cloudflare `0.3.0` (major **downgrade** — not actionable as stated) | **dev-only** | transitive |
| `@opennextjs/cloudflare` | moderate | 1.20.15 (direct dev) | same non-actionable force hint | **dev-only** | deploy tooling |
| `eslint-config-next` | moderate | 16.4.1 (direct dev) | audit suggests 15.5.29 (downgrade) | **dev-only** | via typescript-eslint |
| `typescript-eslint` + `@typescript-eslint/*` | moderate | 8.72.1 | via eslint-config-next bump path | **dev-only** | lint toolchain |
| `@opentelemetry/core` | moderate | 2.7.1 | ≥2.8.0 | **server-only** (via `@sentry/node` ← `@sentry/cloudflare`) | baggage memory; needs Sentry upgrade path |
| `@opentelemetry/resources` | moderate | 2.7.1 | via core fix | **server-only** | transitive |
| `@opentelemetry/sdk-trace-base` | moderate | 2.7.1 | via core fix | **server-only** | transitive |
| `fflate` | moderate | 0.4.8 | ≥0.4.9 / 0.8.x | **client bundle** (via `posthog-js`) | `unzipSync` infinite loop on malformed ZIP64 |
| `qs` | moderate (also low GHSA) | 6.14.1 | ≥6.16.1 / latest 6.17.1 | **server-only** (via `stripe` SDK; also express under opennext aws) | arrayLimit / stringify DoS classes |

**Reachability summary:** most advisories are **dev-only**. Production-relevant: `fflate` (client via PostHog), `qs` (Stripe server SDK), OpenTelemetry (Sentry server). None are critical. Force-fix hints that downgrade `@opennextjs/cloudflare` / `eslint-config-next` are **not** recommended blindly.

### Findings — Area 4

#### F-DEP-1 — Medium — `fflate@0.4.8` reachable through client `posthog-js`

- Exact current → fixed: **0.4.8 → ≥0.4.9** (latest line 0.8.3 available upstream)
- Reachability: **client bundle**
- Remediation: upgrade `posthog-js` once a release pulls fixed `fflate`; do not apply here

#### F-DEP-2 — Low/Medium — `qs@6.14.1` via Stripe server SDK

- Current → fixed: **6.14.1 → ≥6.16.1**
- Reachability: **server-only** (Stripe dependency); exploitability depends on qs parse/stringify of attacker-controlled structures in SDK paths
- Remediation: upgrade `stripe` when a release bumps `qs`; findings-only here

#### F-DEP-3 — Low — OpenTelemetry 2.7.1 via Sentry server stack

- Current → fixed: **2.7.1 → ≥2.8.0** for `@opentelemetry/core`
- Reachability: **server-only**
- Remediation: Sentry/OTel upgrade in a dedicated PR

Dev-only advisories are **not** inflated into separate severity findings; they remain classified in the table above.

---

## Area 5 — Secrets hygiene

**Method:** pattern grep across source, configs, scripts, fixtures, docs, `.env.example`; filename scan; light `git log -S` for `BEGIN PRIVATE KEY` / `AKIA` / `sk_live_`.  
**Reporting rule:** file + line + class only — **no secret values or substrings**.

### Result

| Class | Result |
| --- | --- |
| Possible live credential in tracked tree | **None found** |
| Committed `.env` / `.pem` / service-account JSON | **None** (gitignore covers; only `.env.example` tracked) |
| Connection strings / AWS AKIA / JWT `eyJ` | **None** |

### Hit classification (value-free; representative)

| File | Line(s) | Class |
| --- | --- | --- |
| `star-map-app-final/.env.example` | 2, 3, 4, 15, 20, 95, 101, 103, 156, 161 | Documented placeholders |
| `playwright.config.ts` | 36–37 | Playwright dummy Stripe/webhook fixtures |
| `scripts/unit/*` (moneyPath*, print*, promotion*, productContribution, merchantFreeListingDiagnose, …) | various | Unit fixtures / intentional leak-redaction probes |
| `scripts/ensure-stripe-*-price.mjs` | ~68 | Mode detection via prefix checks (not a stored secret) |
| `wrangler.toml` | account/KV/price/public marketing IDs | Non-secret config IDs; secret vars absent from `[vars]` |

**No critical secrets-hygiene finding.** Fixtures and placeholders distinguished from live credentials.

---

## Area 6 — Security headers / CSP

### Emission from source (`main`)

| Header | Emitted? | Evidence |
| --- | --- | --- |
| Content-Security-Policy | **Missing** | No CSP in middleware/config/layout |
| Strict-Transport-Security | **Missing** | Absent on `main` (`next.config.mjs` has redirects only; no `headers()`) |
| X-Content-Type-Options | **Missing** | — |
| X-Frame-Options / `frame-ancestors` | **Missing** | — |
| Referrer-Policy | **Missing** | — |
| Permissions-Policy | **Missing** | — |
| CORS wildcard | **Missing** | Aligns with prior docs |

`src/middleware.ts` / root middleware: **absent** on `main`.  
`cloudflare-worker.ts`: OpenNext `fetch` passthrough — no header injection.  
`layout.tsx` uses `dangerouslySetInnerHTML` for Android bootstrap + JSON-LD (`layout.tsx` ~280, ~391) — any future CSP would need nonces/hashes or would become decorative via `unsafe-inline`.

**Note:** historical harden commit `620dcd09` (not ancestor of current `main`) added several headers but **never CSP**. Edge/Cloudflare dashboard transforms are outside source evidence.

### Cookie flags (server)

Auth/attribution cookies set HttpOnly + SameSite=Lax; Secure in production (attribution cookies force Secure). See Area 1 table. Pinned for claim/logout paths.

### Findings — Area 6

#### F-HDR-1 — Medium — No CSP / HSTS / XCTO / frame / referrer / permissions headers in deployable source

- **Seam:** global HTTP responses
- **Evidence:** `next.config.mjs` (no `headers()`); no middleware; worker passthrough
- **Reachability:** all browsers hitting the Worker/Pages responses as deployed from this repo
- **Remediation:** land a headers block (prefer `next.config.mjs` `headers()` or Cloudflare Transform Rules documented in-repo); add CSP with nonces for the two inline scripts; confirm edge HSTS separately
- **Overlap:** `#616` edits `src/app/layout.tsx` — prefer config/edge headers over layout edits to avoid collision

#### F-HDR-2 — Low — Auth cookie `Secure` gated on `NODE_ENV===production` only

- **Evidence:** claim/verify/logout/magic claim cookie setters
- **Remediation:** align with a production-like runtime helper (preview/staging) if those ever run with non-production `NODE_ENV`

### Audited-clean — Area 6 (method)

| Item | Method |
| --- | --- |
| Auth cookies HttpOnly + SameSite=Lax | Read Set-Cookie call sites; pin matches claim/logout source |
| No CORS `*` in `src/` | Grep |

---

## Test pins added

File: `star-map-app-final/scripts/unit/securityAuditInvariantPins.test.mjs`  
**All pins pass on untouched production code** (behaviour unchanged).

| Pin | Invariant |
| --- | --- |
| adminAuth empty/mismatch | Fail-closed; match only on equal tokens |
| adminAuth header order | `x-print-admin-token` wins over Bearer |
| Stripe source order | `req.text()` → `constructEvent` before dedupe/handlers |
| Printful source order | `verifyWebhookToken` before `req.json()` / handlers |
| Cookie flags | claim/logout keep HttpOnly + SameSite=Lax |
| Printful GET 401/200 | Missing/wrong token → 401; correct → 200 |
| Stripe missing/invalid sig | → 400 `Missing`/`Invalid signature` before side effects |

---

## Production code changes

**None.**  
Explicit statement: **no payments, Stripe/Printful payload, idempotency, entitlement-transition, or price code was changed** — those areas were findings-only. Editor ANCHOR / `textAlign` semantics were not reinterpreted. Copy is byte-identical aside from this new audit doc.

---

## Closing summary

### Counts by severity

| Severity | Findings |
| --- | --- |
| Critical | **0** |
| High | **1** — F-WH-1 (Printful query-string webhook secret) |
| Medium | **8** — F-AUTH-1, F-DO-1, F-DO-2, F-INJ-1, F-INJ-2, F-INJ-3, F-DEP-1, F-HDR-1 |
| Low | **4** — F-INJ-4, F-INJ-5, F-DEP-2/3 (grouped), F-HDR-2 |

### Top findings (priority order)

1. **F-WH-1** — Printful webhook secret-in-URL (high)
2. **F-DO-2** — Shared admin token for upcoming full DO exports (**#608/#609/#610**)
3. **F-AUTH-1** — Logout without server session revoke
4. **F-HDR-1** — Missing security headers/CSP in source
5. **F-INJ-1** — Unallowlisted tracking URLs in email hrefs
6. **F-INJ-2** — Public cached print-asset capability URLs
7. **F-DO-1** — No in-DO auth (defence-in-depth)
8. **F-DEP-1** — Client `fflate` via PostHog

### Human decisions required (single list)

1. Accept / schedule Printful webhook auth hardening (F-WH-1) — payments-adjacent, owner-approved change later.
2. Before merging backup export slices **#608/#609/#610**, decide on scoped export credentials + PII redaction (F-DO-2).
3. Fix magic logout revocation (F-AUTH-1) in a small dedicated PR.
4. Decide where to emit security headers (Next config vs Cloudflare) and CSP nonce strategy (F-HDR-1); avoid colliding with **#616** layout work.
5. Tracking-URL allowlist in shipping emails (F-INJ-1).
6. Print-asset signed URL / cache policy (F-INJ-2).
7. Host allowlist for absolute email links (F-INJ-3).
8. Dependency upgrade PR(s) for PostHog/`fflate`, Stripe/`qs`, Sentry/OTel — **not** this audit PR.
9. Whether to add in-DO instance-key assertions (F-DO-1) vs keep binding-only trust.

### Fence attestations

- Draft PR only; never marked ready; not merged; not deployed.
- No price changes; copy byte-identical (except new audit markdown).
- Nothing sent; no production system probed; source + local tests only.
- No secret values or substrings reproduced anywhere in this report, pins, or commits.
