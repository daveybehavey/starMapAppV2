# Project overview

## Intent

**StarMapCo** sells personalized star maps: users pick date, time, and place; the app renders an astronomically grounded map (styles, shapes, text), offers **digital checkout** (Stripe), optional **print/fulfillment** (Printful + Stripe), referrals, promotions, and account recovery (magic link / “lite” sessions in KV).

## Repository shape

| Path | Role |
| --- | --- |
| `star-map-app-final/` | **Canonical** Next.js application: marketing pages, editor, checkout, ~45 App Router API routes, scripts, Playwright tests, Cloudflare deploy config. |
| `mobile-app/` | Expo / React Native client; **same backend** (`/api/account/mobile/*`, RevenueCat linkage, Google ID token). Business logic stays server-side. |
| Repo root `pages/`, `src/pages/`, `public/*.html` | **Legacy / static** artifacts; not the deploy target. `next.config.mjs` explicitly pins Turbopack `root` to `star-map-app-final` to avoid cross-root `pages/` confusion. |
| `company-os/` (gitignored) | Local automation / roadmap tooling—not shipped. |

## Runtime / deployment

- **Production:** OpenNext Cloudflare adapter (`wrangler.toml`, worker + assets).
- **Primary datastore:** Cloudflare **KV** via `src/lib/kv.ts` (with in-memory + optional filesystem fallback for local/dev). **Prefix registry (non-authoritative doc):** `src/lib/kvKeyPrefixes.ts`.
- **Payments:** Stripe (checkout session creation + webhook-driven entitlements and print pipeline).
- **Print:** Printful API + webhook; feature flags and margin guards in env.

## Environment model

- **`.env.example`** in `star-map-app-final` documents variables (no secrets).
- **Production** mixes `wrangler.toml` `[vars]` (non-secret public config) with **Wrangler / dashboard secrets** for keys (`STRIPE_*`, webhooks, etc.). Treat any committed file as **public** unless proven otherwise.

## Testing / quality gates

- **CI** (`.github/workflows/ci.yml`): `npm ci` → `lint` → `build` on PR/push to `main`.
- **Additional workflows:** e.g. sitemap health (`sitemap-health.yml`).
- **Rich local QA:** `package.json` scripts (`qa:smoke*`, `qa:live-critical`, print/merchant scripts). See `docs/OPS_RUNBOOK.md` in the app tree.

## Documentation split

- **User-facing / ops:** `star-map-app-final/docs/*` (runbook, merchant, SEO).
- **Cross-repo engineering meta:** this `docs/engineering/` folder.
