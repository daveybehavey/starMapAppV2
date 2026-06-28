#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildEnvWithWranglerVars } from "./wrangler-vars.mjs";

function psSingleQuote(value) {
  // PowerShell single-quote escaping: ' becomes '' inside a single-quoted string.
  return `'${String(value).replace(/'/g, "''")}'`;
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

function runNpx(npxArgs, env) {
  // On some Windows setups, `npx` is exposed primarily as `npx.ps1`.
  // `spawnSync('npx', ...)` can fail with ENOENT; invoking through PowerShell works.
  if (process.platform === "win32") {
    const psCommand = `npx ${npxArgs.map(psSingleQuote).join(" ")}`;
    run("powershell", ["-NoProfile", "-Command", psCommand], env);
    return;
  }
  run("npx", npxArgs, env);
}

function runNpxCapture(npxArgs, env) {
  if (process.platform === "win32") {
    const psCommand = `npx ${npxArgs.map(psSingleQuote).join(" ")}`;
    return runCapture("powershell", ["-NoProfile", "-Command", psCommand], env);
  }
  return runCapture("npx", npxArgs, env);
}

function isRecoverableR2DeployFailure(output) {
  return (
    /Populating R2 incremental cache/i.test(output) &&
    (/403 Forbidden/i.test(output) || /Error uploading/i.test(output))
  );
}

function deployWorkerDirect(env) {
  console.warn(
    "OpenNext cache population failed against R2. Falling back to direct Worker deploy without cache pre-population.",
  );
  runNpx(["wrangler", "deploy"], { ...env, OPEN_NEXT_DEPLOY: "true" });
}

function deployBuilt(env) {
  const result = runNpxCapture(["opennextjs-cloudflare", "deploy"], env);
  writeCaptured(result);

  if (result.status === 0) return;

  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (isRecoverableR2DeployFailure(combined)) {
    deployWorkerDirect(env);
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
    runNpx(["opennextjs-cloudflare", "build"], env);
    return;
  }

  if (mode === "deploy") {
    runNpx(["opennextjs-cloudflare", "build"], env);
    deployBuilt(env);
    return;
  }

  if (mode === "deploy-built") {
    deployBuilt(env);
    return;
  }

  runNpx(["opennextjs-cloudflare", "build"], env);
  runNpx(["opennextjs-cloudflare", "preview"], env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
