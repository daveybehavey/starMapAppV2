# Performance budgets (guidance)

These are **targets for manual / periodic checks**, not enforced in CI (avoids brittle gates across machines). Prefer measuring **production** (RUM or Lighthouse on deployed URL) over localhost.

## Core Web Vitals (mobile-first)

- **LCP:** aim **under 2.5 s** on homepage and key landing URLs at p75.
- **INP:** aim **under 200 ms** on `/` and `/editor` at p75.
- **CLS:** aim **under 0.1** on marketing pages.

## Editor / app shell

- First interaction on **`/editor`** (open paywall, change date): avoid long main-thread blocks; if INP regresses, profile React renders and worker handoff.
- Map preview: defer non-critical third-party scripts; keep consent gating strict (`analytics.ts`).

## JavaScript bundle

- After **`npm run build`**, watch First Load JS for **`/editor`** and **`/`** in the Next build summary. Investigate **large step increases** (roughly 20–30+ kB gzip) from new dependencies.

## Images

- Hero and marketing images: prefer modern formats and explicit **`width`/`height`** or constrained layout to protect CLS.
- Proof / merch images: avoid uncapped resolution on homepage cards.

## How to check

- **Chrome DevTools → Lighthouse** (mobile) against **production** or a preview URL.
- **Vercel Speed Insights / Cloudflare Web Analytics** (if enabled) for field data.
- Compare before/after on the **same device profile** when validating a PR that touches layout or scripts.
