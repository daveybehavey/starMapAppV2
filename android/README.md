# StarMapCo Android TWA scaffolding (AP1)

Draft scaffolding only. Nothing has been signed, uploaded, submitted or deployed.
The operator's AP1 task is the scope authority; no AP1 issue was found.

## Existing PWA foundation

At main `b12585834e4952fd3bebd7444b7adbb158088461`, the runnable app already has:

- `star-map-app-final/public/site.webmanifest`: StarMapCo names, stable `/` identity,
  standalone display, `/` scope, portrait orientation and brand navy `#050915`.
- PNG icons: `icon-192.png` (192 square), `icon-512.png` (512 square),
  `icon-maskable-512.png` (512 square), `apple-touch-icon.png` (180 square).
- `src/app/layout.tsx` manifest, favicon, Apple icon and viewport theme metadata.
- `src/components/ServiceWorkerRegistration.tsx` registering `/sw.js` in production.

Those files are reused unchanged. PWA installation remains a browser capability
to verify over HTTPS; this source audit does not certify live installability or
offline operation. No renderer, design asset, commerce path or production flag
changes are needed for this scaffold.

The site already has `public/.well-known/assetlinks.json` with a package and a
certificate fingerprint. Its provenance and relationship to Play App Signing
are **unverified**. AP1 preserves it; do not assume it proves ownership or copy
its fingerprint into a new build. `assetlinks.template.json` shows the exact
statement shape with an intentionally invalid, clearly labelled placeholder.
Never serve that placeholder file. The eventual reviewed site file must be at
`https://starmapco.com/.well-known/assetlinks.json`, HTTP 200, JSON content type,
without authentication or redirects. Preserve any separately verified statements.

## TWA configuration

`twa-manifest.template.json` follows Bubblewrap's public manifest fields. The
package `app.starmapco.com` comes from the existing site association and Android
referrer handling; the owner must confirm it is available or already owned in
Play Console before generating the app. If a different package is necessary,
stop for a separate review of existing Android mode/referrer handling.

The Android launch path deliberately uses `/?source=android-app`, matching the
existing Android mode bootstrap. The web manifest's `/?source=pwa` stays unchanged.
Bubblewrap initialization from the web manifest alone would inherit the PWA URL:
the owner must apply the Android override before building. Existing Android mode
contains commerce policy behavior; this task neither modifies nor certifies it.
Any policy gaps require a separate authorized task before publication.

The template supplies no key, password, usable fingerprint or Play API account.
`fingerprints` stays empty until the owner supplies verified certificate data;
the upload keystore path and alias are explicit placeholders. The assetlinks
fingerprint must come from **Play App Signing's app signing certificate**, not
merely the local upload certificate. A locally sideloaded build uses its own
signing certificate and will not verify against a different Play certificate.
Do not add debug certificates to the production site's association file.

No notification delegation, extra trusted origins, shortcuts or billing plugins
are enabled. Leaving the verified origin opens ordinary browser UI as expected.
This is a website wrapper; web application changes continue to come from the
site, while Android metadata/version changes require a new Android build.

## Owner generation workflow (not run by AP1)

Use a separate local working directory, with no production credentials in this
repository. Select and pin a reviewed `@bubblewrap/cli` version and follow its
JDK/Android SDK prerequisites. Do not run these commands with placeholders.

1. Initialize a project from the site's manifest:
   `bubblewrap init --manifest=https://starmapco.com/site.webmanifest`.
   Supply the owner's real package and signing choices in the interactive setup.
2. Compare generated `twa-manifest.json` with this template. Apply its names,
   icon URLs, colours, scope, orientation and Android `startUrl`; retain any
   additional fields required by the pinned CLI. Set the actual upload keystore
   path/alias, verified fingerprints and a version code greater than every prior
   release for that package. Template version 1 is only a proposed first release.
3. Run `bubblewrap update` after editing the generated configuration, then
   `bubblewrap build`. Handle signing passwords locally; never commit them.
   Inspect generated permissions, launcher icons, target SDK and launch URL.
4. Use the owner-controlled testing workflow before any publication. AP1 does
   not execute these commands or authorize a deployment or store submission.

## Exact remaining owner publication checklist

- [ ] Create or select the Google Play developer account; complete identity,
  organization/contact and device verification and any account-specific testing
  requirements shown in Play Console. Confirm rights to the StarMapCo brand/domain.
- [ ] Confirm/reserve `app.starmapco.com` in that account and confirm whether a
  listing/release already exists; choose increasing version codes accordingly.
- [ ] Select a reviewed Bubblewrap CLI version, install its supported JDK/SDK,
  generate the project and apply the Android launch override described above.
- [ ] Create/select and securely back up the owner's upload keystore and alias;
  enroll/select Play App Signing. Keep passwords and private keys outside Git.
- [ ] Obtain the app signing certificate SHA-256 from Play Console's App integrity
  section. Replace the assetlinks template placeholder locally with that value;
  independently verify the existing site's fingerprint before retaining/replacing
  any statement. Include additional signing certificates only when Play's key
  upgrade guidance requires them. No invented or copied OurImprint fingerprints.
- [ ] In a separately approved site change/deployment, publish the verified
  association at the exact HTTPS origin/path above. Check status, content type,
  redirect behavior and Digital Asset Links package/certificate matching.
- [ ] Verify the live HTTPS PWA manifest, all icons and active service worker;
  install through Chrome on Android and Add to Home Screen on iOS. Inspect
  maskable icon cropping and splash screen on real devices. Compare existing
  map design/export output with the approved baseline before release.
- [ ] Build a signed AAB with the current Play target API requirements. Test
  an owner-authorized Play test-track install signed by Play, domain verification
  (no browser toolbar on the verified origin), back navigation, external links,
  slow/offline states and Android-mode persistence. Do not treat a sideloaded
  upload-key APK as proof of Play signing verification.
- [ ] Review the wrapper and the entire reachable website against current Play
  payments/content/privacy policies. Confirm existing Android-mode restrictions
  work; resolve any issues through a separately authorized task, without changing
  commerce in AP1. Complete Data safety based on actual web/native SDK behavior.
- [ ] Prepare the Play listing: title, short/full descriptions, app icon,
  feature graphic, phone screenshots, category, support contact and privacy URL.
  Complete content rating, target audience, ads/app-access declarations and any
  further Console requirements. Use accurate delivery wording.
- [ ] Obtain explicit human release approval, then have the owner upload the
  tested AAB, complete required testing/review and submit/publish via Play Console.
  AP1 remains a draft PR and performs none of those actions.

## Public reference limits

The operator describes OurImprint as a published TWA wrapping its website. That
supports the same high-level structure here: site PWA, Android wrapper and Digital
Asset Links. It does not reveal OurImprint's private Bubblewrap project, signing
keys, certificate ownership, store declarations or release process. Public
configuration retrieval was attempted but failed; no OurImprint implementation
details are asserted or copied.

Field reference inspected: [Bubblewrap TwaManifest source](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/core/src/lib/TwaManifest.ts).
Owner workflow references: [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap),
[TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity/),
[Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started),
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).
Play Console remains authoritative for current account and release requirements.

## Validation

Run `node android/validate-scaffold.mjs` from the repository root. It checks
local PNG dimensions, manifest/metadata wiring and matching wrapper settings.
It does not validate signing, fetch production, generate Android artifacts or
submit anything. See the draft PR for exact commands and results.
