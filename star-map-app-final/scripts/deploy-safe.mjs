#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { buildEnvWithWranglerVars } from "./wrangler-vars.mjs";

function opennextCli(cwd) {
  return path.join(cwd, "node_modules", "@opennextjs", "cloudflare", "dist", "cli", "index.js");
}

function wranglerCli(cwd) {
  return path.join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
}

const TOKEN_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
];

const ENV_FILES_TO_SANITIZE = [
  ".env.local",
  ".env",
];

function printUsage() {
  console.log(`Usage:
  node scripts/deploy-safe.mjs [--auth-only] [--skip-build]

Options:
  --auth-only   Only validate Wrangler auth mode after sanitizing env files
  --skip-build  Skip the OpenNext build step and run deploy only
`);
}

function scrubTokenLines(content) {
  const lines = content.split(/\r?\n/);
  const filtered = lines.filter((line) => !TOKEN_KEYS.some((key) => line.trimStart().startsWith(`${key}=`)));
  const next = filtered.join("\n");
  return next.endsWith("\n") ? next : `${next}\n`;
}

async function sanitizeEnvFiles(rootDir) {
  const backups = [];

  for (const relativePath of ENV_FILES_TO_SANITIZE) {
    const filePath = path.join(rootDir, relativePath);
    let original;
    try {
      original = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const sanitized = scrubTokenLines(original);
    if (sanitized !== original) {
      await fs.writeFile(filePath, sanitized, "utf8");
      backups.push({ filePath, original });
      console.log(`Sanitized ${relativePath} (removed Cloudflare token env entries).`);
    }
  }

  return backups;
}

async function restoreEnvFiles(backups) {
  for (const backup of backups) {
    await fs.writeFile(backup.filePath, backup.original, "utf8");
    console.log(`Restored ${path.basename(backup.filePath)}.`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (!options.capture && result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
  return result;
}

function assertOAuthAuthMode(rootDir) {
  const result = run(process.execPath, [wranglerCli(rootDir), "whoami"], { capture: true });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(combined);

  if (result.status !== 0) {
    throw new Error("Unable to verify Wrangler auth mode.");
  }
  if (/API Token/i.test(combined)) {
    throw new Error(
      "Wrangler is still using an API token. Unset token env vars in your shell, then retry deploy:safe.",
    );
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    printUsage();
    return;
  }

  const authOnly = args.has("--auth-only");
  const skipBuild = args.has("--skip-build");
  const rootDir = process.cwd();

  for (const key of TOKEN_KEYS) {
    delete process.env[key];
  }

  const backups = await sanitizeEnvFiles(rootDir);

  try {
    assertOAuthAuthMode(rootDir);
    if (authOnly) {
      console.log("Auth check passed.");
      return;
    }

    const deployEnv = await buildEnvWithWranglerVars(rootDir);

    if (!skipBuild) {
      run(process.execPath, [opennextCli(rootDir), "build"], { env: deployEnv });
    }
    run("node", ["scripts/opennext-cloudflare.mjs", "deploy-built"], { env: deployEnv });
  } finally {
    await restoreEnvFiles(backups);
  }
}

main().catch((error) => {
  console.error(`deploy-safe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
