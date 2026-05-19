# Engineering documentation (living)

This folder holds **principal-engineer** artifacts for the **StarMapAppV2** monorepo: product intent, architecture, audit trail, and prioritized change plans.

## How to use

1. Start with **PROJECT_OVERVIEW.md** and **SYSTEM_MAP.md**.
2. Use **AUDIT_REPORT.md**, **TECH_DEBT.md**, and **KNOWN_RISKS.md** for prioritization.
3. **QUICK_WINS.md** and **REFACTOR_PLAN.md** drive incremental execution.
4. After meaningful changes, update the affected doc in the same PR (one or two files is enough).

## Doc index

| Document | Purpose |
| --- | --- |
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | Product scope, repo layout, deployment |
| [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) | Patterns, boundaries, complexity hotspots |
| [SYSTEM_MAP.md](./SYSTEM_MAP.md) | Routes, APIs, data, external services |
| [AUDIT_REPORT.md](./AUDIT_REPORT.md) | Dated findings with severity |
| [QUICK_WINS.md](./QUICK_WINS.md) | Low-risk, high-value tasks |
| [TECH_DEBT.md](./TECH_DEBT.md) | Debt register and compounding areas |
| [SECURITY_NOTES.md](./SECURITY_NOTES.md) | Threat model, auth/pay paths, config hygiene |
| [PERFORMANCE_NOTES.md](./PERFORMANCE_NOTES.md) | Budgets, sensitive surfaces |
| [ACCESSIBILITY_NOTES.md](./ACCESSIBILITY_NOTES.md) | A11y risks and verification |
| [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) | Sequenced refactors with gates |
| [KNOWN_RISKS.md](./KNOWN_RISKS.md) | Operational and product risk |
| [DEPENDENCY_REVIEW.md](./DEPENDENCY_REVIEW.md) | Dependency philosophy and inventory |

## Canonical paths

- **Web app + API:** `star-map-app-final/` (Next.js 16, OpenNext → Cloudflare Worker).
- **Mobile client:** `mobile-app/` (Expo; consumes `star-map-app-final` APIs).
- **Ops runbook (deploy/rollback):** `star-map-app-final/docs/OPS_RUNBOOK.md`.

## Maintenance rule

Prefer **short, truthful updates** over stale essays. If something is unknown, write **“unverified”** and what would confirm it.
