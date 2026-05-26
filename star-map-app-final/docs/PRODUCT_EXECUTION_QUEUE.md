# Product execution queue (your priority order)



Updated from product planning session. Ads work is **paused** until you relaunch spend.



## 1. Core experience (editor + reveal) — shipped



- [x] Reveal waits for canvas render (no fake 900ms then “Rendering sky…” flash)

- [x] Text toolbar hint (drag / arrows / Enter)

- [x] Reveal parity on mobile (`MobileCreate`)

- [x] Post-reveal checkout nudge on editor + mobile (targets preview→checkout leak; track `preview_checkout_nudge_*`)

- [x] Double-click text on canvas to focus inline editor



**Verify:** `npm run qa:smoke:render` and manual `/editor` reveal flow.



## 2. Checkout & post-purchase



- [x] PR #133 changes ported (shop local proof images, how-to-print SKUs, square default from shop links)

- [x] Close PR #133 on GitHub (superseded by main; closed without merge)

- [x] Deploy UTM cookie (`UtmAttributionClient` + `/api/marketing-attribution`) — live after deploy

- [x] Success/download upsell cards (digital ↔ print) — `listDownloadPrintUpsellCards` on `/success` and `/download`

- [x] Confirm wallet methods surface well in Stripe Checkout UI — `npm run qa:stripe-pmc` (card, Apple Pay, Google Pay on PMC)



## 3. Money pages



- [ ] Real testimonials on money pages when permissioned quotes exist (`docs/testimonial-intake-template.md`) — no placeholder quotes live

- [ ] Replace weak proof photos with fulfilled print samples (1 shipment done — use when photos arrive)

- [x] Trust + CTA pass (no fake testimonials): `/wedding`, `/personalized-star-map`, `/star-map-gift`, `/night-sky-map-gift`, `/anniversary`

- [x] GSC-driven metadata pass: `/birthday`, `/constellation-map`, `/personalized-star-map`, `/wedding` hero line, `/best-personalized-star-map-gift` → `/personalized-star-map`



## 4. Print (1 order shipped — refine before catalog expansion)



**Live checkout SKUs:** `poster_framed`, `poster_unframed` only (`PAYWALL_LIVE_PRINT_VARIANTS`).



**Before adding canvas / mug / card:**



1. Run internal print matrix (`docs/print-launch-checklist.md`)

2. `npm run qa:print-margin` for each candidate SKU

3. Proof images + merchant feed refresh (`npm run assets:commerce-refresh`)

4. Enable SKU in `printCatalog.ts` + Stripe price envs + `PAYWALL_LIVE_PRINT_VARIANTS`



**Ops:** `npm run qa:print-ops` (2026-05-25: 1 session in 168h window, unpaid/abandoned — sent=0 pending=0).



## 5. SEO & content



- [x] Triage open agent PRs (#39–45) — closed stale agent PRs (superseded by main)

- [x] Authority page: “How accurate are star maps?” — live; linked from home trust panel + blog

- [x] PR #125 — shipping emails on main; closed PR (mobile/RevenueCat scope deferred)

- [x] Blog → money-page internal links — `BlogPostConversionLinks` on main guide posts

- [x] Remove fake Valentine’s testimonial block — honest proof invite + support email

- [ ] Weekly: `npm run data:pull` + GSC top queries → tune titles/H1s



## 6. Referrals & loops



- [x] Referral card on `/success` + `/download` (inline UI; shared component extraction optional later)

- [x] Proof intake runbook — `docs/PROOF_INTAKE_RUNBOOK.md`; `PostPurchaseProofRequest` on success + download

- [x] `npm run qa:loop-scorecard -- --days 14` (session baseline)

- [x] `npm run qa:weekly-product` — chains scorecard + live-critical + print-margin



## Agent data (anytime)



```powershell

cd C:\Users\david\dev\starMapAppV2\company-os

npm run data:pull

npm run data:doctor

```



## Blocked / needs human



- Permissioned testimonials for money pages (no fabricated quotes)

- Real fulfilled-print photos for proof sections (not Printful $60 sample shots)

- Ads relaunch to `/wedding` with UTMs after live checkout smoke on production

- Mobile app + RevenueCat (was bundled in PR #125; track separately if desired)


