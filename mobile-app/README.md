# StarMap Mobile (Android first)

Expo + React Native baseline for Google Play release, optimized for long-term maintainability.

## Why this setup

- Single TypeScript codebase with strict checks.
- Android builds from Windows using Expo/EAS cloud builds.
- Shared backend model (mobile consumes API, not duplicate business logic).
- Ready path for Play subscriptions with RevenueCat.

## Stack

- Expo SDK 54
- React Native 0.81
- React Query for network state/caching
- Zod for runtime validation
- ESLint (Expo flat config)

## Project layout

- `src/config`: environment parsing and config
- `src/lib/api`: API client and endpoint contracts
- `src/features`: feature-specific hooks/services
- `src/state`: query client and state setup
- `src/ui`: screens/components

## Current backend alignment

This app now calls your existing `star-map-app-final` endpoints:

- `POST /api/account/mobile/request`
- `POST /api/account/mobile/claim`
- `GET /api/account/mobile/state`
- `POST /api/account/mobile/revenuecat/link`
- `POST /api/account/mobile/logout`
- `POST /api/account/mobile/google` (Google ID token → same mobile session as magic-link claim)

Set `EXPO_PUBLIC_API_BASE_URL` to `http://10.0.2.2:3000/api` when testing Android emulator against local Next.js.

### RevenueCat (mobile, quick path)

1. In [RevenueCat](https://app.revenuecat.com), open your **Android** app under the project and copy the **Public app-specific API key** (not the Secret `sk_` key).
2. Put it in **`mobile-app/.env.local`** as **`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=`** (and the same for **`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`** when you test iOS). Never put `sk_` secrets in the mobile app — they ship in the client bundle.
3. In RevenueCat: connect **Google Play**, import **products**, create an **entitlement**, attach products, set a **current offering**, then add a **Paywall** and (optionally) **Customer Center**.
4. Run **`npm run build:dev`** once to install an **Android development build** with native Purchases + Paywalls (Expo Go is not enough for real IAP).
5. Start Metro: **`npx expo start`**, open the dev build, connect billing on the **Upgrade** tab.

Server webhooks / Secret keys stay in **`star-map-app-final`** only. After deploy, add **`POST /api/revenuecat/webhook`** in RevenueCat (Integrations → Webhooks) with the same **`Authorization`** value as **`REVENUECAT_WEBHOOK_AUTH`** in backend env.

### Sync EAS build env from your machine

From **`mobile-app/`** (requires `npx eas login`):

```bash
npm run eas:env:sync
```

This copies **`EXPO_PUBLIC_*`** values from **`.env.local`** into EAS **development**, **preview**, and **production** so cloud builds match local. Override **`EXPO_PUBLIC_API_BASE_URL`** in the Expo dashboard for production if you still use an emulator URL locally.

### Play Store `.aab` (signing + package id)

- **Package name** comes from `app.config.ts` → `android.package` (`app.starmapco.com`). You must upload an `.aab` from a **finished** EAS build that includes that config.
- **Signing**: Google Play expects the **upload key** registered for the app. If Play reports a SHA-1 mismatch, either point EAS at the matching keystore (**`credentials.json`** + profile **`play-store-local`**, see `credentials.example.json`) or use Play Console **upload key reset** and follow Google’s steps. See `docs/play-internal-testing-checklist.md` (section 6).
- Build for Play: **`npm run build:play-store`** (uses **`production`** profile, store distribution, app bundle). Then **`npm run download:play-aab`** to save the artifact under `dist/`.

### Download the latest `.aab` to your machine

After a cloud build finishes, pull the newest **preview** Android bundle into **`mobile-app/dist/`** (folder is gitignored):

```bash
npm run download:aab
```

For a **Play / production** profile build (recommended for Play Console uploads):

```bash
npm run download:play-aab
```

Other profiles: `node scripts/download-latest-android-archive.mjs --profile=development`. This avoids `eas build:download`, which can fail on Windows for store `.aab` files.

### Google Sign-In (Android)

1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth **Web application** client. Copy its **client ID** into the mobile app as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (required for ID tokens on Android).
2. Create an OAuth **Android** client with package name `app.starmapco.com` (see `app.config.ts`) and your **debug + release SHA-1** fingerprints (from Play App Signing and EAS upload keystore).
3. On the backend, set **`GOOGLE_SIGNIN_WEB_CLIENT_ID`** to that same Web client ID, **or** set **`GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS`** to a comma-separated list of allowed OAuth client IDs (must include the `aud` value inside the ID token — usually the Web client ID).
4. If you keep secrets in **`star-map-app-final/.env.local.live`**, run the site with **`npm run dev:live`** (loads that file) so Google verification env vars are present locally. Production hosts should inject the same `GOOGLE_*` vars.
5. Run a **development build** (`npx expo prebuild` / EAS) so the Google Sign-In native module is linked; it does not run in Expo Go. For EAS builds, add **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`** under **Environment variables** in the Expo dashboard (or your `eas.json` env), not only in `.env.local`.

## Local setup

1. Ensure `.env.local` exists (see `.env.example`). It must include **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`** (Web OAuth client ID) for Google Sign-In; this is bundled at build/start time.
2. Set `EXPO_PUBLIC_API_BASE_URL` to your backend API URL (e.g. `http://10.0.2.2:3000/api` for Android emulator → host).
3. Install dependencies:

```bash
npm install
```

4. Run checks:

```bash
npm run preflight
npm run lint
npm run typecheck
```

5. Start app:

```bash
npm run android
```

## EAS (Google Play path)

1. Login:

```bash
npx eas login
```

2. Initialize project linkage once:

```bash
npx eas init
```

3. Run preflight before builds:

```bash
npm run preflight
```

4. Create preview build:

```bash
npm run build:preview
```

5. Create production build:

```bash
npm run build:production
```

## Subscription implementation notes

- Use `RevenueCat` as billing abstraction.
- Treat entitlement as server-verified state before unlocking pro-only features.
- Keep free/pro limits enforced in backend APIs (never rely only on client checks).
- Mobile session tokens now proxy to cookie-backed account routes server-side, avoiding cookie transport edge-cases in native clients.
- Configure `REVENUECAT_WEBHOOK_AUTH` in backend env, then set the same Authorization value in RevenueCat webhook settings.
- App currently includes a basic package purchase test flow after billing connect; replace with production paywall UI before launch.

## Security notes

- Never ship secrets in Expo public env vars (`EXPO_PUBLIC_*` values are bundled client-side).
- LLM/provider keys must stay server-side.
- Keep webhook verification and entitlement writes on backend only.
