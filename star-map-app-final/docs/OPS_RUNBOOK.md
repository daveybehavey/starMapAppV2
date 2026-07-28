# StarMapCo operations runbook

Concise reference for incidents, deploys, and money-path monitoring. **Do not paste secrets into chat or tickets.**

## Canonical workspace

- Prefer **`C:\Users\david\dev\starMapAppV2`** (or a full Desktop clone), not a partial OneDrive copy. App commands run from **`star-map-app-final`**.
- If **`star-map-app-final/scripts`** is empty, the tree is incomplete—reclone or sync before running QA.

## Deploy and rollback

- **Happy path:** `npm ci` then **`npm run deploy:verify`** (preflight guard + OpenNext deploy + **`npm run qa:live-critical`**).
- **Windows / parallel IDE builds:** Local Windows deploy is **blocked by default** (`scripts/deploy-guard.mjs`) because OpenNext is slow and competing `next build` / Codex sessions in other repos cause multi-hour builds and `ECONNRESET` during compile. Use **`npm run deploy:wsl`** or **`npm run deploy:remote`** instead. Override only with `DEPLOY_ALLOW_WINDOWS=1` after pausing other builds.
- **Remote deploy (recommended on Windows):** GitHub Actions **`deploy-production.yml`** (`workflow_dispatch`). One-time: add repo secret **`CLOUDFLARE_API_TOKEN`** (Workers Scripts Edit). Then `npm run deploy:remote` or Actions → Deploy production → Run workflow.
- **OAuth / token hygiene:** `npm run deploy:safe` when Wrangler must use OAuth and local env must not leak tokens.
- **Rollback after a bad deploy:** `npx wrangler deployments list` then `npx wrangler rollback <previous-version-id> -y`.
- **Windows manual fallback:** `node scripts/opennext-cloudflare.mjs deploy` merges `wrangler.toml` vars into the OpenNext build, then runs `opennextjs-cloudflare deploy`. On failure (common: empty CLI error, WASM path, R2 cache 403), the script **automatically falls back** to `OPEN_NEXT_DEPLOY=true npx wrangler deploy` after a successful build. Requires **wrangler >= 4.94** in `package.json`. Manual sequence:

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
node scripts/opennext-cloudflare.mjs build
$env:OPEN_NEXT_DEPLOY = "true"
npx wrangler deploy
npm run qa:live-critical
```

Prefer WSL for production releases when possible (`docs/TIER0_VALIDATION.md`).

## Quick verification (local / CI)

| Command | Purpose |
| --- | --- |
| `npm run qa:live-canary` | Same as **`scripts/live-smoke.mjs`** against production (money path, APIs, sitemap). |
| `npm run qa:smoke:commerce` | Playwright: checkout security + API regressions. |
| `npm run qa:smoke` | Full Playwright smoke (UI + export + commerce + premium render). |
| `npm run qa:funnel-post-release` | Funnel reconcile (14 days); run after releases or checkout changes. |

GitHub Actions: **CI** (PR) runs lint + build + commerce smoke; **Nightly E2E** runs full smoke; **Live canary** runs `live-smoke.mjs` on a schedule.

## Feature flags and kill switches

- Document env-driven toggles in **`wrangler.toml`** / dashboard (e.g. print submission, shop tab, bulk orders). In an incident, prefer **rollback** first, then disable risky flags if rollback is not enough.
- Stripe: missing or invalid webhook secret → verify signature failures; check **`stripe_webhook`**-scoped logs (see below).

## What to monitor (alerts / logs)

- **Stripe webhook:** structured lines with `"scope":"stripe_webhook"` (event type + id on success path; warnings/errors prefixed the same). Alert on spikes of **signature verification failures** or **5xx** on `/api/stripe/webhook`.
- **Print / Printful:** submission failures, retry queue growth; use **`npm run qa:print-ops`** and provider dashboards.
- **Checkout:** drop in successful **`checkout.session.completed`** vs traffic; **`npm run qa:checkout-ratio-sanity`** / **`qa:funnel-reconcile`** for sanity.

## Post-purchase and email

- Customer-facing contact: **support@starmapco.com** (see paywall and legal pages). Ensure transactional/provider emails match live product copy after pricing or fulfillment changes.
- Magic links / downloads: see **`/api/account/*`** and download flows; test **`/my-downloads`** after auth changes.
- **Checkout recovery email (`checkout.session.expired`):** Resend is the preferred path and uses a deterministic opaque `Idempotency-Key`. A long-lived **delivered marker** is written only after provider success; retryable provider failures return **503** so Stripe can redeliver. Session fields use sanitized `recoveryEmailErrorCode` / `recoveryEmailRetryability` only (no raw provider bodies). **SendGrid** remains a fallback without provider idempotency — concurrent duplicate protection there is best-effort under Workers KV (`SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE`). Diagnostic-only: `scripts/recovery-email-diag.mjs` (no resend execution path).

## Performance

- Targets and how to check them: **`docs/PERF_BUDGETS.md`**.

## Analytics and experiments

- Event naming: **`src/lib/analyticsEventConvention.ts`**. Avoid ad-hoc PostHog event strings; extend the convention file when adding funnels.

## Merch / print catalog

- **`src/lib/printCatalog.ts`** is the source of truth for print SKUs at Stripe checkout. Changing SKUs requires env vars in Wrangler and margin verification before promoting traffic.

## SEO / sitemap

- **`src/app/sitemap.ts`** builds the sitemap from blog posts, SEO data, and flags. After adding routes or blog content, run **`npm run qa:sitemap-health`** / release-gate live checks as appropriate.

## WSL Playwright (local E2E)

If **`qa:smoke:*`** fails with **`libnspr4.so: cannot open shared object file`** (or Chromium exits 127), install browser OS deps once in WSL:

```bash
cd star-map-app-final
npx playwright install chromium
sudo npx playwright install-deps chromium
```

Prefer **`~/starmap-deploy-git`** or **`/mnt/c/Users/david/dev/starMapAppV2`** for full trees; partial OneDrive clones often break **`npm ci`**.

## Known dev noise

- When Playwright starts **`next dev`**, Node may log **`MaxListenersExceededWarning`** from the dev server. It is usually benign for CI/local smoke; investigate if it correlates with real leaks or hangs.

## Dependency / security audits

- Run **`npm audit`** periodically. **`npm audit fix`** may fail with **peer dependency** conflicts (e.g. Next vs OpenNext); do not use **`--force`** without review—prefer targeted upgrades or documented accepts.
