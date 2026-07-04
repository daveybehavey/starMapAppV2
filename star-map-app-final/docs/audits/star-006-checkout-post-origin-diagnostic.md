# STAR-006 Checkout POST Origin Diagnostic

Status: Deployed — observation in progress
Date: 2026-07-03
Deployed: 2026-07-04
Scope: Minimal diagnostic to distinguish instrumented browser checkout POSTs from bare/direct API checkout POSTs.

## 1. Executive summary

STAR-005 ruled out missing UI wiring for `checkout_started` and identified direct/automated `POST /api/checkout` traffic as the most likely dominant cause of the client/server intent gap.

STAR-006 adds a **presence-only browser handoff signal**:

- Instrumented browser checkout paths generate a short non-sensitive token and send it as `checkoutHandoff` in the checkout POST body.
- `/api/checkout` validates token shape only and stores **`checkout_handoff=browser`** or **`checkout_handoff=missing`** on Stripe Checkout Session metadata.
- The **raw token is never logged, stored, or written to Stripe**.
- `qa:checkout-source-diagnostics` counts browser vs missing vs pre-deploy unknown handoff, including paid/unpaid and digital/print breakdowns.

No pricing, ads, UX, recovery, bot filtering, Stripe settings, or Printful behavior changes.

Paid ads remain **no-go** until post-deploy origin mix is measured.

## 2. Context from STAR-004 / STAR-005

| Finding | Implication |
| --- | --- |
| 30 server checkout sessions vs 1 `checkout_started` (7d) | Client intent undercounts server volume |
| All primary UI paths already call `trackFunnelStep("checkout_started")` | Not a missing event-call bug |
| `checkout_started` is client/DNT-gated | Server volume can exceed client intent by design |
| No shared handoff token existed | Could not prove browser handoff vs bare API POST |
| 0 paid sessions | Paid ads stay no-go |

Missing piece answered by STAR-006 after deploy:

```text
How much checkout POST volume is real browser handoff vs direct/bare API POST?
```

## 3. Diagnostic signal

| Layer | Behavior |
| --- | --- |
| Client | `createCheckoutHandoffToken()` returns `b` + 16 hex chars (8 random bytes) |
| Request body | `checkoutHandoff: "<token>"` on instrumented POST bodies only |
| Server validation | Accept only `/^b[a-f0-9]{16}$/i`; otherwise treat as missing |
| Stripe metadata | `checkout_handoff=browser` or `checkout_handoff=missing` |
| GET checkout | Always `checkout_handoff=missing` (no browser handoff path) |
| Existing metadata | `checkout_source` and all other fields preserved |

Sensitive data policy:

- No emails, IPs, secrets, payment data, or map content.
- No raw handoff tokens in logs, KV, funnel counters, or Stripe metadata.

## 4. Client paths that pass the signal

| Path | File | Order types |
| --- | --- | --- |
| Main editor | `src/components/EditorExperience.tsx` | digital + print |
| Simplified editor | `src/components/SimplifiedEditor/SimplifiedEditor.tsx` | digital |
| Download print upsell | `src/app/download/DownloadClient.tsx` | print |
| Success digital add-on | `src/app/success/SuccessClient.tsx` | digital |

Token is generated immediately before checkout POST, alongside existing `trackFunnelStep("checkout_started")` handoff timing.

## 5. Server recording

`src/app/api/checkout/route.ts`:

1. POST body may include `checkoutHandoff`.
2. `resolveCheckoutHandoff(raw)` returns `"browser"` or `"missing"`.
3. `createCheckoutSession({ checkoutHandoff })` writes only the presence value to Stripe metadata.
4. GET checkout always passes `checkoutHandoff: "missing"`.

Checkout behavior, pricing, merch/card/print flows, and `checkout_source` labels are unchanged.

## 6. Diagnostics reporting

`scripts/checkout-source-diagnostics.mjs` now reports:

| Metric | Meaning |
| --- | --- |
| `checkoutHandoff` counts | `browser` / `missing` / `unknown_legacy` |
| `checkoutHandoffBreakdown` | per-handoff paid/unpaid, digital/print, and source labels |
| `interpretation.handoffSignal` | `handoff_metadata_not_yet_available`, `browser_handoff_dominates`, `missing_handoff_dominates`, or `handoff_mix_mixed` |

Pre-deploy sessions without metadata appear as `unknown_legacy` and must not be treated as bare-API evidence.

`commerce-digest` is unchanged; origin mix is read from Stripe session metadata via checkout-source diagnostics.

## 7. Decision table after deploy + observation

| Result | Next ticket |
| --- | --- |
| Most labeled sessions are `checkout_handoff=browser` | Checkout UX / trust / offer / pricing review, or abandon recovery if paid intent is clear |
| Most labeled sessions are `checkout_handoff=missing` | Entry rules / traffic-quality / API POST filtering review |
| Mix is mixed | Segment by source and order type before choosing a revenue fix |

Do not treat `unknown_legacy` (pre-STAR-006) sessions as missing-handoff evidence.

## 8. Files changed

- `src/lib/analytics.ts` — `createCheckoutHandoffToken()`
- `src/components/EditorExperience.tsx` — pass handoff token
- `src/components/SimplifiedEditor/SimplifiedEditor.tsx` — pass handoff token
- `src/app/download/DownloadClient.tsx` — pass handoff token
- `src/app/success/SuccessClient.tsx` — pass handoff token
- `src/app/api/checkout/route.ts` — validate presence, write Stripe metadata
- `scripts/checkout-source-diagnostics.mjs` — handoff counts and interpretation
- `docs/audits/star-006-checkout-post-origin-diagnostic.md` — this document

## 9. Checks run

- `node --check scripts/checkout-source-diagnostics.mjs`
- `npm.cmd run lint`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run qa:checkout-source-diagnostics -- --days 1` (read-only; pre-deploy sessions expected as `unknown_legacy`)

## 10. Paid ads status

**No-go.**

Origin mix is not yet measured from post-deploy labeled sessions. Continue observation before choosing the next revenue-focused ticket.

## 11. Recommended next step

1. Continue daily `qa:checkout-source-diagnostics -- --days 1` until labeled `browser` / `missing` sessions exist.
2. Re-run with `--days 7` once enough post-deploy volume accumulates.
3. Use only sessions with `checkout_handoff=browser` or `checkout_handoff=missing` for origin decisions.
4. Pick the next implementation ticket from the decision table above.

Do not start pricing, UX redesign, recovery, bot filtering, or NoteBill until origin mix is observed.

## 12. Post-deploy observation (first pass)

Date: 2026-07-04

### Deployment status

| Item | Value |
| --- | --- |
| Deployed commit | `84666bb` (`feat: add STAR-006 checkout POST origin handoff diagnostic`) |
| Deploy method | GitHub Actions `deploy-production.yml` via `npm run deploy:remote` |
| Workflow run | [28713886693](https://github.com/daveybehavey/starMapAppV2/actions/runs/28713886693) |
| Run head SHA | `84666bb7d98a4eec77c905fdcc1f1d7412d69de7` |
| Conclusion | success |
| Started (UTC) | 2026-07-04T17:22:18Z |
| Finished (UTC) | 2026-07-04T17:24:37Z |
| Steps passed | `npm ci`, `npm run test:unit`, `npm run deploy:inner`, `npm run qa:live-critical` |

### Commands run (post-deploy)

- `npm.cmd run qa:checkout-source-diagnostics -- --days 1`
- `npm.cmd run qa:commerce-digest -- --days 1`
- `npm.cmd run qa:funnel-reconcile -- --days 1`

### Handoff counts (last 1 day)

| Handoff | Count | Paid | Unpaid | Digital | Print |
| --- | ---: | ---: | ---: | ---: | ---: |
| `browser` | 0 | 0 | 0 | 0 | 0 |
| `missing` | 0 | 0 | 0 | 0 | 0 |
| `unknown_legacy` | 4 | 0 | 4 | 4 | 0 |

Checkout sources (all `unknown_legacy` bucket): `checkout_api_digital_post` × 4.

`interpretation.handoffSignal`: **`handoff_metadata_not_yet_available`**

### Supporting funnel/commerce (last 1 day)

| Metric | Count |
| --- | ---: |
| Raw Stripe Checkout sessions | 4 |
| `checkout_started` | 0 |
| `checkout_request_received` | 4 |
| `checkout_session_created` | 4 |
| `payment_verified` | 0 |
| Production revenue | $0.00 |
| Landing views | 13 |
| Preview started | 10 |
| Server checkout blockers | 0 |
| Funnel reconcile | exit 0 |

### Interpretation

- Deploy succeeded; production is on STAR-006 commit `84666bb`.
- First post-deploy observation is **too early** for origin-mix decisions: all four sessions in the 1-day window are **`unknown_legacy`** (created before handoff metadata was live).
- Do **not** treat `unknown_legacy` as missing-handoff evidence.
- Wait for new checkout sessions created after deploy before judging browser vs missing dominance.

### Enough to choose next ticket?

**No.** Need more post-deploy labeled sessions (`browser` or `missing`).

### Paid ads status

**No-go** until labeled origin mix is measured.

### Next observation action

Re-run `npm.cmd run qa:checkout-source-diagnostics -- --days 1` daily until labeled post-deploy sessions appear, then apply the decision table in section 7.
