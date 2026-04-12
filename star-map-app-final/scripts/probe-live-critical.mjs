#!/usr/bin/env node

/**
 * Fast HTTP probes against production (or --site) to catch “home works, rest 500” regressions
 * right after a Worker deploy. Intended to finish in a few seconds.
 */

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_TIMEOUT_MS = 12_000;

const PATHS = [
  ["/", "home"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/editor", "editor"],
  ["/api/premium", "api_premium"],
];

function parseArgs(argv) {
  const args = { site: DEFAULT_SITE, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/probe-live-critical.mjs [--site <origin>] [--timeout-ms <n>]`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }
  return args;
}

function abortable(timeoutMs) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let failed = false;

  for (const [pathname, label] of PATHS) {
    const url = `${args.site}${pathname}`;
    const { signal, done } = abortable(args.timeoutMs);
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal });
      if (res.status !== 200) {
        failed = true;
        console.error(`[FAIL] ${label} ${pathname} — status=${res.status}`);
      } else {
        console.log(`[OK] ${label} ${pathname}`);
      }
    } catch (error) {
      failed = true;
      console.error(`[FAIL] ${label} ${pathname} — ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      done();
    }
  }

  if (failed) {
    console.error("\nLive critical probe failed. If you just deployed, consider: npx wrangler deployments list && npx wrangler rollback <previous-version-id> -y");
    process.exit(1);
  }
}

main();
