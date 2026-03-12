#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { basename } from "node:path";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    cwd: process.cwd(),
  });

  if (options.capture) {
    if (result.status !== 0) {
      const stderr = (result.stderr || "").trim();
      throw new Error(stderr || `${cmd} ${args.join(" ")} failed`);
    }
    return (result.stdout || "").trim();
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const args = {
    planOnly: false,
    includeLint: false,
  };

  for (const token of argv) {
    if (token === "--plan") args.planOnly = true;
    if (token === "--lint") args.includeLint = true;
    if (token === "--help" || token === "-h") {
      console.log(`Usage: node scripts/qa-changed.mjs [--plan] [--lint]

Runs only the smoke checks impacted by current local file changes.

Options:
  --plan   Show planned commands without running them
  --lint   Include full lint pass`);
      process.exit(0);
    }
  }

  return args;
}

function collectChangedFiles() {
  const cwdName = basename(process.cwd());
  const normalizePath = (value) => {
    const trimmed = value.trim().replace(/^\.\//, "");
    const prefixed = `${cwdName}/`;
    if (trimmed.startsWith(prefixed)) return trimmed.slice(prefixed.length);
    return trimmed;
  };

  const buckets = [
    ["git", ["diff", "--name-only", "--relative"]],
    ["git", ["diff", "--name-only", "--cached", "--relative"]],
    ["git", ["ls-files", "--others", "--exclude-standard", "--full-name"]],
  ];

  const files = new Set();
  for (const [cmd, args] of buckets) {
    const output = run(cmd, args, { capture: true });
    for (const line of output.split(/\r?\n/)) {
      const normalized = normalizePath(line);
      if (normalized) files.add(normalized);
    }
  }
  return Array.from(files).sort();
}

function touches(files, patterns) {
  return files.some((file) => patterns.some((pattern) => file.startsWith(pattern)));
}

function touchesRegex(files, regexes) {
  return files.some((file) => regexes.some((regex) => regex.test(file)));
}

function buildPlan(files, includeLint) {
  if (files.length === 0) {
    return [];
  }

  const hasCodeChange = touchesRegex(files, [/\.(ts|tsx|js|jsx|mjs|cjs)$/]);
  const touchesPublicUi = files.some((file) => {
    if (!file.startsWith("public/")) return false;
    return !["public/merchant-feed.xml"].includes(file);
  });
  const touchesUi = touches(files, ["src/components/", "src/app/"]) || touchesPublicUi;
  const touchesRender = touches(files, [
    "src/lib/renderSky.ts",
    "src/lib/astronomy.ts",
    "src/components/PreviewCanvas.tsx",
    "src/lib/galleryExamples.ts",
    "src/lib/shapes.ts",
  ]);
  const touchesCommerce = touches(files, [
    "src/app/api/checkout/",
    "src/app/api/stripe/",
    "src/app/api/print/",
    "src/lib/print",
    "src/lib/pricing",
    "src/lib/referral",
    "src/app/success/",
    "src/app/download/",
    "src/components/PaywallModal.tsx",
  ]);
  const touchesMerchant = touches(files, [
    "scripts/generate-merchant-feed.mjs",
    "scripts/merchant-feed-health.mjs",
    "data/printful-shipping.json",
    "public/merchant-feed.xml",
  ]);
  const touchesHomeStatic = files.some((file) =>
    [
      "public/index.html",
      "public/landing.html",
      "src/app/HomeStaticSections.tsx",
      "src/components/HomeOfferStack.tsx",
    ].includes(file),
  );

  const commands = [];
  const push = (cmd) => {
    if (!commands.includes(cmd)) commands.push(cmd);
  };

  if (includeLint) push("npm run lint");
  if (hasCodeChange) push("npx tsc --noEmit");
  if (touchesHomeStatic) push("npm run check:static-home");
  if (touchesUi || touchesHomeStatic) push("npm run check:static-assets");
  if (touchesUi) push("npm run qa:smoke:ui");
  if (touchesRender) push("npm run qa:smoke:render");
  if (touchesCommerce) push("npm run qa:smoke:commerce");
  if (touchesMerchant) {
    push("node scripts/generate-merchant-feed.mjs");
    push("node scripts/merchant-feed-health.mjs --file public/merchant-feed.xml");
  }

  return commands;
}

function runShellCommand(command) {
  const [cmd, ...args] = command.split(" ");
  run(cmd, args);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = collectChangedFiles();
  const plan = buildPlan(files, args.includeLint);

  if (files.length === 0) {
    console.log("No local changes detected. Nothing to run.");
    return;
  }

  console.log(`Changed files (${files.length}):`);
  for (const file of files) console.log(`- ${file}`);
  console.log("");

  if (plan.length === 0) {
    console.log("No mapped QA commands for this change set.");
    console.log("Run full gate manually if needed: npm run qa:release-gate:smoke");
    return;
  }

  console.log("Targeted QA plan:");
  for (const step of plan) console.log(`- ${step}`);
  console.log("");

  if (args.planOnly) {
    return;
  }

  for (const step of plan) {
    console.log(`\n> ${step}`);
    runShellCommand(step);
  }

  console.log("\nTargeted QA complete.");
}

main();
