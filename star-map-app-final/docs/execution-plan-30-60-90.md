# StarMapCo 30/60/90 Execution Plan

Updated: 2026-03-31

## Goal

Ship reliably, improve conversion with controlled risk, and grow only on trustworthy metrics.

## Current Health Snapshot (Validated 2026-03-31)

- Local quality gate:
  - `check:env` pass (optional env warnings only)
  - `qa:links` pass
  - `lint` pass
  - `next typegen` pass
  - `tsc --noEmit` pass
  - `build` pass
- Regression:
  - `qa:smoke` pass (`44/44`)
  - targeted Playwright hardening set pass (`20 passed, 1 skipped`)
- Live checks:
  - `qa:live-smoke` pass
  - `qa:content-consistency` pass
  - `qa:sitemap-health` pass
- Funnel reconciliation:
  - 14d: Stripe vs funnel delta now `0`
  - 30d: Stripe vs funnel delta now `0`
  - note: live `--repair` API still uses old rolling-window semantics until deploy
- Security:
  - `npm audit --omit=dev --audit-level=high` reports Next.js/qs advisories; patch block required

## Work Blocks

### Block 0: Ship Current Integrity Fixes (Immediate)

Scope:

- Deploy latest commits including:
  - offer hierarchy hardening
  - Playwright reliability hardening
  - funnel reconcile UTC bucket-window alignment

Done when:

- `qa:release-gate:live:smoke` passes
- deploy succeeds
- post-deploy `qa:funnel-reconcile -- --days 14` stays at delta `0`

### Block 1: Security and Dependency Hygiene (P0)

Scope:

- Upgrade Next.js to patched stable version
- resolve `qs` advisory path
- rerun full local gate and smoke

Done when:

- `npm audit --omit=dev --audit-level=high` has no open high/moderate advisories accepted as unresolved risk
- no regression in build/smoke/live smoke

### Block 2: Launch Readiness Closure (P0)

Scope:

- close manual matrix from roadmap:
  - digital checkout success/cancel
  - paywall desktop/mobile behavior
  - download + success entitlement behavior
  - referral link/reward flow
  - print matrix (framed success, unframed success, forced failure, admin retry)

Done when:

- manual checklist completed and archived in release notes
- go/no-go recorded with timestamp and owner

### Block 3: Checkout Funnel Quality (P1)

Scope:

- increase `checkout_started -> checkout_request_received` coverage
- tighten client-side blocker diagnostics and attribution
- verify canonical milestone ordering stability across rolling windows

Done when:

- 14-day `checkout_started -> checkout_request_received >= 70%` sustained for 2 consecutive weekly reviews
- no severe checkout blocker reason spikes

### Block 4: Offer and Monetization Experiments (P1)

Scope:

- controlled tests on pack/subscription framing and pricing signals
- referral friend-offer variant validation only with reliable attribution
- keep framed/unframed offer hierarchy consistent across money pages

Experiment rules:

- each test must define:
  - hypothesis
  - primary metric
  - guardrail metrics
  - minimum sample
  - stop/scale condition

Done when:

- at least 2 completed experiments with decision logs (ship/iterate/kill)

### Block 5: Lifecycle, Trust, and Ops Scale (P1/P2)

Scope:

- post-purchase lifecycle automation (recovery, follow-ups, winback)
- replace testimonial/proof scaffolding with approved customer proof
- maintain weekly loop scorecard with explicit operator actions

Done when:

- recovery + lifecycle messages have measurable impact on paid -> download completion
- at least one money page has fully real proof/testimonial block

## 30 / 60 / 90 Day Focus

### Days 0-30

- ship Block 0 and Block 1
- close Block 2 manual readiness
- start Block 3 diagnostics uplift

### Days 31-60

- complete Block 3 coverage improvements
- execute first two Block 4 monetization experiments

### Days 61-90

- expand Block 5 lifecycle/trust system
- scale only experiments with clear positive delta and stable guardrails

## Weekly Operating Cadence

Monday:

- review `qa:funnel-weekly -- --days 14`
- review `qa:commerce-digest -- --days 30`
- review `qa:loop-scorecard -- --days 14`

Midweek:

- ship one reliability/security item and one conversion item

Friday:

- run release gate candidate
- update decision log:
  - what shipped
  - what moved metric
  - what was stopped

## Decision Thresholds

- Reconciliation:
  - `delta != 0` for 2 consecutive checks -> P0 investigation
- Funnel coverage:
  - `checkout_started -> checkout_request_received < 60%` -> P0/P1 blocker
- Post-purchase reliability:
  - `payment_verified -> download_completed < 70%` with sample `>= 5` -> P1 blocker
- Print risk:
  - any print ops anomaly (`sentBelowMinCharge` or negative margin sent order) -> immediate hold on print expansion

## Parallelization Rule

Each weekly cycle should carry exactly:

- one reliability/security block
- one conversion block
- one growth/trust block

Do not run broad expansion work if reliability and measurement guardrails are not green.
