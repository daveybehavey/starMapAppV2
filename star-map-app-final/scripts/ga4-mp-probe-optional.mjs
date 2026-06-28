#!/usr/bin/env node
/**
 * Runs ga4-mp-probe when GA4 credentials exist locally; skips otherwise (exit 0).
 * Used by qa:growth-weekly so missing local secrets do not fail the bundle.
 */
import { loadDotenv } from "./load-dotenv.mjs";
import { spawnSync } from "node:child_process";

loadDotenv();

const measurementId = (process.env.NEXT_PUBLIC_GA_ID || "").trim();
const apiSecret = (process.env.GA4_API_SECRET || "").trim();

if (!measurementId || !apiSecret) {
  console.log("ga4-mp-probe: skipped (set NEXT_PUBLIC_GA_ID + GA4_API_SECRET in .env.local to run)");
  process.exit(0);
}

const result = spawnSync("node", ["scripts/ga4-mp-probe.mjs"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
