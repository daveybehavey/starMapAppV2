#!/usr/bin/env node
/** Verify print margin guard env + unit tests (Tier 1.5). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "wrangler.toml");
const wrangler = fs.readFileSync(wranglerPath, "utf8");

function readTomlValue(key) {
  const match = wrangler.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? null;
}

const enabled = readTomlValue("PRINT_MARGIN_GUARD_ENABLED");
const minMargin = Number.parseInt(readTomlValue("PRINT_MIN_MARGIN_CENTS") ?? "0", 10);
const errors = [];

if (!/^(true|1|yes)$/i.test(String(enabled ?? ""))) {
  errors.push("PRINT_MARGIN_GUARD_ENABLED is not true in wrangler.toml");
}
if (!Number.isFinite(minMargin) || minMargin <= 0) {
  errors.push("PRINT_MIN_MARGIN_CENTS must be > 0 in wrangler.toml");
}

const unit = spawnSync(process.execPath, ["--test", "scripts/unit/printMargin.test.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (unit.status !== 0) {
  errors.push("printMargin unit tests failed");
  if (unit.stdout) process.stdout.write(unit.stdout);
  if (unit.stderr) process.stderr.write(unit.stderr);
}

if (errors.length) {
  console.error("Print margin guard verification failed:");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("Print margin guard OK");
console.log(`- PRINT_MARGIN_GUARD_ENABLED=${enabled}`);
console.log(`- PRINT_MIN_MARGIN_CENTS=${minMargin}`);
