#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    live: false,
    smoke: false,
    sitemap: "https://starmapco.com/sitemap.xml",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--live") {
      args.live = true;
      continue;
    }
    if (token === "--smoke") {
      args.smoke = true;
      continue;
    }
    if (token === "--sitemap") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --sitemap");
      args.sitemap = next;
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/qa-release-gate.mjs [--smoke] [--live] [--sitemap <url>]

Runs staged release checks.

Default checks:
  - npm run check:env
  - npm run check:static-home
  - npm run lint
  - npx next typegen
  - npx tsc --noEmit
  - npm run build
  - npm run qa:go-no-go

Smoke mode (--smoke) also runs:
  - npm run qa:smoke

Live mode (--live) also runs:
  - npm run qa:printful
  - npm run qa:merchant-feed -- --feed <site>/merchant-feed.xml
  - npm run qa:sitemap-health -- --sitemap <url> --concurrency 8 --timeout-ms 15000
  - npm run qa:funnel-reconcile -- --days 14 (when STRIPE_SECRET_KEY is available)
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function runStep(step, command, args) {
  console.log(`\n[release-gate] ${step}`);
  console.log(`$ ${command} ${args.join(" ")}`.trim());
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${step}`);
  }
}

function merchantFeedUrlFromSitemap(sitemapUrl) {
  try {
    const parsed = new URL(sitemapUrl);
    return `${parsed.origin}/merchant-feed.xml`;
  } catch {
    return "https://starmapco.com/merchant-feed.xml";
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const steps = [
    ["Env check", "npm", ["run", "check:env"]],
    ["Static homepage sync check", "npm", ["run", "check:static-home"]],
    ["Lint", "npm", ["run", "lint"]],
    ["Typegen", "npx", ["next", "typegen"]],
    ["Typecheck", "npx", ["tsc", "--noEmit"]],
    ["Build", "npm", ["run", "build"]],
    ["Go/No-Go", "npm", ["run", "qa:go-no-go"]],
  ];

  if (args.smoke) {
    steps.push(["Playwright smoke suite", "npm", ["run", "qa:smoke"]]);
  }

  if (args.live) {
    const merchantFeedUrl = merchantFeedUrlFromSitemap(args.sitemap);
    steps.push(["Printful verify", "npm", ["run", "qa:printful"]]);
    steps.push([
      "Merchant feed health",
      "npm",
      ["run", "qa:merchant-feed", "--", "--feed", merchantFeedUrl],
    ]);
    steps.push([
      "Live sitemap health",
      "npm",
      [
        "run",
        "qa:sitemap-health",
        "--",
        "--sitemap",
        args.sitemap,
        "--concurrency",
        "8",
        "--timeout-ms",
        "15000",
      ],
    ]);
    if ((process.env.STRIPE_SECRET_KEY || "").trim()) {
      steps.push([
        "Funnel vs Stripe reconciliation",
        "npm",
        ["run", "qa:funnel-reconcile", "--", "--days", "14"],
      ]);
    } else {
      console.warn(
        "[release-gate] Skipping funnel reconciliation: STRIPE_SECRET_KEY not set in current environment.",
      );
    }
  }

  for (const [label, cmd, cmdArgs] of steps) {
    runStep(label, cmd, cmdArgs);
  }

  console.log("\n[release-gate] PASS");
}

try {
  main();
} catch (error) {
  console.error(`\n[release-gate] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
