# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

The only runnable application is the **StarMapCo** Next.js 16 app in `star-map-app-final/`
(personalized star map / constellation generator e-commerce site). Everything at the repo
root (`src/`, `pages/`, `routes/`, `blog/`, `content/`, `views/`, `templates/`, loose
`*.html`) is legacy/SEO/static scaffolding with no build target — do not try to run it.
`company-os/` is a gitignored automation workspace and has no `package.json` in this
checkout, so it is not runnable here.

All commands below run from `star-map-app-final/`. Package manager is **npm**
(`package-lock.json`). Scripts are defined in `star-map-app-final/package.json`; refer to it
rather than memorizing commands. Common ones: `npm run dev` (Next dev server on
`http://localhost:3000`), `npm run lint`, `npm run typecheck`, `npm run build`,
`npm run test:unit`.

### Node version gotcha (important, non-obvious)

The VM's default `node` is `/exec-daemon/node` (currently **v22.14.0**) and it is pinned
first in `PATH`. `nvm use` / `nvm exec` do **not** override it. `npm ci`, `npm run dev`,
`lint`, `typecheck`, and `build` all work fine on this default node.

However, `npm run test:unit` (and therefore `npm run ci:pr`) imports `.ts` files directly via
Node's TypeScript type-stripping, which requires **Node ≥ 22.18**. On the default 22.14 two
unit tests fail with `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`. CI uses Node 22 (latest), where
they pass. To run the unit tests locally, prepend an nvm-managed Node 22 to `PATH`:

```
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm install 22 >/dev/null 2>&1
PATH="$(nvm which 22 | xargs dirname):$PATH" npm run test:unit
```

### Local env

Create `star-map-app-final/.env.local` (gitignored) for local dev. The editor, storefront
pages, and `npm run build` work with placeholder Stripe **test** values (e.g.
`STRIPE_SECRET_KEY=sk_test_placeholder`); real Stripe test keys are only needed to exercise
the live checkout/payment flow. `npm run check:env` validates required vars. Print checkout is
off by default (`PRINT_CHECKOUT_ENABLED=false`) and needs no external services for the core
digital flow. No local database is required (persistence uses Cloudflare bindings, which
`next dev` does not need for the core editor/storefront).

### Hello-world / core flow

Core feature: `/editor` — enter a location (autocomplete), date, and title, click
"Generate preview", and a circular night-sky star map renders. This runs client-side and
needs no secrets.
