#!/usr/bin/env node
/** Tier 2.6 — verify ads UTM plumbing + document Google Ads final URL checklist. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const layoutPath = path.join(root, "src/app/layout.tsx");
const layout = fs.readFileSync(layoutPath, "utf8");
if (!layout.includes("UtmAttributionClient")) {
  errors.push("layout.tsx must mount UtmAttributionClient");
}

const weddingAdsUrl =
  "https://starmapco.com/wedding?utm_source=google&utm_medium=cpc&utm_campaign=gift_wedding_2026&utm_content={adgroup}";
const adsRefPath = path.join(root, "docs/ADS_UTM_REFERENCE.md");
const adsRef = fs.readFileSync(adsRefPath, "utf8");
if (!adsRef.includes("gift_wedding_2026") || !adsRef.includes("utm_content")) {
  errors.push("docs/ADS_UTM_REFERENCE.md missing gift_wedding_2026 or utm_content guidance");
}

const unit = spawnSync(
  process.execPath,
  ["--test", "scripts/unit/commerceAnalytics.test.mjs", "scripts/unit/previewSourceHints.test.mjs"],
  { cwd: root, encoding: "utf8" },
);
if (unit.status !== 0) {
  errors.push("UTM-related unit tests failed");
  if (unit.stdout) process.stdout.write(unit.stdout);
  if (unit.stderr) process.stderr.write(unit.stderr);
}

if (errors.length) {
  console.error("Ads UTM hygiene verification failed:");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("Ads UTM hygiene OK (code + tests)");
console.log("");
console.log("Google Ads console — wedding Search final URL must be:");
console.log(weddingAdsUrl);
console.log("");
console.log("GA4 check: sessionManualCampaignName or sessionCampaignName = gift_wedding_2026 after click.");
