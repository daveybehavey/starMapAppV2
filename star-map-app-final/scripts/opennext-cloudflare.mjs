#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildEnvWithWranglerVars } from "./wrangler-vars.mjs";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (!mode || !["build", "deploy", "preview"].includes(mode)) {
    console.error("Usage: node scripts/opennext-cloudflare.mjs <build|deploy|preview>");
    process.exit(1);
  }

  const env = await buildEnvWithWranglerVars(process.cwd());
  run("node", ["scripts/generate-merchant-feed.mjs"], env);

  if (mode === "build") {
    run("npx", ["opennextjs-cloudflare", "build"], env);
    return;
  }

  if (mode === "deploy") {
    run("npx", ["opennextjs-cloudflare", "build"], env);
    run("npx", ["opennextjs-cloudflare", "deploy"], env);
    return;
  }

  run("npx", ["opennextjs-cloudflare", "build"], env);
  run("npx", ["opennextjs-cloudflare", "preview"], env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
