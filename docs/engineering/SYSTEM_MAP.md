# System map

## Deployed unit

```
Browser / Mobile
       │
       ▼
Cloudflare Worker (OpenNext) ──► Static assets (ASSETS)
       │
       ├──► Stripe API (checkout + webhooks)
       ├──► Printful API + inbound webhook
       ├──► Resend (transactional email)
       ├──► PostHog / GA (client analytics)
       └──► Cloudflare KV (STAR_MAP_KV binding)
            Prefix overview: `star-map-app-final/src/lib/kvKeyPrefixes.ts`
```

## Next.js app (`star-map-app-final/src/app`)

- **Marketing / SEO:** many `page.tsx` routes (blog, gift ideas, locales, etc.).
- **Editor:** primary interactive experience under routes that mount `EditorExperience` / `SimplifiedEditor` (exact route list: search `EditorExperience` imports in `app/`).
- **Download / account:** `/my-downloads`, `/download`, recovery flows (verify in `app/` tree).

## API surface (`src/app/api`) — inventory

**Account & access**

- `account/magic/request`, `account/magic/claim`, `account/magic/logout`
- `account/mobile/request`, `claim`, `state`, `logout`, `google`, `revenuecat/link`
- `account/access-email`, `recover`, `sessions`, `my-sessions`

**Commerce**

- `checkout`, `stripe`, `stripe/webhook`, `stripe/verify`, `stripe/portal`
- `entitlements/claim`, `entitlements/consume`, `entitlements/link`
- `premium`

**Print**

- `print/assets`, `print/assets/[assetId]`, `print/orders/*` (status, resolve, retry, notify-shipping)
- `printful/webhook`

**Growth / ops**

- `referrals/*`, `promotions/*`, `analytics/*`, `bulk-quotes`
- `ops/*` (internal tooling, e.g. download resend, search console)
- `revenuecat/webhook` (mobile subscription server events)
- `geocode`, `maps`, `download/archive`

> **Count:** ~45 `route.ts` files under `api/` (grep-maintained).

## Mobile app (`mobile-app`)

- Calls **`EXPO_PUBLIC_API_BASE_URL`** … `/account/mobile/*` and server RevenueCat webhook (see `mobile-app/README.md`).
- Native modules (Google Sign-In, Purchases) require **dev builds**, not Expo Go alone.

## Local development fallbacks

- `src/lib/kv.ts`: memory store + optional `.tmp/kv-store` files when Worker KV unavailable—**must not** be mistaken for production isolation or backup strategy.
