# Google Ads + GA4 fix checklist

**You do the Google Ads console steps below (~15 min).** The repo and `company-os` pulls are handled on the agent side; no deploy is required for attribution fixes.

**GA4 property ID:** `517653481`  
**Primary landing page:** `https://starmapco.com/wedding`

Reference: [google-ads-utm-playbook.md](./google-ads-utm-playbook.md)

---

## YOU must do — ~5 minutes (one-time account)

### 1. Turn on auto-tagging

1. Open [Google Ads](https://ads.google.com/).
2. **Admin** (wrench) → **Account settings**.
3. Under **Tracking**, set **Auto-tagging** to **ON**.
4. Save.

**Verify:** New clicks include `gclid` in the landing URL (open a test ad preview or use Tag Assistant).

---

## YOU must do — ~5 minutes (one-time link)

### 2. Link Google Ads to GA4

1. Open [Google Analytics](https://analytics.google.com/) → property **StarMapCo** (ID `517653481`).
2. **Admin** (gear, lower left) → **Product links** → **Google Ads links**.
3. **Link** → choose your Ads account → confirm.
4. In Google Ads: **Tools & settings** → **Linked accounts** → confirm **Google Analytics (GA4)** shows property `517653481` linked.

**Verify:** In GA4 **Admin → Product links → Google Ads links**, status is **Linked**.

---

## YOU must do — ~15 minutes (per campaign / ad group)

### 3. Set Final URL on every ad

For each ad in the wedding gift campaign:

1. **Campaigns** → open **Gift Wedding 2026** (or your wedding campaign).
2. **Ads & assets** → select each ad → **Edit**.
3. Set **Final URL** exactly (replace `{adgroup}` with the ad group name slug, e.g. `framed_print`):

```
https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={adgroup}
```

4. Save all ads.

**Verify:** Click **Preview** on one ad; browser address bar shows `/wedding` plus the four `utm_*` params (and `gclid` after a real click once auto-tagging is on).

### 4. Add search-term negatives

1. **Insights and reports** → **Search terms** (last 30 days).
2. For irrelevant queries, add as **campaign** or **account** negatives:

| Negative keyword |
|------------------|
| free |
| diy |
| template |
| app |
| birthday |
| tattoo |
| wallpaper |
| pdf |

**Verify:** Search terms report no longer shows high-spend junk queries after a few days.

### 5. Match ad copy to `/wedding`

Skim headlines/descriptions against the live page:

- [https://starmapco.com/wedding](https://starmapco.com/wedding)
- Promise: wedding date + place → preview → framed / unframed print or HD digital.
- Avoid claiming “free download” unless the ad intent is preview-only.

**Verify:** Quality Score / landing page experience improves over 1–2 weeks; bounce rate on `/wedding` from google/cpc is reasonable in GA4.

---

## YOU must do — optional (future automation)

### 6. Google Ads API developer token

Only if you want scripted reporting later (no MCC required for basic API access):

1. **Tools & settings** → **Setup** → **API center**.
2. Apply for **Developer token** (test access is enough for read-only pulls).
3. Store credentials in `company-os/.env.local` (never commit). See `company-os/.env.example` for GA4/GSC variable names.

---

## Agent-side verification (after ~48 hours)

After you complete steps 1–3, wait **48 hours** for sessions, then on your machine:

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run ga4:pull
```

Open `.data/ads-traffic-summary.json` and confirm:

- `google` / `cpc` has sessions (not zero).
- `gift_wedding_2026` appears under manual or auto campaign fields.
- Action items in that file are empty or expected.

Optional weekly briefing (does not require the company-os web server):

```powershell
npm run briefing:dry
```

---

## What the site already does (no deploy needed)

- GA4 loads after cookie consent; landing on `/wedding?utm_*` attributes the session in GA4.
- Internal `source=` params on editor links are for product analytics, not a replacement for Ads UTMs on the **Final URL**.
- Sample testimonials on `/wedding` are labeled **Sample testimonial** in production.

---

## Recommended order this week

| Day | Action |
|-----|--------|
| Today | Steps 1–2 (auto-tagging + GA4 link) |
| Today | Step 3 (Final URLs on all wedding ads) |
| Today | Step 4 (negatives) |
| +48h | `npm run ga4:pull` and read `ads-traffic-summary.json` |
| Weekly | Search terms + step 5 copy check |
