# Google Ads relaunch — clean Search setup (StarMapCo)

**Status (2026-06-15):** Phase A signed off — cleared for a **$10–15/day** Search-only wedding test. See economics + kill rules in `PHASE_STATUS.md` → *Ads scale — go decision*.

Practical step-by-step for a **new or reset Search-only** wedding-gift campaign on [starmapco.com](https://starmapco.com).

**Optional API setup (paused campaign):** from `company-os`, after `npm run ads:doctor` passes:

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run ads:relaunch          # dry-run — prints plan
npm run ads:relaunch:apply    # creates PAUSED campaign + ad groups in Ads
```

Requires a developer token with **write** access on customer `5093161448`. Review in the UI before enabling spend.

**Related:** [google-ads-utm-playbook.md](./google-ads-utm-playbook.md) · [ADS_FIX_CHECKLIST.md](./ADS_FIX_CHECKLIST.md) · [ADS_UTM_REFERENCE.md](./ADS_UTM_REFERENCE.md)

---

## Why relaunch (data snapshot)

Pulled **2026-05-26** (`company-os/.data/ads-optimize-report.json`, `google-ads-pull.json`, `ads-traffic-summary.json`):

| Metric | Last ~30d |
|--------|-----------|
| Ads spend | **~$58** (22 clicks) |
| GA4 `google / cpc` sessions | **12** |
| GA4 `google / cpc` purchases | **0** |
| `gift_wedding_2026` in GA4 campaign fields | **Not visible** (UTM + linking gaps) |

**Priority:** Fix attribution and landing URLs **before** scaling spend. Prior pull also had **Performance Max** spend (~$18) with zero conversions — keep PMax off for now.

---

## Account IDs (verify in console)

From the latest Ads API pull — **confirm these match what you see** in [Google Ads](https://ads.google.com/) and your MCC:

| Role | ID | Where to verify |
|------|-----|-----------------|
| Ads customer (account) | `5093161448` | Top bar account selector |
| MCC / login customer | `5265800864` | Only if you manage via MCC |

**GA4 property:** `517653481` (StarMapCo) — Admin → Property settings.

---

## Prerequisites (do in order)

### 1. Site health

From `star-map-app-final`:

```powershell
cd C:\Users\david\dev\starMapAppV2\star-map-app-final
npm run qa:live-critical
```

All critical routes should return OK (`/`, `/about`, `/contact`, `/editor`, `/api/premium`, etc.).

### 2. One live checkout test (wedding path)

1. Open `https://starmapco.com/wedding` (use incognito).
2. Start preview → complete a **real or Stripe test** purchase (smallest SKU you use for tests).
3. On `/success`, **accept analytics cookies** if prompted (client `purchase` only fires after consent unless server purchase mode is on — see Conversions below).
4. In GA4 **Realtime**, confirm a `purchase` event (or check next day in Reports → Monetization).

### 3. Google Ads account settings

| Setting | Value |
|---------|--------|
| **Auto-tagging** | **ON** (Admin → Account settings → Tracking) |
| **GA4 link** | Property **517653481** linked (GA4 Admin → Product links → Google Ads links; confirm in Ads → Linked accounts) |

### 4. Pause legacy spend (until Search is clean)

From last pull, these existed (all should stay **Paused** except your one Search relaunch):

| Campaign (historical name) | Notes |
|----------------------------|--------|
| `Sales-Search-2 - Wedding Gift` | Had spend; final URLs missing `utm_content` |
| `Performance Max-1` | Had spend — **do not enable yet** |
| `Gift_Wedding_Search` | Zero impressions in pull — OK to archive or merge into new structure |

---

## Campaign blueprint (Search only)

### Campaign settings

| Field | Recommendation |
|-------|----------------|
| **Type** | Search |
| **Goal** | Sales / website conversions (not Performance Max) |
| **Campaign name** | `Search - Wedding Gift 2026` (human-readable; align with UTMs) |
| **Networks** | **Search only** — uncheck Search partners and Display expansion unless you explicitly want them |
| **Locations** | **United States + Canada** (English gift market; site ships/prices for both). **Verify in console** — geo is not in the API pull; adjust if your shipping policy is US-only. |
| **Languages** | English |
| **Bidding** | Start **Maximize clicks** with **max CPC cap** (~$2–4) *or* **Manual CPC** with conservative bids until you have 7 days of data |
| **Daily budget** | **$10–15/day** hard cap |
| **Evaluation window** | **7 days**, then review search terms + GA4 before raising budget |

### Final URL (every ad in this campaign)

Use Google’s ValueTrack so each ad group is identifiable in GA4:

```
https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={adgroup}
```

- `{adgroup}` is replaced at click time with the ad group name.
- Keep **one landing page** (`/wedding`) for this campaign.
- Do **not** send paid traffic to `/editor` until you have a separate campaign + UTMs for editor tests.

Copy-paste variants: [ADS_UTM_REFERENCE.md](./ADS_UTM_REFERENCE.md).

### Ad group structure (2–3 tight themes)

Create **separate ad groups** with **phrase/exact** keywords only (no broad match at launch).

| Ad group name (slug → `utm_content`) | Theme | Example keywords (phrase/exact) |
|--------------------------------------|--------|----------------------------------|
| `wedding_star_map_gift` | Wedding gift intent | `[wedding star map gift]`, `"wedding star map"`, `[star map wedding gift]` |
| `night_we_met` | Couples / “night we met” | `"stars on the night we met"`, `[custom star map gift]`, `"star map on our wedding night"` |
| `custom_date_location` | Date + place customization | `"custom star map by date"`, `[personalized star map wedding]`, `"night sky map wedding date"` |

**High-intent terms from recent search report** (good to include as exact/phrase): `star map gift`, `stars on the night we met`, `what did the stars look like on this date`, `custom star map`.

**Do not target yet:** birthday/born/night-I-was-born queries (add negatives — see below).

### Responsive search ads (starters only)

Match live copy on [/wedding](https://starmapco.com/wedding). **No fake claims** — the site offers free **preview**, paid framed/unframed print and HD digital.

**Headlines (mix and match, ≤30 chars each where possible):**

- Wedding Star Map Gift
- Stars on Your Wedding Night
- Custom Map From Your Date
- Free Preview Before You Buy
- Framed & Digital Options
- Ceremony Date + Location
- Meaningful Couples Gift
- Print-Ready Star Map
- Preview in Under 5 Minutes
- From StarMapCo

**Descriptions:**

- Turn your wedding date and place into a personalized star map. Free preview, then print or HD digital.
- Capture the night sky from your ceremony. Choose framed print, unframed print, or HD digital after you approve the design.
- A thoughtful wedding or anniversary gift — preview free, checkout when the map looks right.

**Avoid:** “Free download,” “#1,” competitor names, or guarantees you do not state on the page.

### Negative keywords (account or campaign level)

From `ads-optimize-report.json` console checklist — add as **account** negatives if you run other campaigns later:

```
free
diy
template
app
birthday
tattoo
wallpaper
pdf
```

**Also consider** (from search term noise in pull): `generator`, `gratis`, `buy a star`, `wallpaper`, non-English queries if you target US/CA only.

Review **Insights → Search terms** weekly and add phrase negatives for junk that gets impressions.

---

## Conversions (GA4 ↔ Google Ads)

### Event name in code (do not invent a custom name)

The site fires the standard GA4 ecommerce event **`purchase`**:

- **Browser (after cookie consent):** `sendGaEvent("purchase", { transaction_id, currency, value, items })` in `src/lib/analytics.ts` (`trackPurchaseCompleted`).
- **Server (optional):** Measurement Protocol event name **`purchase`** in `src/lib/ga4MeasurementProtocol.ts` when `NEXT_PUBLIC_GA4_SERVER_PURCHASES=true` and `GA4_API_SECRET` is set (deduped per Stripe session).

### Linking in Google Ads

1. **GA4 Admin** → **Data display** → **Events** → confirm **`purchase`** is marked as a **conversion** (toggle on if needed).
2. **Google Ads** → **Goals** → **Conversions** → **New conversion action** → **Import** → **Google Analytics 4 properties** → select **`purchase`**.
3. Primary bidding metric: **Purchase** (or “Website purchase” from GA4 import), not Smart campaign defaults.
4. Allow **7–14 days** after linking for attribution; compare Ads conversions to GA4 **with** `sessionManualCampaignName` / `sessionCampaignName` = `gift_wedding_2026`.

**Sanity check:** One manual `/wedding` test purchase should appear in GA4 Monetization; Ads may lag 24–48h after import is enabled.

---

## What NOT to do yet

| Do not | Why |
|--------|-----|
| Enable **Performance Max** | Prior PMax spent ~$18 with 0 GA4 purchases; no clean Search baseline yet |
| **Broad match** on main keywords | Burns budget on “birthday,” “free,” “generator,” foreign-language queries |
| Birthday / “born” ad groups | Mismatch with `/wedding`; use negatives |
| Multiple landing pages in one campaign | Keep `/wedding` only for this relaunch |
| Raise budget before 7-day review | Last ~$58 → 0 GA4 purchases — fix tracking first |
| Enable Ads API spend automation from repo | Out of scope; console only |

---

## Launch day checklist (~30 min in Ads UI)

1. [ ] Auto-tagging **ON**
2. [ ] GA4 property **517653481** linked
3. [ ] `npm run qa:live-critical` passed
4. [ ] Manual `/wedding` → Stripe test + GA4 `purchase` seen
5. [ ] **Pause** PMax and any old Search campaigns you are not using
6. [ ] Create **Search - Wedding Gift 2026** (or fix one existing Search campaign) with settings above
7. [ ] Set **Final URL** on every RSA to the UTM template with `{adgroup}`
8. [ ] Add **3 ad groups** + phrase/exact keywords + RSA copy
9. [ ] Add **negative keyword** list
10. [ ] Set budget **$10–15/day** → enable campaign

---

## Weekly ops (compare Ads vs GA4)

From `company-os`:

```powershell
cd C:\Users\david\dev\starMapAppV2\company-os
npm run data:pull
```

Then open:

| File | What to check |
|------|----------------|
| `.data/ads-optimize-report.json` | Spend vs GA4 cpc purchases; console checklist |
| `.data/ads-traffic-summary.json` | `googleCpc.purchases`, `gift_wedding_2026` visibility |
| `.data/google-ads-pull.json` | Search terms, campaign status, final URLs |

**Decision rules after 7 days:**

- **Spend with 0 purchases and bad search terms** → more negatives, tighten match types, check final URLs.
- **Sessions but no `gift_wedding_2026` in GA4** → auto-tagging + UTMs + Ads↔GA4 link.
- **Purchases in GA4 but not in Ads** → conversion import / attribution window.
- **Profitable search terms (phrase)** → consider exact-only ad group or slight budget bump (+$5/day max).

Optional: `npm run briefing:dry` for a one-page ops summary (does not require the company-os web server).

---

## Historical reference (last pull)

- **Customer ID:** `5093161448` (verify in console)
- **MCC login customer ID:** `5265800864` (verify in console)
- **Paused campaigns with past spend:** `Sales-Search-2 - Wedding Gift`, `Performance Max-1`
- **Final URL gap:** Wedding ads had `utm_campaign=gift_wedding_2026` but **missing `utm_content={adgroup}`**

---

*Last updated from company-os pulls: 2026-05-26. Re-run `npm run data:pull` before changing budgets or structure.*
