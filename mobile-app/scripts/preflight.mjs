import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function mask(value) {
  if (!value) return "(missing)";
  if (value.length <= 12) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
}

const root = resolve(process.cwd());
const mobileEnvPath = resolve(root, ".env.local");
const backendEnvPath = resolve(root, "..", "star-map-app-final", ".env.local.live");
const easPath = resolve(root, "eas.json");

const mobileEnv = parseEnvFile(mobileEnvPath);
const backendEnv = parseEnvFile(backendEnvPath);

const mobileEnvHasSecretKey = Object.values(mobileEnv).some(
  (v) => typeof v === "string" && v.startsWith("sk_"),
);

const appBase = mobileEnv.EXPO_PUBLIC_API_BASE_URL || "";
const appWebClient = mobileEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
const serverWebClient = backendEnv.GOOGLE_SIGNIN_WEB_CLIENT_ID || "";
const serverAllowed = backendEnv.GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS || "";

const appRcAndroid = mobileEnv.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "";

const checks = [
  {
    name: "mobile env does not contain Secret keys (sk_…)",
    ok: !mobileEnvHasSecretKey,
    help:
      "Remove RevenueCat Secret API keys from mobile-app/.env.local. Use EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (public SDK key) only; keep sk_ keys on the server.",
  },
  {
    name: "mobile .env.local exists",
    ok: existsSync(mobileEnvPath),
    help: "Create mobile-app/.env.local from .env.example",
  },
  {
    name: "EXPO_PUBLIC_API_BASE_URL is set",
    ok: Boolean(appBase),
    help: "Set EXPO_PUBLIC_API_BASE_URL in mobile-app/.env.local",
  },
  {
    name: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set",
    ok: Boolean(appWebClient),
    help: "Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in mobile-app/.env.local and EAS env",
  },
  {
    name: "backend GOOGLE_SIGNIN_WEB_CLIENT_ID or GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS is set",
    ok: Boolean(serverWebClient || serverAllowed),
    help: "Set GOOGLE_SIGNIN_WEB_CLIENT_ID (or GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS) on backend env",
  },
  {
    name: "mobile and backend Google Web client IDs match",
    ok: !appWebClient || !serverWebClient || appWebClient === serverWebClient,
    help: "Use the same Web OAuth client ID in app and backend",
  },
  {
    name: "eas.json exists",
    ok: existsSync(easPath),
    help: "Create eas.json and configure preview/production profiles",
  },
];

const failed = checks.filter((c) => !c.ok);

console.log("StarMap mobile preflight");
console.log("-----------------------");
console.log(`App API base: ${appBase || "(missing)"}`);
console.log(`App Google web client: ${mask(appWebClient)}`);
console.log(`Backend Google web client: ${mask(serverWebClient)}`);
console.log(`Backend allowed client IDs configured: ${serverAllowed ? "yes" : "no"}`);
console.log(`RevenueCat public Android key: ${appRcAndroid ? "set" : "not set (needed for IAP / paywalls)"}`);
console.log("");

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}`);
  if (!check.ok) {
    console.log(`      -> ${check.help}`);
  }
}

console.log("");
console.log("Before pushing to Play internal testing:");
console.log("1) Run backend with: npm run dev:live (star-map-app-final)");
console.log("2) Build native APK: npx eas build --platform android --profile preview");
console.log("3) Ensure EAS env includes EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID + EXPO_PUBLIC_API_BASE_URL");
console.log("4) For subscriptions: add EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (public key) to EAS env; run npm run build:dev once for a dev client with Purchases.");
console.log("5) Use matching SHA-1 fingerprints in Google Cloud Android OAuth client.");

if (failed.length) {
  process.exitCode = 1;
}
