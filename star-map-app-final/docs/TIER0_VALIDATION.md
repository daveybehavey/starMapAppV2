# Tier 0 validation checklist

Run before scaling ads or large deploys. Automates where possible; some steps need a human.

## Automated (agent / CI)

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run qa:growth-weekly
npm run qa:live-print-conversion -- --checkout-only --no-promo
```

| Check | Pass criteria |
| --- | --- |
| `qa:live-critical` | All checks PASS (premium uses `StarMapCo-LiveSmoke/1.0` UA) |
| Loop scorecard | Funnel steps readable; note checkout→paid % |
| `ga4-mp-probe-optional` | Runs when `.env.local` has `GA4_API_SECRET` |
| Print checkout API | `qa:live-print-conversion --checkout-only` returns Stripe URL with `#fid` |

## Wrangler / production secrets

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npx wrangler secret list
```

Confirm present: `GA4_API_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_TOKEN`.

## Human: one manual digital purchase

1. Incognito → https://starmapco.com/editor — create preview, accept analytics cookies.
2. Complete HD checkout (not `npm run qa:live-conversion`).
3. `/success` → auto-redirect to `/download?session_id=…&auto_export=1`.
4. File downloads; check email for HD link.
5. GA4 Realtime → event `purchase` with `transaction_id` = Stripe `cs_…`.

## Human: one real print order (Phase A2)

1. https://starmapco.com/wedding → editor → framed print → pay (expect ~$99 + shipping).
2. After pay: Printful dashboard + `npm run qa:print-ops -- --hours 168`.
3. Done when at least one order shows **sent** (or ops documents blocker).

## Ads alignment

See `docs/ADS_RELAUNCH_SETUP.md`: auto-tagging ON, GA4 property `517653481` linked, `purchase` imported as conversion, campaign URLs include `utm_campaign=gift_wedding_2026`.

## When to pause ads

- `qa:live-critical` fails
- Manual checkout cannot reach working download
- Zero GA4 `purchase` for 7+ days while internal funnel shows paid sessions (check `GA4_API_SECRET`)
