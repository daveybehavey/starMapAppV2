# Maestro — Play listing screenshots

Produces PNGs under `assets/store-screenshots/raw/` (via `--test-output-dir`).

## Prerequisites

1. [Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro) on your PATH **or** use the repo-local install at `mobile-app/.tools/maestro/bin/maestro.bat` (created by downloading [maestro.zip](https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip) into `.tools/` — folder is gitignored).
2. **Temurin JDK 17+** (`JAVA_HOME`) — Maestro requires Java.
3. Android SDK **platform-tools** (`adb`) on your PATH.
4. An **Android emulator** or device with a **dev / preview / screenshots** build installed (`appId: app.starmapco.com`).

### EAS builds: unset `EAS_NO_VCS`

If your shell has **`EAS_NO_VCS=1`**, EAS ignores the **repo root** `.easignore` and uploads a huge archive (and builds can fail). From PowerShell before `eas build`:

`Remove-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue`

Then run `eas build` from `mobile-app/` as usual.

### RevenueCat + emulator

Preview/production builds that call `Purchases.configure` with a **test** public key often show RevenueCat’s **“Wrong API Key”** dialog on the emulator’s simulated store; tapping **OK** can **exit the app**, which breaks Maestro.

**Recommended:** run an internal build with the EAS profile **`screenshots`** (sets `EXPO_PUBLIC_SKIP_REVENUECAT_STARTUP=1`, APK output), install the APK, then run `npm run screenshots:store`.

```bash
npm run build:screenshots
# After the build finishes, download the APK and adb install -r <path>.apk
```

## Run

From `mobile-app/`:

```bash
npm run screenshots:store
```

Start an emulator (or plug in a device) first. Only one device should be connected.

## Phone vs tablet / Chromebook

Use the same flow on different AVD profiles (phone 1080×1920, 7" tablet, 10" tablet, desktop-with-touch for Chromebook). Re-run `npm run screenshots:store` after switching the active device so filenames match the form factor you need, or duplicate the YAML with different `path` prefixes if you want one session per profile.
