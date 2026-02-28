# Star Map Generator

A custom star map creation tool that renders accurate constellation maps for meaningful moments.

## Features

- Accurate astronomical positioning using the astronomy-engine library
- Multiple visual styles (Navy & Gold, Vintage Engraving, Parchment Scroll, Midnight Minimal)
- Shape masks (Rectangle, Heart, Circle, Star, Diamond)
- Draggable text elements with customizable fonts
- Premium effects (realistic stars, enhanced planets)
- High-resolution PDF/PNG export
- Mobile-responsive design

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **State Management**: Zustand
- **Styling**: Tailwind CSS 4
- **Deployment**: Cloudflare Pages (via opennextjs-cloudflare)
- **Payments**: Stripe
- **Storage**: Cloudflare KV

## Project Structure

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # React components
  hooks/         # Custom React hooks
  lib/           # Utilities, types, and business logic
```

### Key Files

- `lib/store.ts` - Zustand global state
- `lib/renderSky.ts` - Star map rendering logic
- `lib/api.ts` - Typed API client
- `hooks/useEditorLogic.ts` - Shared editor state and actions
- `components/PreviewCanvas.tsx` - Map preview component
- `components/EditorExperience.tsx` - Main editor UI

## Getting Started

### Prerequisites

- Node.js 20+
- npm/pnpm/yarn

### Environment Variables

Create a `.dev.vars` file for local development:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting |
| `npm run test:ui` | Run Playwright E2E tests |
| `npm run preview` | Build and preview for Cloudflare |
| `npm run deploy` | Deploy to Cloudflare Pages |
| `npm run check:env` | Validate required environment variables |
| `npm run qa:live-smoke` | Run lightweight post-deploy checks on production |
| `npm run qa:sitemap-health` | Validate sitemap URL health |
| `npm run qa:printful` | Validate Printful store and variant IDs |
| `npm run qa:go-no-go` | Validate print launch flags and fulfillment readiness |
| `npm run qa:smoke` | Run core Playwright smoke suite |
| `npm run qa:release-gate` | Run full local release gate checks |
| `npm run qa:release-gate:smoke` | Release gate + Playwright smoke suite |
| `npm run qa:release-gate:live` | Run full release gate including live checks |
| `npm run qa:release-gate:live:smoke` | Full release gate + smoke suite + live checks |

## Deployment

This project deploys to Cloudflare Pages using opennextjs-cloudflare:

```bash
npm run deploy
```

Configure environment variables in the Cloudflare dashboard.

## Architecture Notes

### State Management

- Global state is managed via Zustand (`lib/store.ts`)
- The `useEditorLogic` hook extracts shared editor logic used by both desktop and mobile views
- API calls are centralized in `lib/api.ts` for type-safe, consistent requests

### Rendering Pipeline

1. User inputs (date, location, text) are stored in Zustand
2. `buildRecipeFromState` creates a `MapRecipe` object
3. `renderStarMap` uses astronomy-engine to calculate star positions
4. Canvas rendering with shape masks, effects, and text overlays

### Premium Features

- Premium features are gated by `paid` state
- Entitlements are stored in Cloudflare KV with session-based access
- Supports single purchase, 3-pack, and subscription plans

### Promotion email capture

- `PromotionSignup` and `PromotionEmailPopup` collect email addresses for the 20% off waitlist and POST to `/api/promotions/subscribe`.
- Submissions are deduplicated via `promotions:emails` in Cloudflare KV and rate-limited per IP. Coupon sends are tracked in `promotions:coupon-sent` to avoid duplicate sends.
- The subscribe API returns the configured coupon code and delivery status so UI can show "instant 20% off" feedback.
- Automation provider priority is: `RESEND_API_KEY` + `PROMOTION_EMAIL_FROM` → `SENDGRID_API_KEY` + `PROMOTION_EMAIL_FROM` → `PROMOTION_AUTOMATION_WEBHOOK_URL`.
- One-time Stripe setup: run `npm run promo:setup` to create or reuse the `PROMOTION_COUPON_CODE` promotion in Stripe and write `STRIPE_PROMO_CODE_ID` to `.env.local`.
- Optional referral checkout offer: set `STRIPE_REFERRAL_PROMO_CODE_ID` to auto-apply a Stripe promotion code for referred digital purchases.
- Full setup checklist: `PROMOTION-AUTOMATION-SETUP.md`.

### Print launch checklist

- Before enabling live print checkout, run `npm run check:env` and `npm run qa:printful`.
- Before production deploys, run `npm run qa:release-gate:smoke`.
- Full go/no-go checklist: `docs/print-launch-checklist.md`.
- Current phase/status tracker: `docs/roadmap-status.md`.
