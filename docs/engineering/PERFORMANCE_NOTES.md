# Performance notes

## Documented budgets

- **`star-map-app-final/docs/PERF_BUDGETS.md`** (referenced from OPS runbook)—treat as authoritative targets.

## Known sensitive surfaces (from architecture)

1. **Editor canvas / preview** — client-side rendering of star field; fidelity toggles (`previewFidelity`) suggest intentional cost tradeoffs. Watch for unnecessary full re-renders when Zustand updates unrelated slices (selector usage in hot paths).
2. **Large JS bundles** — editor + marketing site share app shell; use Next bundle analyzer only when investigating (sparingly—dependency policy).
3. **OpenNext / Worker CPU** — long synchronous work in route handlers reduces effective concurrency; keep heavy work streaming or chunked where possible (export flows—verify separately).

## Caching

- Next **incremental cache** prefix configured in Wrangler vars (`NEXT_INC_CACHE_R2_PREFIX`)—performance tied to Cloudflare cache behavior; document invalidation expectations when changing route segment config.

## Hydration

- Editor likely client-heavy; watch for `useEffect`-only state that mismatches SSR HTML in future refactors.

## Action items

- When touching performance: measure (Web Vitals, RUM, or lab Lighthouse) and record **before/after** in this file for posterity.
