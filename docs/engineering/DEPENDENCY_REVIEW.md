# Dependency review

**Snapshot:** `star-map-app-final/package.json` (Next 16.1.6, React 19.2, Stripe 16.x, Zustand 5, astronomy-engine, tz-lookup, posthog-js, date-fns). Dev: OpenNext Cloudflare, Playwright, ESLint 9, Tailwind 4, TypeScript 5, Wrangler 4.x, patch-package.

## Philosophy (aligned with repo)

- **Few runtime dependencies** — good; most complexity is first-party.
- **Overrides:** `preact`, `qs` versions pinned—document **why** in a one-line comment in `package.json` or here when known (often transitive security or duplicate bundling).

## Upgrade stance

- **Next / OpenNext / Wrangler** should move together with release notes read—deployment coupling.
- **Stripe SDK:** align `apiVersion` in code with account default when bumping major versions.
- **astronomy-engine:** treat as **sensitive**—run visual/regression tests on star positions after bumps.

## Audit cadence

1. Monthly: `npm audit` in `star-map-app-final` (or rely on Dependabot if enabled).
2. After audit: paste **summary + decisions** below (no raw vulnerability spam if huge—link to ticket).

## Audit log

| Date | Command | Result | Actions |
| --- | --- | --- | --- |
| 2026-05-14 | — | Not run in this documentation pass | Run `npm audit` and record |

## Mobile app

- Separate `mobile-app/package.json` (Expo SDK 54)—review on its own cadence; native modules add supply-chain surface.
