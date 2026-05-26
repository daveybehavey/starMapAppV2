# Ads UTM reference — copy-paste final URLs

Use on **Google Ads Final URL** fields (not display URL). Enable **auto-tagging** in Ads so `gclid` is appended on click.

**Campaign naming:** Keep Ads campaign name aligned with `utm_campaign` when possible.

---

## Wedding Search relaunch (primary)

**Landing:** `https://starmapco.com/wedding`

**Template (recommended — includes ad group in GA4):**

```
https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={adgroup}
```

**Without ValueTrack** (replace `ADGROUP_SLUG` manually per ad group, e.g. `wedding_star_map_gift`):

```
https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content=wedding_star_map_gift
```

| Param | Value |
|-------|--------|
| `utm_source` | `google` |
| `utm_medium` | `cpc` |
| `utm_campaign` | `gift_wedding_2026` |
| `utm_content` | `{adgroup}` or ad group slug |

---

## Editor (future campaigns only)

Do **not** use for the initial wedding Search relaunch. When you test editor-intent ads, use a **separate** campaign and `utm_campaign`.

**Template:**

```
https://starmapco.com/editor?utm_source=google&utm_medium=cpc&utm_campaign=editor_prospect_2026&utm_content={adgroup}
```

**Example (manual slug):**

```
https://starmapco.com/editor?utm_source=google&utm_medium=cpc&utm_campaign=editor_prospect_2026&utm_content=create_star_map
```

---

## Other gift landing pages (later)

| Occasion | `utm_campaign` | Path |
|----------|----------------|------|
| Anniversary | `gift_anniversary_2026` | `/anniversary` |
| Core gift | `gift_core_2026` | `/star-map-gift` |

Example anniversary final URL:

```
https://starmapco.com/anniversary?utm_source=google&utm_medium=cpc&utm_campaign=gift_anniversary_2026&utm_content={adgroup}
```

---

## GA4 debugging

After clicks, in `company-os` pulls:

- **`sessionCampaignName`** — often from auto-tagging (`gclid`) when Ads ↔ GA4 is linked
- **`sessionManualCampaignName`** — from `utm_campaign` on the landing URL

If `google / cpc` shows `(not set)` for both, see [google-ads-utm-playbook.md](./google-ads-utm-playbook.md) and [ADS_RELAUNCH_SETUP.md](./ADS_RELAUNCH_SETUP.md).

---

## What the site does with UTMs

- Marketing UTMs on the landing URL are read for GA4 session attribution.
- Internal `source=` params on editor links are for product analytics — they **do not** replace Final URL UTMs on ads.

See also: [ADS_FIX_CHECKLIST.md](./ADS_FIX_CHECKLIST.md).
