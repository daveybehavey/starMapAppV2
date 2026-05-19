/**
 * Runs Maestro store-screenshots flow using repo-local CLI when present (.tools/maestro).
 * Usage: node scripts/run-store-screenshots.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const maestroBat = path.join(root, ".tools", "maestro", "bin", "maestro.bat");
const flow = path.join(root, "maestro", "store-screenshots.yaml");
const outDir = path.join(root, "assets", "store-screenshots", "raw");

const exe = process.platform === "win32" && fs.existsSync(maestroBat) ? maestroBat : "maestro";
const args =
  process.platform === "win32" && fs.existsSync(maestroBat)
    ? ["test", flow, "--test-output-dir", outDir]
    : ["test", flow, "--test-output-dir", outDir];

const r = spawnSync(exe, args, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: process.env.MAESTRO_CLI_NO_ANALYTICS ?? "1" },
});

process.exit(r.status ?? 1);
