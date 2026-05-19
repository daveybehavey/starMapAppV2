# Play Internal Testing Checklist

Use this before uploading your first Android build to Play Console internal testing.

## 1) Config + env parity

- [ ] `mobile-app/.env.local` has `EXPO_PUBLIC_API_BASE_URL`
- [ ] `mobile-app/.env.local` has `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- [ ] Backend env has `GOOGLE_SIGNIN_WEB_CLIENT_ID` or `GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS`
- [ ] App + backend use the same Web client ID for Google ID token `aud` checks
- [ ] Run `npm run preflight` in `mobile-app` and resolve all FAIL lines

## 2) Google OAuth setup

- [ ] Google Cloud OAuth Web client created
- [ ] Google Cloud OAuth Android client uses package `app.starmapco.com`
- [ ] Android client has debug SHA-1 (for local/dev)
- [ ] Android client has release/Play App Signing SHA-1 (for Play-distributed app)

## 3) Build + install

- [ ] Backend started with `npm run dev:live` (if using `.env.local.live`)
- [ ] For **Play Console** uploads, use a **production** EAS build (store distribution), not preview: `npm run build:play-store`
- [ ] If Play says **wrong signing key**, use `play-store-local` with a keystore whose SHA-1 matches Play’s **upload key** (see section 6 below), or reset the upload key in Play Console
- [ ] `npm run build:preview` still works for internal / non-Play testing

## 4) Manual smoke flow

- [ ] Open app and sign in via Google
- [ ] `Account` tab shows sessions + premium state from `/api/account/mobile/state`
- [ ] `Generate` creates a map and returns a map id
- [ ] Upgrade flow opens RevenueCat offerings
- [ ] Restore purchases path runs without crash

## 5) Play console readiness

- [ ] Internal testers added
- [ ] Privacy policy URL set
- [ ] Data safety form drafted
- [ ] Account deletion path documented (support + backend cleanup)

## 6) Android signing (Play “wrong key”)

Play compares the **upload certificate SHA-1** on the app to the cert used to sign your `.aab`.

1. **Play Console** → **Release** → **Setup** → **App integrity** → copy **Upload key certificate** SHA-1.
2. **Expo** → project → **Credentials** → Android → note the keystore SHA-1 for the profile you build with (`production` for `npm run build:play-store`).
3. If they **differ** and you **have** the original upload keystore: copy `credentials.example.json` → `credentials.json`, put the `.jks` / `.keystore` under `mobile-app/secrets/` (gitignored), fill passwords/alias, then run **`npm run build:play-store:local`** and upload that `.aab`.
4. If they **differ** and you **do not** have the keystore: use Play’s **Request upload key reset** flow, then either register Expo’s current cert or build with a new keystore Play instructs you to use.
5. Confirm **`app.config.ts`** has `android.package: "app.starmapco.com"` and bump **`android.versionCode`** whenever Play rejects a duplicate version.
