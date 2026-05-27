# Weekly growth ops (30–45 min)

Run after deploys or every Monday. Keeps ads, GA4, SEO, funnel, and print ops aligned without waiting on testimonials.

## Company-os data (from repo root)

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run data:pull
npm run data:doctor
npm run ga4:pull
npm run gsc:pull
npm run ads:optimize
```

Read: `.data/ads-traffic-summary.json`, `.data/ga4-campaigns-28d.json`, GSC top queries export.

**Ads:** Confirm Search **gift_wedding_2026** final URLs include `utm_campaign=gift_wedding_2026`, auto-tagging ON, GA4 property `517653481` linked.

## App QA (from `star-map-app-final`)

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run qa:growth-weekly
```

Covers loop scorecard, live-critical, print margin, optional GA4 MP probe (local secrets), funnel reconcile (14d), commerce digest.

Full Tier 0 checklist (manual checkout + print proof): `docs/TIER0_VALIDATION.md`.

Optional SEO diff (needs CSV exports):

```powershell
npm run seo:scoreboard -- --current data/gsc-last-7d.csv --previous data/gsc-prev-7d.csv --out reports/seo-weekly-scoreboard.md
```

## Proof assets (optional, when Printful env set)

```powershell
npm run assets:printproof
```

Uses draft-order previews + mockups; money pages label them as mockups (see `docs/PROOF_INTAKE_RUNBOOK.md`).

## Human-only (skip in agent runs)

- Permissioned testimonials → `docs/testimonial-intake-template.md`
- Permissioned buyer photos (not required for marketing; mockups are default)

## When to pause ads

- `qa:live-critical` fails (includes `/api/premium` — if 429, re-run once; smoke uses monitoring UA)
- GA4 `purchase` broken on **manual** checkout with consent (see `docs/PURCHASE_ANALYTICS.md` troubleshooting)
- Zero purchases with rising spend after 2+ weeks — fix landing/offer before scaling
