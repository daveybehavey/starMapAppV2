# Architecture analysis

## High-level pattern

**Next.js App Router** full-stack app: React Server Components + client islands for the editor, **Route Handlers** for APIs. No separate BFF service—the Worker **is** the backend for browser and mobile.

**State:** Global editor state is **Zustand** (`src/lib/store.ts`). Additional UI/session logic lives in large client components and hooks (`useEditorLogic`, `EditorExperience`).

**Persistence:** **Cloudflare KV** is the system of record for sessions, entitlements, referrals, print jobs, funnel telemetry keys, etc. `kv.ts` abstracts real KV vs dev fallbacks.

## Feature boundaries (observed)

| Boundary | Location | Notes |
| --- | --- | --- |
| Editor / render | `src/lib/renderSky.ts`, `PreviewCanvas`, `store.ts` | Core product correctness. |
| Pricing / checkout | `src/lib/pricing.ts`, `src/app/api/checkout`, Stripe routes | Money path; high regression cost. |
| Account (web magic + lite) | `src/lib/accountLite*.ts`, `src/app/api/account/*` | Shared cores emerging (e.g. magic vs mobile request). |
| Mobile auth | `src/app/api/account/mobile/*`, `src/lib/googleMobileAuth.ts` | Parallel to web magic link; must stay consistent. |
| Print | `src/lib/printful.ts`, `printOrders`, `api/print/*`, Printful webhook | Async provider + margin guards. |
| Analytics | PostHog + GA; convention in `src/lib/analyticsEventConvention.ts` | Funnel integrity. |

## Coupling and fragility

1. **Large client surfaces:** `EditorExperience` spans thousands of lines—high coupling between layout, paywall, canvas lifecycle, and checkout UX. **Risk:** regressions on unrelated edits; hard onboarding.
2. **Webhook orchestration:** `stripe/webhook/route.ts` coordinates referrals, print submission, account recovery emails, funnel events—**correct but dense**. **Risk:** ordering and idempotency bugs are expensive.
3. **KV as universal store:** Simple operationally; **tradeoff:** limited query patterns, eventual consistency semantics, key design is critical. Hidden complexity in **key naming and TTL** scattered across `lib/`.
4. **Dual tree at repo root:** Legacy `pages/` / static HTML vs `star-map-app-final`—mental overhead for contributors and tooling (mitigated in `next.config.mjs`).

## Over- vs under-engineered

- **Over:** Some QA scripts and matrices are extensive (intentional for commerce safety—not “bad,” but onboarding cost).
- **Under (relative):** Modular tests around the largest React components are thin compared to E2E surface—acceptable if Playwright stays green, costly if CI slows or flakes.

## Conventions (infer from code)

- TypeScript throughout; path alias `@/`.
- **`export const runtime = "nodejs"`** on routes that need Node APIs (e.g. Stripe webhook).
- Structured logging for sensitive paths (e.g. `scope: "stripe_webhook"` JSON lines).
- Env flags parsed with explicit regex / parsing helpers in hot paths (defensive).

## Uncertainty (explicit)

- Full **dependency vulnerability posture** not re-scanned in this doc cycle—run `npm audit` in CI or locally and paste summary into **DEPENDENCY_REVIEW.md** when refreshed.
- **Exact** Cloudflare limits (KV ops, CPU per request) vs peak traffic—operational, verify in dashboards.
