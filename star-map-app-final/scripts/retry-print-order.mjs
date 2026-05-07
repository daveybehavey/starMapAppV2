#!/usr/bin/env node

import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

function parseArgs(argv) {
  const args = {
    site: (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").trim().replace(/\/+$/, ""),
    sessionId: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.trim().replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if ((token === "--session" || token === "--session-id") && next) {
      args.sessionId = next.trim();
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/retry-print-order.mjs --session <cs_live_...> [--site <origin>]

Calls the admin retry endpoint for a paid print order.

Required env:
  PRINT_ADMIN_TOKEN
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  if (!args.sessionId) throw new Error("--session is required");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const token = (process.env.PRINT_ADMIN_TOKEN || "").trim();
if (!token) {
  console.error("Missing PRINT_ADMIN_TOKEN");
  process.exit(1);
}

async function fetchStatus() {
  const statusUrl = `${args.site}/api/print/orders/status?session_id=${encodeURIComponent(args.sessionId)}`;
  const res = await fetch(statusUrl, {
    headers: {
      "x-print-admin-token": token,
    },
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

const before = await fetchStatus();
console.log(`Before retry: HTTP ${before.status}`);
console.log(before.text.slice(0, 1200));

const retryUrl = `${args.site}/api/print/orders/retry`;
const res = await fetch(retryUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-print-admin-token": token,
  },
  body: JSON.stringify({ sessionId: args.sessionId }),
});

const text = await res.text().catch(() => "");
if (!res.ok) {
  console.error(`Retry failed: HTTP ${res.status}`);
  console.error(text.slice(0, 2000));
  process.exit(1);
}

console.log(`OK: HTTP ${res.status}`);
console.log(text.slice(0, 2000));

const after = await fetchStatus();
console.log(`After retry: HTTP ${after.status}`);
console.log(after.text.slice(0, 1200));

