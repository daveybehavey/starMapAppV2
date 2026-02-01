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

- **Framework**: Next.js 14 (App Router)
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

- Node.js 18+
- npm/pnpm/yarn

### Environment Variables

Create a `.dev.vars` file for local development:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cloudflare KV (for local dev, uses in-memory fallback)
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
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
