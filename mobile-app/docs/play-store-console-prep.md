# Google Play Console prep (StarMap mobile)

Use this while waiting for the **upload key reset** to become active. Package: **`app.starmapco.com`**.

## URLs (paste into Play)

| Field | URL |
|--------|-----|
| Privacy policy | https://starmapco.com/privacy |
| Terms (if asked) | https://starmapco.com/terms |
| Support / contact | https://starmapco.com/support |
| Support email | support@starmapco.com |

**Note:** The live privacy page still describes the **website** (minimal accounts). The **app** collects email (magic link), Google account info, session tokens, map generation data, and purchase state via RevenueCat. Answer **Data safety** for what the **app** actually does (below). Consider adding a short “Mobile app” section to `/privacy` before production—optional but cleaner.

---

## 1) Internal testing track

**Where:** Play Console → **Test and release** → **Testing** → **Internal testing** → **Create new release** (after May 17 UTC when uploads work).

### Testers

1. **Testing** → **Internal testing** → **Testers** tab.
2. Create an email list (e.g. `star-map-internal`) and add Gmail addresses (must be Google accounts).
3. Copy the **opt-in link** and open it on each tester’s phone (accept invitation).

### Countries

1. Same track → **Countries / regions** (or **Production** → countries if unified).
2. For v1, pick where you’re comfortable supporting: e.g. **United States, Canada, United Kingdom, Australia** (or “All countries” if you want maximum reach).

### Release notes (draft — internal / first upload)

```
Initial internal test build.

• Sign in with Google or email magic link
• Generate a personalized star map (date, location, message)
• View account sessions and premium status
• In-app subscriptions via Google Play (RevenueCat)

Feedback: support@starmapco.com
```

### After upload key is valid

1. Upload `.aab` from `mobile-app/dist/` (production build).
2. Save release → **Review release** → roll out to internal testers.

---

## 2) Store listing (Main store listing)

**Where:** **Grow users** → **Store presence** → **Main store listing** (wording may vary).

### App name (30 chars max)

`StarMapCo: Star Map & Sky Art`  
(or shorter: `StarMapCo`)

### Short description (80 chars max)

```
Create a custom star map for any date and place. Sign in, generate, and save memories.
```

### Full description (up to 4000 chars)

```
StarMapCo turns a meaningful date and location into a beautiful custom star map—the night sky as it appeared above that moment.

WHAT YOU CAN DO
• Pick a date, time, and place (or coordinates)
• Personalize titles and messages on your map
• Generate high-quality star map previews from your phone
• Sign in with Google or a secure email link to access your sessions
• Upgrade with Google Play subscriptions for premium features (via in-app purchase)

WHO IT’S FOR
• Gifts for anniversaries, weddings, birthdays, and memorials
• Couples, families, and anyone who wants a keepsake of “our night sky”

ACCOUNT & SYNC
Your account links mobile sessions with StarMapCo so you can see premium status and saved map sessions across devices when signed in.

SUPPORT
Questions or account help: support@starmapco.com
Privacy: https://starmapco.com/privacy
Terms: https://starmapco.com/terms
```

### Category

- **Primary:** Art & Design (or **Lifestyle** if Art feels wrong)
- **Secondary (optional):** Entertainment or Personalization

### Icon & graphics

| Asset | Source / spec |
|--------|----------------|
| App icon | `mobile-app/assets/icon.png` (1024×1024 if Play asks; Expo icon is square) **or** `mobile-app/assets/store-branding/generated/play-store-icon-512.png` / `play-store-icon-1024.png` from `npm run generate:brand-assets` |
| Feature graphic | `mobile-app/assets/store-branding/generated/play-feature-graphic-1024x500.png` |
| Phone screenshots | Min 2, max 8; **16:9 or 9:16**; min short side **320px**; capture from emulator or device |

**Screenshot ideas (4–6):** Home / Generate tab, map preview, Account signed in, Upgrade / paywall, Google sign-in.

### Contact details

- Email: **support@starmapco.com**
- Website: **https://starmapco.com**

---

## 3) Policy & compliance

### Privacy policy URL

**Store settings** → **App content** → **Privacy policy** →  
`https://starmapco.com/privacy`

### Data safety form

**App content** → **Data safety** → start questionnaire.

Answer honestly for the **Android app** (not only the website):

| Data type | Collected? | Purpose | Shared? |
|-----------|------------|---------|---------|
| Email address | Yes | Account (magic link), sign-in | Backend only |
| Name | Optional | From Google profile if provided | Backend only |
| User IDs | Yes | Session tokens, RevenueCat app user ID | RevenueCat, your API |
| App activity | Yes | Map generation, account state API calls | Your backend |
| Purchase history | Yes | Subscriptions / entitlements | Google Play, RevenueCat |
| Device or other IDs | Possible | Analytics if added later; RevenueCat may use device identifiers | Declare if enabled |

Typical choices:

- **Data is collected** (not “only on device” for account features).
- **Data is encrypted in transit** (HTTPS API).
- **Users can request deletion** → email **support@starmapco.com** (document in Play “Account deletion” if required).
- Third parties: **Google** (Sign-In), **RevenueCat** (subscriptions), **your API host** (starmapco.com).

### Account deletion (Play requirement)

**App content** → **Account deletion** (if shown):

- URL or email: `https://starmapco.com/support` and **support@starmapco.com**
- Process: “Email support@starmapco.com from the address on your account. We delete mobile session and linked purchase metadata within 30 days except where law requires retention.”

### Content rating

**App content** → **Content rating** → complete **IARC questionnaire**.

Likely outcome for this app (no violence, no UGC chat, no gambling):

- **Everyone** or **Teen** depending on how you answer “user-generated content” (map text is user-entered; usually low risk).

### Ads

If the app has **no ads**, declare **No ads**.

---

## 4) Checklist before first Play upload (May 17+)

- [ ] Upload key active (SHA-1 `E6:EF:12:…` on App integrity)
- [ ] `npm run build:play-store` finished
- [ ] `npm run download:play-aab` → upload new `.aab`
- [ ] Internal testers invited
- [ ] Store listing + privacy URL + data safety + content rating saved
- [ ] Next: device/emulator test + Google OAuth (see README + section 2 of `play-internal-testing-checklist.md`)

---

## 5) Next session (testing & OAuth)

See `play-internal-testing-checklist.md` sections 2 and 4.

**Emulator:** Android Studio AVD + `npm run build:dev` or install internal build; API base `http://10.0.2.2:3000/api` for local Next.js.

**OAuth:** Google Cloud → Android client, package `app.starmapco.com`, SHA-1 from Play **App signing key** (for Play installs) + debug SHA-1 for dev builds.
