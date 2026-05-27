#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildEnvWithWranglerVars } from "./wrangler-vars.mjs";

function writeCaptured(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function runCapture(command, args, env) {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    env,
  });
}

function isRecoverableR2DeployFailure(output) {
  return (
    /Populating R2 incremental cache/i.test(output) &&
    (/403 Forbidden/i.test(output) || /Error uploading/i.test(output))
  );
}

function isRecoverableWindowsWasmDeployFailure(output) {
  return process.platform === "win32" && /\.wasm\?module/i.test(output);
}

function deployWorkerDirect(env, reason) {
  console.warn(reason);
  // Use the project's wrangler (>= 4.94) — OpenNext may invoke an older nested wrangler on Windows.
  run("npx", ["wrangler", "deploy"], { ...env, OPEN_NEXT_DEPLOY: "true" });
}

function runOpenNextBuild(env) {
  // NEXT_PUBLIC_* must be present at build time (inlined into client bundles). Merge wrangler [vars]
  // but keep process.env wins so local .env.local can override for dev-only experiments.
  run("npx", ["opennextjs-cloudflare", "build"], env);
}

function deployBuilt(env) {
  const result = runCapture("npx", ["opennextjs-cloudflare", "deploy"], env);
  writeCaptured(result);

  if (result.status === 0) return;

  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (isRecoverableR2DeployFailure(combined)) {
    deployWorkerDirect(
      env,
      "OpenNext cache population failed against R2. Falling back to direct Worker deploy without cache pre-population.",
    );
    return;
  }
  if (isRecoverableWindowsWasmDeployFailure(combined)) {
    deployWorkerDirect(
      env,
      "OpenNext deploy hit a Windows wrangler WASM path issue. Falling back to direct Worker deploy (use wrangler >= 4.94).",
    );
    return;
  }

  if (process.platform === "win32") {
    deployWorkerDirect(
      env,
      "OpenNext deploy failed on Windows (often empty CLI output). Falling back to direct Worker deploy after build.",
    );
    return;
  }

  throw new Error(`Command failed: npx opennextjs-cloudflare deploy`);
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (!mode || !["build", "deploy", "deploy-built", "preview"].includes(mode)) {
    console.error("Usage: node scripts/opennext-cloudflare.mjs <build|deploy|deploy-built|preview>");
    process.exit(1);
  }

  const env = await buildEnvWithWranglerVars(process.cwd());
  // Production builds use webpack via `next build --webpack` in package.json.
  run("node", ["scripts/generate-merchant-feed.mjs"], env);

  if (mode === "build") {
    runOpenNextBuild(env);
    return;
  }

  if (mode === "deploy") {
    runOpenNextBuild(env);
    deployBuilt(env);
    return;
  }

  if (mode === "deploy-built") {
    deployBuilt(env);
    return;
  }

  runOpenNextBuild(env);
  run("npx", ["opennextjs-cloudflare", "preview"], process.env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
