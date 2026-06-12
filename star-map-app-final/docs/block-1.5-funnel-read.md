# Block 1.5 — Funnel read (Phase A exit proof)

**Goal:** Confirm wedding/gift traffic moves through:

```text
/wedding (or gift_wedding_2026) → editor preview → paywall (print intent) → print checkout → purchase
```

**Do not** change product, checkout, pricing, Printful, or SKUs while running this read. **Do not** start Phase C merch until Block **1.6** signs off Phase A.

---

## Baseline (post Block 1.1)

| Item | Value |
|------|--------|
| Deploy date | **2026-06-12** |
| Worker version | `5de4ed19-bffd-4886-afbd-94495b138a77` |
| Git commits | `2e1fd6d` (ship), `4d76a7f` (tests + status) |
| Change | Wedding / `gift_wedding_2026` → print tab + framed default; explicit print paths auto-open paywall |

**Exclude pre-deploy data** when judging Block 1.1 impact. Use a window that starts **on or after 2026-06-12 UTC**.

---

## Recommended waiting window before Phase A sign-off (1.6)

| Window | Use |
|--------|-----|
| **Minimum 7 days** after deploy | First read — enough for ads + organic wedding landings to hit the new editor behavior |
| **14 days** (preferred) | Sign-off read — matches `qa:growth-weekly` / commerce digest default |
| **Low traffic** | If wedding `preview_started` with wedding source **&lt; 20** in 7d, extend to 14d before calling 1.5 failed |

Phase A exit needs **evidence of print checkout from wedding/editor**, not only digital. One **paid print** in Stripe with wedding-ish metadata is strong; funnel step counts alone are not enough if volume is tiny.

---

## Funnel stages → what to measure

| Stage | Question | Primary signals |
|-------|----------|-----------------|
| 1. Landing | Are people on `/wedding`? | GA4 page path; PostHog `$pageview` / `landing_view` |
| 2. CTA / intent | Do they enter editor with gift intent? | `hero_plan_click`, `preview_start_submit` |
| 3. Preview | Do they start and reveal a map? | `preview_started`, `editor_reveal` |
| 4. Paywall | Does paywall open with print intent? | `paywall_opened` (`intent=print` when present) |
| 5. Print selection | Framed vs unframed? | `print_option_clicked` (`variant`) |
| 6. Checkout | Print Stripe session started? | `checkout_started` / `begin_checkout` with print |
| 7. Purchase | Paid print completed? | `payment_verified`, Stripe print paid, `purchase` / `purchase_success` |
| 8. Leak | Digital-only from wedding flow? | `checkout_started` with `order_type=digital` + wedding `source` |

---

## Metrics available today

### A. Internal funnel counters (KV — consent not required for counts)

**API:** `GET /api/analytics/funnel?days=14` (auth: `FUNNEL_DASHBOARD_TOKEN` if set)

**Steps** (`src/lib/funnelSteps.ts`):

| Step | Wedding relevance |
|------|-------------------|
| `landing_view` | Fires once/session; wedding page passes `source=wedding` |
| `hero_plan_click` | CTA clicks; includes `source`, `plan` |
| `preview_started` | Editor entry; includes `source` |
| `editor_reveal` | Map revealed; includes `source` |
| `checkout_started` | Handoff to `/api/checkout`; includes `source`, `plan` (print uses variant id as plan) |
| `checkout_session_created` | Stripe session created (server) |
| `checkout_redirected` | Client redirect to Stripe |
| `payment_verified` | Paid sessions (server, Stripe-backed) |

**CLI:**

```powershell
cd C:\Code\starMapAppV2\star-map-app-final
npm run qa:growth-weekly
npm run qa:funnel-reconcile -- --days 14   # needs STRIPE_SECRET_KEY
node scripts/commerce-digest.mjs --days 14
node scripts/loop-scorecard.mjs --days 14
```

**Wedding-specific breakdown:** Funnel KV stores **`funnel:source:{step}:{source}`** keys when `source` is sent. Filter mentally for sources containing `wedding`, `sticky-wedding`, `gift-formats`, etc. There is **no** built-in dashboard filter by UTM campaign — use GA4/PostHog for `gift_wedding_2026`.

---

### B. PostHog (client events — needs analytics consent)

| Event | Key properties | Notes |
|-------|----------------|-------|
| `landing_view` | `source` | Wedding page: `source=wedding` |
| `funnel_step` | `step`, `source`, `plan`, … | Same steps as KV |
| `preview_start_submit` | `source`, `plan`, `checkout`, `printVariant` | PreviewStartForm |
| `preview_started` | via `funnel_step` | Editor query prefill |
| `preview_reveal_animation_*` / `reveal_map` | `source` | Engagement |
| `paywall_view` | experiment props | Not always print |
| `paywall_opened` | `intent` (**print only on auto-open path**), `variant` (A/B copy) | **Gap:** manual open often **no `intent`** |
| `print_option_clicked` | `variant`, `includeDigitalAddOn`, `source` | Framed/unframed choice |
| `checkout_started` | `order_type`, `print_variant`, `plan`, `source` | Print when `order_type=print` |
| `checkout_redirected` | `orderType`, `source`, … | |
| `checkout_failed` | error codes | |
| `purchase` | `order_type`, `print_variant`, … | Client when consent + not server-only GA4 |
| `purchase_success` | `orderType` | Success page |

**Suggested PostHog funnel (14d, after 2026-06-12):**

1. Filter: `$pathname` = `/wedding` **OR** `$session_entry_utm_campaign` contains `gift_wedding`
2. Steps: `landing_view` → `preview_started` (source contains `wedding`) → `paywall_opened` → `checkout_started` where `order_type` = `print` → `purchase`

---

### C. GA4

| Signal | Use |
|--------|-----|
| Page path `/wedding` | Landing volume |
| `sessionManualCampaignName` / `sessionCampaignName` = `gift_wedding_2026` | Ads attribution |
| `begin_checkout` | Fires via `trackBeginCheckout`; check item/category for print |
| `purchase` | Server MP when `NEXT_PUBLIC_GA4_SERVER_PURCHASES=true` |

Ref: `docs/ADS_RELAUNCH_SETUP.md`, `docs/PURCHASE_ANALYTICS.md`

---

### D. Stripe / ops (ground truth for print purchase)

```powershell
cd C:\Code\starMapAppV2\star-map-app-final
npm run qa:print-ops -- --hours 336 --limit 50
```

Commerce digest reports **`printPaidSessions`** vs **`printSessionsTotal`**. Cross-check metadata / client reference for wedding sources where present.

---

## Block 1.5 pass criteria (propose for 1.6)

Record in `reports/weekly-notes-YYYY-MM-DD.md` (gitignored):

- [ ] **Volume:** ≥ 20 wedding-sourced `preview_started` in window (or document low-traffic extension)
- [ ] **Paywall:** ≥ 1 `paywall_opened` with `intent=print` **or** ≥ 1 `print_option_clicked` from wedding source after deploy
- [ ] **Checkout:** ≥ 1 `checkout_started` with `order_type=print` and `source` containing `wedding` (PostHog) **or** print checkout row in funnel with wedding source key
- [ ] **Purchase:** ≥ 1 **paid print** session in Stripe in window **or** clear documented blocker (shipping country, asset upload, etc.)
- [ ] **Leak check:** Digital-only wedding checkouts noted; not necessarily failure if print path also fires

If print checkout fires but **zero** print purchases after 14d with meaningful traffic → fix checkout/ops before Phase A sign-off, not Phase C SKUs.

---

## Data gaps (known)

| Gap | Impact | Workaround |
|-----|--------|------------|
| `paywall_opened` missing `intent` on manual/digital opens | Hard to count “print tab default” | Use `purchaseIntent` proxy: wedding source + same-session `print_option_clicked` or print `checkout_started` |
| `paywall_opened` missing `source` | Can’t tie paywall to landing in PostHog alone | Join on session + prior `preview_started.source` |
| Funnel dashboard has no UTM campaign dimension | Can’t filter `gift_wedding_2026` in `/api/analytics/funnel` | GA4 campaign reports or PostHog UTM props |
| `landing_view` deduped once per session globally | Under-counts multi-page sessions | GA4 `/wedding` pageviews for volume |
| Low sample size (5 paid / 187 sessions in prior 14d) | 1.5 may be inconclusive at 7d | Prefer 14d window; don’t scale ads until read is clean |
| Consent / DNT | PostHog/GA4 under-report vs KV funnel | Use KV + Stripe for minimum proof; PostHog for segmentation |

**Future (not in scope for 1.5):** Add `source` + `intent` to every `paywall_opened` — product change; defer until after sign-off read.

---

## Execution checklist (when window elapses)

1. Note deploy baseline date and today’s date.
2. Run `npm run qa:growth-weekly` and save output snippet to weekly notes.
3. PostHog: wedding funnel above (14d, filter date ≥ 2026-06-12).
4. GA4: `/wedding` sessions + `gift_wedding_2026` campaign → `begin_checkout` → `purchase`.
5. `node scripts/commerce-digest.mjs --days 14` — `printPaidSessions`, referral sources.
6. `npm run qa:print-ops -- --hours 336` — fulfillment health.
7. Write 1 paragraph: pass / fail / inconclusive + blocker for **1.6**.
8. Update `docs/PHASE_STATUS.md` Block **1.5** row.

---

## Related docs

- `docs/WORKING_BLOCKS.md` — Block 1.5 definition
- `docs/PHASE_STATUS.md` — Phase A exit
- `docs/GROWTH_OPS_WEEKLY.md` — weekly rhythm
- `docs/ADS_UTM_REFERENCE.md` — `gift_wedding_2026` URLs
