/**
 * Pushes selected EXPO_PUBLIC_* vars from .env.local to EAS (development, preview, production).
 * Requires: npx eas login, and run from mobile-app/.
 *
 * Note: EXPO_PUBLIC_API_BASE_URL may need a production HTTPS URL for store builds;
 * emulator URLs only work on emulators.
 */

const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function parseEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

const env = parseEnv(envPath);
const keys = [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
];
for (const opt of ["EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID"]) {
  if (env[opt]?.trim()) keys.push(opt);
}

const environments = ["development", "preview", "production"];

let failed = false;
for (const name of keys) {
  const value = env[name]?.trim();
  if (!value) {
    console.warn(`Skip ${name} (empty in .env.local)`);
    continue;
  }
  const visibility = name.includes("REVENUECAT") ? "sensitive" : "plaintext";
  const args = [
    "eas",
    "env:create",
    "--name",
    name,
    "--value",
    value,
    "--non-interactive",
    "--force",
    "--visibility",
    visibility,
    "--type",
    "string",
    ...environments.flatMap((e) => ["--environment", e]),
  ];
  const r = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`Failed: ${name}`);
    failed = true;
  } else {
    console.log(`OK ${name} → ${environments.join(", ")}`);
  }
}

if (failed) {
  process.exit(1);
}
