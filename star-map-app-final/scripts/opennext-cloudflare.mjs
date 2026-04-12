#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { buildEnvWithWranglerVars } from "./wrangler-vars.mjs";

function opennextCli(cwd) {
  return path.join(cwd, "node_modules", "@opennextjs", "cloudflare", "dist", "cli", "index.js");
}

function wranglerCli(cwd) {
  return path.join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
}

function writeCaptured(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
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

function deployWorkerDirect(cwd, env) {
  console.warn(
    "OpenNext cache population failed against R2. Falling back to direct Worker deploy without cache pre-population.",
  );
  run(process.execPath, [wranglerCli(cwd), "deploy"], { ...env, OPEN_NEXT_DEPLOY: "true" });
}

function deployBuilt(cwd, env) {
  const result = runCapture(process.execPath, [opennextCli(cwd), "deploy"], env);
  writeCaptured(result);

  if (result.status === 0) return;

  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (isRecoverableR2DeployFailure(combined)) {
    deployWorkerDirect(cwd, env);
    return;
  }

  throw new Error(`Command failed: opennextjs-cloudflare deploy`);
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (!mode || !["build", "deploy", "deploy-built", "preview"].includes(mode)) {
    console.error("Usage: node scripts/opennext-cloudflare.mjs <build|deploy|deploy-built|preview>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const env = await buildEnvWithWranglerVars(cwd);
  run("node", ["scripts/generate-merchant-feed.mjs"], env);

  if (mode === "build") {
    run(process.execPath, [opennextCli(cwd), "build"], env);
    return;
  }

  if (mode === "deploy") {
    run(process.execPath, [opennextCli(cwd), "build"], env);
    deployBuilt(cwd, env);
    return;
  }

  if (mode === "deploy-built") {
    deployBuilt(cwd, env);
    return;
  }

  run(process.execPath, [opennextCli(cwd), "build"], env);
  run(process.execPath, [opennextCli(cwd), "preview"], env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
