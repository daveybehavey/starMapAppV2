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

/**
 * Keep in sync with sanitizePrintOrderForOperatorResponse in src/lib/printOrders.ts.
 * Status/retry APIs already redact phone; this is defense-in-depth for terminal/job logs.
 */
function redactPrintOrderApiResponseText(text) {
  if (typeof text !== "string" || !text) return text;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.order || typeof parsed.order !== "object") {
      return text;
    }
    const order = parsed.order;
    const hasCheckoutPhone = Boolean(
      (typeof order.customerPhone === "string" && order.customerPhone.trim()) ||
        (typeof order.shippingDetails?.phone === "string" && order.shippingDetails.phone.trim()) ||
        order.hasCheckoutPhone === true,
    );
    const { customerPhone: _customerPhone, shippingDetails, ...rest } = order;
    let safeShippingDetails = shippingDetails ?? null;
    if (shippingDetails && typeof shippingDetails === "object") {
      const { phone: _phone, ...shippingRest } = shippingDetails;
      safeShippingDetails = shippingRest;
    }
    return JSON.stringify({
      ...parsed,
      order: {
        ...rest,
        shippingDetails: safeShippingDetails,
        hasCheckoutPhone,
      },
    });
  } catch {
    return text
      .replace(/"customerPhone"\s*:\s*"[^"]*"/g, '"customerPhone":"[redacted]"')
      .replace(/"phone"\s*:\s*"[^"]*"/g, '"phone":"[redacted]"');
  }
}

function logResponseBody(label, status, text) {
  console.log(`${label}: HTTP ${status}`);
  console.log(redactPrintOrderApiResponseText(text).slice(0, 2000));
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
logResponseBody("Before retry", before.status, before.text);

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
  console.error(redactPrintOrderApiResponseText(text).slice(0, 2000));
  process.exit(1);
}

logResponseBody("OK", res.status, text);

const after = await fetchStatus();
logResponseBody("After retry", after.status, after.text);
