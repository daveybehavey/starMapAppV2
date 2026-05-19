/**
 * Downloads the latest FINISHED Android application archive (.aab or .apk) from EAS
 * into ./dist/ (gitignored). Uses the public artifact URL + fetch (avoids eas build:download
 * TAR extraction issues on Windows for store bundles).
 *
 * Usage:
 *   node scripts/download-latest-android-archive.mjs
 *   node scripts/download-latest-android-archive.mjs --profile=preview
 *   node scripts/download-latest-android-archive.mjs --profile=development
 *
 * Requires: npx eas login (same machine), run from mobile-app/.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a === name || a.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return true;
  return hit.slice(prefix.length);
}

const profile = argValue("--profile", "preview");

const list = spawnSync(
  "npx",
  ["eas", "build:list", "--platform", "android", "--limit", "50", "--json", "--non-interactive"],
  { cwd: root, encoding: "utf8", shell: true, env: process.env },
);

if (list.status !== 0) {
  process.stderr.write(list.stderr || list.stdout || "eas build:list failed\n");
  process.exit(list.status ?? 1);
}

const stdout = (list.stdout || "").trim();
let builds;
try {
  builds = JSON.parse(stdout);
} catch {
  process.stderr.write(
    "Could not parse eas JSON. If you see eas-cli banners above, try upgrading eas-cli or run:\n  npx eas build:list --platform android --limit 5 --json --non-interactive > builds.json\n",
  );
  process.exit(1);
}

const finished = builds.filter(
  (b) =>
    b.status === "FINISHED" &&
    (b.artifacts?.applicationArchiveUrl || b.artifacts?.buildUrl) &&
    (!profile || b.buildProfile === profile),
);

if (!finished.length) {
  process.stderr.write(
    `No FINISHED Android builds found${profile ? ` with profile "${profile}"` : ""}. Run a build first or pick another --profile.\n`,
  );
  process.exit(1);
}

finished.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
const pick = finished[0];
const url = pick.artifacts.applicationArchiveUrl || pick.artifacts.buildUrl;
const lower = url.toLowerCase();
const ext = lower.endsWith(".apk") ? "apk" : "aab";
const fileName = `starmap-android-${pick.buildProfile}-${pick.appVersion}-v${pick.appBuildVersion}-${pick.id}.${ext}`;
const outDir = path.join(root, "dist");
const dest = path.join(outDir, fileName);

await fs.mkdir(outDir, { recursive: true });
process.stdout.write(`Downloading ${url}\n  -> ${dest}\n`);

const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  process.stderr.write(`HTTP ${res.status} ${res.statusText}\n`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
await fs.writeFile(dest, buf);
process.stdout.write(`OK (${buf.length} bytes)\n`);
