#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";
import dotenv from "dotenv";
import { readWranglerVars } from "./wrangler-vars.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
  timeout: 20_000,
});

const DEFAULT_TRACKER_PATH = "docs/promo-offer-tracker.csv";

function parseArgs(argv) {
  const args = {
    days: 14,
    tracker: DEFAULT_TRACKER_PATH,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--days" && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("--days must be a positive integer");
      args.days = Math.min(90, parsed);
      i += 1;
      continue;
    }
    if (token === "--tracker" && next) {
      args.tracker = next;
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(`Usage: node scripts/promo-offer-report.mjs [--days <n>] [--tracker <csv>] [--json]

Summarizes live promo-offer health by combining:
  - docs/promo-offer-tracker.csv
  - Stripe promotion code status
  - recent StarMapCo checkout session usage
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

async function readTrackerRows(trackerPath) {
  const fullPath = path.resolve(process.cwd(), trackerPath);
  const raw = await fs.readFile(fullPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
  });
}

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUpper(value) {
  return normalizeValue(value).toUpperCase();
}

function belongsToStarMap(session) {
  const metadata = session.metadata || {};
  return Boolean(
    metadata.plan ||
      metadata.order_type ||
      metadata.orderType ||
      metadata.print_variant ||
      metadata.printVariant ||
      metadata.map_id ||
      session.client_reference_id,
  );
}

function isPaidCheckoutSession(session) {
  const paymentStatus = normalizeValue(session.payment_status).toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

function isRevenuePositivePaidSession(session) {
  return isPaidCheckoutSession(session) && Number(session.amount_total || 0) > 0;
}

async function findPromotionCodeByCode(code) {
  const list = await stripe.promotionCodes.list({
    code,
    limit: 20,
    expand: ["data.coupon"],
  });
  return (
    list.data.find((item) => normalizeUpper(item.code) === code) ??
    null
  );
}

async function loadSessions(days) {
  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  let startingAfter;
  const sessions = [];

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...page.data.filter((session) => belongsToStarMap(session)));
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return sessions;
}

async function resolvePromotionCodeLabelsById(sessions) {
  const promotionCodeIds = [...new Set(
    sessions
      .map((session) => normalizeValue(session.metadata?.promotion_code_id))
      .filter(Boolean),
  )];
  const labels = new Map();

  await Promise.all(
    promotionCodeIds.map(async (promotionCodeId) => {
      try {
        const promotionCode = await stripe.promotionCodes.retrieve(promotionCodeId);
        const code = normalizeUpper(promotionCode.code);
        if (code) {
          labels.set(promotionCodeId, code);
        }
      } catch (error) {
        console.error("Promotion code retrieve failed for offer report", { promotionCodeId, error });
      }
    }),
  );

  return labels;
}

function summarizeSessionsForCode(sessions, code, promotionCodeLabelsById) {
  let sessionsCount = 0;
  let paidSessions = 0;
  let revenuePaidSessions = 0;
  let revenueCents = 0;

  for (const session of sessions) {
    const metadata = session.metadata || {};
    const sessionCode =
      normalizeUpper(metadata.promotion_code) ||
      normalizeUpper(promotionCodeLabelsById.get(normalizeValue(metadata.promotion_code_id)));
    if (sessionCode !== code) continue;
    sessionsCount += 1;
    if (isPaidCheckoutSession(session)) {
      paidSessions += 1;
    }
    if (isRevenuePositivePaidSession(session)) {
      revenuePaidSessions += 1;
      revenueCents += Math.max(0, Number(session.amount_total || 0));
    }
  }

  return {
    sessions: sessionsCount,
    paidSessions,
    revenuePaidSessions,
    revenueCents,
  };
}

function formatMoney(cents, currency = "usd") {
  if (!Number.isFinite(cents)) return "0";
  const code = String(currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

async function buildReport(args) {
  const trackerRows = await readTrackerRows(args.tracker);
  const sessions = await loadSessions(args.days);
  const promotionCodeLabelsById = await resolvePromotionCodeLabelsById(sessions);

  const rows = await Promise.all(
    trackerRows.map(async (row) => {
      const code = normalizeUpper(row.offer_code);
      const promotion = code ? await findPromotionCodeByCode(code) : null;
      const sessionSummary = code
        ? summarizeSessionsForCode(sessions, code, promotionCodeLabelsById)
        : { sessions: 0, paidSessions: 0, revenuePaidSessions: 0, revenueCents: 0 };
      const coupon = promotion && typeof promotion.coupon !== "string" ? promotion.coupon : null;
      const maxRedemptions = Number(promotion?.max_redemptions || coupon?.max_redemptions || 0);
      const timesRedeemed = Number(promotion?.times_redeemed || 0);
      const remainingRedemptions =
        maxRedemptions > 0 ? Math.max(0, maxRedemptions - timesRedeemed) : null;

      return {
        code,
        channel: row.channel || "unknown",
        scope: row.scope || "unknown",
        status: row.status || "unknown",
        trackerLandingUrl: row.landing_url || "",
        promotionExists: Boolean(promotion),
        active: Boolean(promotion?.active),
        couponValid: coupon ? coupon.valid !== false : null,
        promotionCodeId: promotion?.id || null,
        couponId: coupon?.id || null,
        percentOff: typeof coupon?.percent_off === "number" ? coupon.percent_off : null,
        maxRedemptions,
        timesRedeemed,
        remainingRedemptions,
        expiresAt:
          typeof promotion?.expires_at === "number" && Number.isFinite(promotion.expires_at)
            ? new Date(promotion.expires_at * 1000).toISOString()
            : null,
        sessions: sessionSummary.sessions,
        paidSessions: sessionSummary.paidSessions,
        revenuePaidSessions: sessionSummary.revenuePaidSessions,
        revenueCents: sessionSummary.revenueCents,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    days: args.days,
    trackerPath: args.tracker,
    rows,
  };
}

function printHumanReport(report) {
  console.log("Promo offer report");
  console.log(`Window: last ${report.days} days`);
  console.log(`Tracker: ${report.trackerPath}`);
  console.log("");

  if (!report.rows.length) {
    console.log("No tracker rows found.");
    return;
  }

  for (const row of report.rows) {
    console.log(`${row.code} (${row.channel})`);
    console.log(
      `  tracker=${row.status} stripe=${row.promotionExists ? (row.active ? "active" : "inactive") : "missing"} scope=${row.scope}`,
    );
    console.log(
      `  redeemed=${row.timesRedeemed}${row.maxRedemptions > 0 ? `/${row.maxRedemptions}` : ""}` +
        `${row.remainingRedemptions !== null ? ` remaining=${row.remainingRedemptions}` : ""}`,
    );
    console.log(
      `  sessions=${row.sessions} paid=${row.paidSessions} revenue-paid=${row.revenuePaidSessions} revenue=${formatMoney(row.revenueCents)}`,
    );
    if (row.expiresAt) {
      console.log(`  expires=${row.expiresAt}`);
    }
    if (row.trackerLandingUrl) {
      console.log(`  landing=${row.trackerLandingUrl}`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));

buildReport(args)
  .then((report) => {
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printHumanReport(report);
  })
  .catch((error) => {
    console.error("Promo offer report failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
