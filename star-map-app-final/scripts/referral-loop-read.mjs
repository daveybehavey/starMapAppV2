#!/usr/bin/env node
/** Tier 2.7 — referral loop read from commerce digest (14d default). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const days = Number.parseInt(process.argv.find((a, i) => process.argv[i - 1] === "--days") ?? "14", 10);

const digestRun = spawnSync(
  process.execPath,
  [path.join(scriptDir, "commerce-digest.mjs"), "--days", String(days), "--json"],
  { cwd: path.join(scriptDir, ".."), encoding: "utf8", env: process.env },
);

if (digestRun.status !== 0) {
  console.error((digestRun.stderr || digestRun.stdout || "commerce-digest failed").trim());
  process.exit(digestRun.status ?? 1);
}

const digest = JSON.parse(digestRun.stdout);
const paidSessions = Number(digest?.stripe?.productionPaidSessions ?? digest?.stripe?.paidSessions ?? 0);
const referralPaid = Array.isArray(digest?.stripe?.referralPaidSources)
  ? digest.stripe.referralPaidSources.reduce((sum, row) => sum + Number(row?.count || 0), 0)
  : 0;
const sharePct = paidSessions > 0 ? (referralPaid / paidSessions) * 100 : 0;
const topVariant = Array.isArray(digest?.stripe?.referralOfferVariants)
  ? digest.stripe.referralOfferVariants.slice().sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))[0]
  : null;

console.log("Referral loop read");
console.log(`Window: last ${days} days`);
console.log(`Paid sessions: ${paidSessions}`);
console.log(`Paid referral sessions: ${referralPaid} (${sharePct.toFixed(2)}% of paid)`);
if (topVariant) {
  console.log(`Top offer variant: ${topVariant.variant} (${topVariant.count})`);
}

if (referralPaid === 0) {
  console.log("");
  console.log("Read: referral UI is live but loop is not converting yet.");
  console.log("Next: share CTAs on /success + /download; do not raise incentive until abuse controls reviewed.");
} else if (sharePct < 5) {
  console.log("");
  console.log("Read: early referral signal — keep monitoring before scaling incentive tests.");
} else {
  console.log("");
  console.log("Read: referral contributing — consider offer variant test per social-referral-campaign-playbook.md.");
}
