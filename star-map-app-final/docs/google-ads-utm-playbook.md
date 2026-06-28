# Google Ads — final URLs and GA4 attribution

Use this when launching or debugging Search / Performance Max campaigns (e.g. wedding gift).

## Recommended setup (both)

1. **Google Ads → Admin → Account settings → Auto-tagging: ON**  
   Sends `gclid` so GA4 can resolve `sessionCampaignName` when Ads is linked to GA4.

2. **Final URL UTMs on every ad** (backup + readable in reports):

```
https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={ad_group}
```

Replace `{ad_group}` with the ad group slug or remove that param if not needed.

## Campaign naming

| Ads campaign name   | `utm_campaign` value   | Landing page        |
|---------------------|------------------------|---------------------|
| Gift Wedding 2026   | `gift_wedding_2026`    | `/wedding`          |
| Gift Anniversary    | `gift_anniversary_2026`| `/anniversary`      |
| Core gift prospect  | `gift_core_2026`       | `/star-map-gift`    |

Keep Ads campaign name and `utm_campaign` aligned when possible.

## Why GA4 shows `(not set)` for google/cpc

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `google / cpc / (not set)` | Auto-tagging on but Ads not linked to GA4 property | Link Google Ads account in GA4 Admin → Product links |
| Manual `utm_campaign` missing in `sessionCampaignName` | Expected — use `sessionManualCampaignName` in pulls | Add UTMs to final URL; read `manualRows` in `ga4-campaigns-28d.json` |
| No cpc rows at all | Auto-tagging off, no UTMs | Enable auto-tagging and add `utm_medium=cpc` |

## Verify after changes

From `company-os`:

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run ga4:pull
```

Check `.data/ads-traffic-summary.json` for google/cpc sessions and whether `gift_wedding_2026` appears under `highlight.sessionManualCampaignName` or `highlight.sessionCampaignName`.

## Ads console checklist (weekly)

- **Search terms** — add negatives for irrelevant queries
- **Landing page** — confirm final URL is `/wedding` with UTMs above
- **Conversions** — GA4 purchase event firing (compare with Stripe in briefing pull)
