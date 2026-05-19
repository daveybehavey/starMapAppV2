# Refactor plan

Guiding rule: **no big-bang rewrites** on auth, payments, or webhooks without staged extraction + tests.

## Phase 0 — Stabilize instrumentation (ongoing)

- Keep structured logs on Stripe webhook and print submission paths.
- Ensure new mobile routes log with a distinct `scope` for grep-friendly ops.

## Phase 1 — Editor modularization (medium term)

**Goal:** Smaller files, same UX.

1. Inventory `EditorExperience` sections (layout regions, dialogs, paywall).
2. Extract **presentational** components with props only (no new global state).
3. Add Playwright assertions for **one happy path** per extracted region if coverage gap.

**Exit criteria:** No behavior change; bundle size neutral ± small; CI green.

## Phase 2 — Webhook decomposition (medium term)

**Goal:** Testable units.

1. Identify pure functions inside `stripe/webhook/route.ts` (amount parsing, metadata extraction).
2. Move to `src/lib/stripeWebhook/*` with unit tests.
3. Leave orchestration + KV writes in route.

**Exit criteria:** Same webhook behavior; increased unit test count; smaller route file.

## Phase 3 — KV documentation + optional registry (short term)

**Goal:** Operational clarity.

1. Document key prefixes in `SYSTEM_MAP.md` appendix or `src/lib/kvKeys.ts`.
2. Align TTL decisions with product (recovery links, print assets).

## Phase 4 — Legacy root cleanup (conditional)

**Precondition:** Confirm no deploy or DNS still depends on root `public/` HTML.

**Action:** Move to `legacy/` or delete; update any internal links.

## Explicit non-plans

- Migrating off KV to SQL **unless** product needs relational queries or strong transactions—would be a product/architecture decision, not a refactor chore.
- Replacing Zustand with another client store—low ROI unless a concrete pain appears.
