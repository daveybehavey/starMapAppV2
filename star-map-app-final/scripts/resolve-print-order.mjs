#!/usr/bin/env node

import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://starmapco.com",
    sessionId: "",
    printfulOrderId: undefined,
    provider: undefined,
    note: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--session" && next) {
      args.sessionId = next.trim();
      i += 1;
      continue;
    }
    if ((token === "--printful" || token === "--printful-order-id") && next) {
      const n = next.trim();
      args.printfulOrderId = /^\d+$/.test(n) ? Number.parseInt(n, 10) : n;
      i += 1;
      continue;
    }
    if (token === "--provider" && next) {
      args.provider = next.trim();
      i += 1;
      continue;
    }
    if (token === "--note" && next) {
      args.note = next.trim();
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/resolve-print-order.mjs --session <cs_...> [--printful <id>] [--provider manual_printful|manual_other] [--note "..."] [--site <url>]

Requires PRINT_ADMIN_TOKEN in env (.env.local).`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.PRINT_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("PRINT_ADMIN_TOKEN is required");
  if (!args.sessionId) throw new Error("--session required");

  const body = {
    sessionId: args.sessionId,
    ...(args.printfulOrderId !== undefined ? { printfulOrderId: args.printfulOrderId } : {}),
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.note ? { note: args.note } : {}),
  };

  const res = await fetch(`${args.site}/api/print/orders/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-print-admin-token": token,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
