#!/usr/bin/env node

import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";

loadDotenv();

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    hours: 168,
    limit: 40,
    minChargeCents: Number.parseInt(process.env.PRINT_MIN_CHARGE_CENTS || "100", 10),
    strict: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--site") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --site");
      args.site = next;
      i += 1;
      continue;
    }
    if (token === "--hours") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--hours must be a positive number");
      args.hours = Math.floor(next);
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--limit must be a positive number");
      args.limit = Math.min(200, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--min-charge-cents") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next < 0) throw new Error("--min-charge-cents must be >= 0");
      args.minChargeCents = Math.floor(next);
      i += 1;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/print-ops-report.mjs [--site <url>] [--hours <n>] [--limit <n>] [--min-charge-cents <n>] [--strict] [--json]

Reports recent print checkout sessions from Stripe and cross-checks print order status through:
  GET /api/print/orders/status?session_id=...
Manual fulfillment (KV): POST /api/print/orders/resolve with admin token.

Required env vars:
  STRIPE_SECRET_KEY
  PRINT_ADMIN_TOKEN
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  if (!Number.isFinite(args.minChargeCents) || args.minChargeCents < 0) {
    args.minChargeCents = 100;
  }
  return args;
}

function toIso(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString();
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  if (name.length <= 2) return `*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function hasPrintShippingConfig() {
  return Boolean(
    process.env.STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD?.trim() ||
      process.env.PRINT_STANDARD_SHIPPING_CENTS?.trim(),
  );
}

async function fetchUsdCadFx() {
  const response = await fetch("https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const observation = data?.observations?.[0];
  const rate = Number.parseFloat(observation?.FXUSDCAD?.v);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

function convertAmount(value, fromCurrency, toCurrency, usdCad) {
  const amount = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(amount)) return null;
  const from = String(fromCurrency || "").toUpperCase();
  const to = String(toCurrency || "").toUpperCase();
  if (!from || !to) return null;
  if (from === to) return amount;
  if (!usdCad) return null;
  if (from === "CAD" && to === "USD") return amount / usdCad;
  if (from === "USD" && to === "CAD") return amount * usdCad;
  return null;
}

function computeStripeFee(total, currency) {
  const cents = Number(total || 0);
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  const amount = cents / 100;
  const fixed = String(currency || "").toUpperCase() === "CAD" ? 0.4 : 0.3;
  return amount * 0.029 + fixed;
}

async function fetchPrintfulOrderCost(printfulOrderId) {
  const token = process.env.PRINTFUL_API_TOKEN?.trim() || "";
  const storeId = process.env.PRINTFUL_STORE_ID?.trim() || "";
  if (!token || !printfulOrderId) return null;

  const url = new URL(`https://api.printful.com/orders/${encodeURIComponent(printfulOrderId)}`);
  if (storeId) url.searchParams.set("store_id", storeId);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const result = data?.result ?? null;
  const costs = result?.costs ?? null;
  if (!costs || typeof costs.total !== "string" || typeof costs.currency !== "string") {
    return null;
  }

  return {
    status: typeof result?.status === "string" ? result.status : "",
    total: costs.total,
    subtotal: typeof costs.subtotal === "string" ? costs.subtotal : "",
    shipping: typeof costs.shipping === "string" ? costs.shipping : "",
    currency: costs.currency,
  };
}

async function loadPrintSessions(stripe, args) {
  const createdGte = Math.floor(Date.now() / 1000) - args.hours * 60 * 60;
  const sessions = [];
  let startingAfter = undefined;

  while (sessions.length < args.limit) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of page.data) {
      const metadata = session.metadata ?? {};
      const orderType = String(metadata.orderType || metadata.order_type || "").trim().toLowerCase();
      const hasPrintVariant = Boolean(metadata.printVariant || metadata.print_variant);
      if (orderType === "print" || hasPrintVariant) {
        sessions.push(session);
      }
      if (sessions.length >= args.limit) break;
    }

    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return sessions;
}

async function fetchStatus(site, adminToken, sessionId) {
  const url = `${site}/api/print/orders/status?session_id=${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    headers: {
      "x-print-admin-token": adminToken,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (res.status === 404) {
    return { ok: false, status: "missing", details: "No KV print record" };
  }
  if (!res.ok || !body?.ok) {
    const msg = body?.error || `HTTP ${res.status}`;
    return { ok: false, status: "error", details: String(msg) };
  }

  const order = body.order ?? {};
  return {
    ok: true,
    status: String(order.status || "unknown"),
    attempts: Number(order.attempts || 0),
    error: order.error ? String(order.error) : "",
    printfulOrderId: order.printfulOrderId ? String(order.printfulOrderId) : "",
    sentAt: order.sentAt ? new Date(order.sentAt).toISOString() : "",
    operatorAlertedAt: order.operatorAlertedAt ? new Date(order.operatorAlertedAt).toISOString() : "",
    operatorAlertProvider: order.operatorAlertProvider ? String(order.operatorAlertProvider) : "",
    operatorAlertError: order.operatorAlertError ? String(order.operatorAlertError) : "",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!adminToken) throw new Error("Missing PRINT_ADMIN_TOKEN");

  const stripe = new Stripe(stripeSecret);
  const usdCad = await fetchUsdCadFx();
  const sessions = await loadPrintSessions(stripe, args);

  const rows = [];
  const counts = {
    sent: 0,
    pending: 0,
    failed: 0,
    missing: 0,
    error: 0,
    unpaid: 0,
    unknown: 0,
  };
  const anomalies = {
    sentBelowMinCharge: 0,
    sentNegativeMargin: 0,
  };

  for (const session of sessions) {
    const sessionId = session.id;
    const isPaidSession = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!isPaidSession) {
      counts.unpaid += 1;
      rows.push({
        sessionId,
        created: toIso(session.created),
        amount: session.amount_total ?? 0,
        currency: (session.currency || "").toUpperCase(),
        email: maskEmail(session.customer_details?.email || session.customer_email || ""),
        paid: session.payment_status,
        status: "unpaid",
        attempts: "",
        printfulOrderId: "",
        error: "",
        sentAt: "",
        operatorAlertedAt: "",
        operatorAlertProvider: "",
        operatorAlertError: "",
      });
      continue;
    }

    const status = await fetchStatus(args.site, adminToken, sessionId);
    const statusLabel = status.status in counts ? status.status : "unknown";
    counts[statusLabel] += 1;
    const printfulCosts =
      status.printfulOrderId && status.status === "sent" ? await fetchPrintfulOrderCost(status.printfulOrderId) : null;

    const amountCents = Number(session.amount_total ?? 0);
    const estimatedMargin =
      status.status === "sent"
        ? (() => {
            const gross = Number(amountCents) / 100;
            const fee = computeStripeFee(amountCents, session.currency || "USD");
            const fulfillment = convertAmount(
              printfulCosts?.total ?? "",
              printfulCosts?.currency ?? "",
              session.currency || "USD",
              usdCad,
            );
            if (!Number.isFinite(gross) || fulfillment == null) return null;
            return gross - fee - fulfillment;
          })()
        : null;

    if (status.status === "sent" && amountCents < args.minChargeCents) {
      anomalies.sentBelowMinCharge += 1;
    }
    if (status.status === "sent" && typeof estimatedMargin === "number" && estimatedMargin < 0) {
      anomalies.sentNegativeMargin += 1;
    }

    rows.push({
      sessionId,
      created: toIso(session.created),
      amount: amountCents,
      currency: (session.currency || "").toUpperCase(),
      email: maskEmail(session.customer_details?.email || session.customer_email || ""),
      paid: session.payment_status,
      status: status.status,
      attempts: status.attempts ?? "",
      printfulOrderId: status.printfulOrderId ?? "",
      printfulCostTotal: printfulCosts?.total ?? "",
      printfulCostCurrency: printfulCosts?.currency ?? "",
      printfulCostShipping: printfulCosts?.shipping ?? "",
      printfulCostStatus: printfulCosts?.status ?? "",
      estimatedStripeFee:
        status.status === "sent" ? computeStripeFee(session.amount_total ?? 0, session.currency || "USD") : null,
      estimatedMargin,
      error: status.error || status.details || "",
      sentAt: status.sentAt || "",
      operatorAlertedAt: status.operatorAlertedAt || "",
      operatorAlertProvider: status.operatorAlertProvider || "",
      operatorAlertError: status.operatorAlertError || "",
    });
  }

  const report = {
    site: args.site,
    hours: args.hours,
    limit: args.limit,
    minChargeCents: args.minChargeCents,
    strict: args.strict,
    scannedPrintSessions: rows.length,
    counts,
    anomalies,
    rows,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Print operations report");
  console.log(`Site: ${report.site}`);
  console.log(`Window: last ${report.hours} hours`);
  console.log(`Scanned print sessions: ${report.scannedPrintSessions}`);
  console.log(`Minimum accepted paid print charge: ${report.minChargeCents} cents`);
  console.log(
    `Status counts -> sent=${counts.sent} pending=${counts.pending} failed=${counts.failed} missing=${counts.missing} error=${counts.error} unpaid=${counts.unpaid}`,
  );
  console.log(
    `Anomalies -> sentBelowMinCharge=${anomalies.sentBelowMinCharge} sentNegativeMargin=${anomalies.sentNegativeMargin}`,
  );
  if (usdCad) {
    console.log(`FX reference -> USD/CAD ${usdCad.toFixed(4)}`);
  }
  if (!hasPrintShippingConfig()) {
    console.log("Warning: no print shipping charge is configured. Current print prices may be absorbing fulfillment shipping.");
  }

  if (!rows.length) {
    console.log("No print checkout sessions found in this window.");
    return;
  }

  console.table(
    rows.map((row) => ({
      sessionId: row.sessionId.slice(0, 18),
      created: row.created.slice(0, 19).replace("T", " "),
      amount: `${(Number(row.amount || 0) / 100).toFixed(2)} ${row.currency || "USD"}`,
      paid: row.paid,
      status: row.status,
      attempts: row.attempts,
      printfulOrderId: row.printfulOrderId,
      printfulCost: row.printfulCostTotal ? `${row.printfulCostTotal} ${row.printfulCostCurrency}` : "",
      estMargin:
        typeof row.estimatedMargin === "number" ? `${row.estimatedMargin.toFixed(2)} ${row.currency || "USD"}` : "",
      alert: row.operatorAlertedAt ? `${row.operatorAlertProvider || "sent"} @ ${row.operatorAlertedAt.slice(0, 19).replace("T", " ")}` : row.operatorAlertError ? `failed: ${row.operatorAlertError.slice(0, 32)}` : "",
      error: row.error ? row.error.slice(0, 80) : "",
    })),
  );

  if (args.strict && (anomalies.sentBelowMinCharge > 0 || anomalies.sentNegativeMargin > 0)) {
    console.error(
      `Strict mode failed: ${anomalies.sentBelowMinCharge} sent orders below min charge, ${anomalies.sentNegativeMargin} sent orders with negative estimated margin.`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Print operations report failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
