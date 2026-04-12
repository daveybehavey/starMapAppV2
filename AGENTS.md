# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is **StarMapCo** — a custom star map generator e-commerce app. Users design personalized constellation/night-sky maps for specific dates and locations, then purchase digital downloads or physical prints. The app lives in `/workspace/star-map-app-final/`.

### Tech stack

- **Next.js 16** (App Router, Turbopack dev server) with **React 19**, **Zustand**, **Tailwind CSS 4**
- **Stripe** for payments, **Printful** for physical prints, **Cloudflare KV** for storage
- **Node.js 20** (enforced via `.nvmrc` and `engines` field)
- **npm** as the package manager (`package-lock.json`)

### Running the dev server

```bash
cd star-map-app-final && npm run dev
```

Runs on `http://localhost:3000`. The homepage redirects to `/editor`. A `.env.local` with at least placeholder `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` is needed for API routes to not crash, but the editor UI works without real keys.

### Lint / format / test commands

See the scripts table in `star-map-app-final/README.md` for the full list. Key commands:

- `npm run lint` — ESLint (clean pass expected)
- `npm run format:check` — Prettier (the repo currently has 157 files with style drift; this is pre-existing)
- `npm run qa:smoke` — Playwright E2E smoke suite (requires `npx playwright install --with-deps chromium` first)

### Playwright notes

- Playwright config (`playwright.config.ts`) starts its own dev server on port **3004** (separate from the main dev server on 3000).
- When `CI=1` is set, Playwright does NOT reuse an existing server — it starts a fresh one.
- The test `occasion preset preserves manual location context` is flaky due to geocoding race conditions (expects "Toronto" but sometimes gets the default "Paris, France").

### Environment variables

The app has ~135 env vars (see `.env.example`). For local dev, only these are needed in `.env.local`:

```
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
NEXT_PUBLIC_SITE_URL=http://localhost:3000
PRINT_CHECKOUT_ENABLED=false
NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=false
```

Real Stripe test keys are needed only for checkout/payment flow testing.

### No database or Docker required

All persistence uses Cloudflare KV bindings. There is no database server, Docker, or docker-compose. The app is a single Next.js application.
