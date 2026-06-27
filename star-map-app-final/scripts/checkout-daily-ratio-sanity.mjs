#!/usr/bin/env node

/**
 * Daily checkout funnel ratio check: preview_started, server checkout sessions, and payment_verified.
 * Uses GET /api/analytics/funnel (same KV-backed daily counts as qa:commerce-digest).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWranglerVars } from "./wrangler-vars.mjs";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function tryLoadEnvFile(rel) {
  const full = path.join(appRoot, rel);
  if (!fs.existsSync(full)) return;
  const raw = fs.readFileSync(full, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

tryLoadEnvFile(".env.local");
tryLoadEnvFile(".env");

const wranglerVars = await readWranglerVars(appRoot);
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    days: 7,
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
    if (token === "--days") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--days must be a positive number");
      args.days = Math.min(60, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/checkout-daily-ratio-sanity.mjs [--site <url>] [--days <n>] [--json]

Prints per-UTC-day preview, server Stripe session, and paid ratios from funnel KV (read-only).

Typical cadence: run once daily with --days 7 for a week context, or --days 1 for a fast pulse.

Required env: none for public funnel endpoint when FUNNEL_DASHBOARD_TOKEN is unset on the server.
When the server requires a token, set FUNNEL_DASHBOARD_TOKEN locally (same as qa:commerce-digest).

Optional: NEXT_PUBLIC_SITE_URL / --site to target staging.
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function pct(n, d) {
  if (d <= 0) return null;
  return Number(((n / d) * 100).toFixed(2));
}

async function getFunnelDashboard(site, days) {
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(`${site}/api/analytics/funnel?days=${days}`, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    throw new Error(`Failed to load funnel dashboard (${res.status})`);
  }
  return body.data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = await getFunnelDashboard(args.site, args.days);
  const daily = Array.isArray(data.daily) ? data.daily : [];

  const rows = daily.map((day) => {
    const counts = day.counts || {};
    const preview = Number(counts.preview_started ?? 0);
    const session = Number(counts.checkout_session_created ?? 0);
    const paid = Number(counts.payment_verified ?? 0);
    return {
      date: day.date,
      preview_started: preview,
      checkout_session_created: session,
      payment_verified: paid,
      session_per_preview_pct: pct(session, preview),
      paid_per_preview_pct: pct(paid, preview),
      paid_per_session_pct: pct(paid, session),
    };
  });

  const issues = [];
  for (const row of rows) {
    if (row.payment_verified > row.checkout_session_created) {
      issues.push({
        level: "error",
        date: row.date,
        code: "paid_gt_session",
        detail: `payment_verified (${row.payment_verified}) > checkout_session_created (${row.checkout_session_created})`,
      });
    }
    if (row.checkout_session_created > row.preview_started && row.preview_started > 0) {
      const ratio = row.checkout_session_created / row.preview_started;
      if (ratio > 1.25) {
        issues.push({
          level: "warn",
          date: row.date,
          code: "session_high_vs_preview",
          detail: `checkout_session_created is ${ratio.toFixed(2)}x preview_started (server session volume exceeds preview volume; inspect source/gating alignment)`,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    funnelGeneratedAt: data.generatedAt ?? null,
    rows,
    issues,
    ok: !issues.some((i) => i.level === "error"),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Checkout daily ratio sanity (preview, server session, paid)");
    console.log(`Site: ${report.site}`);
    console.log(`Window: last ${report.days} UTC day(s), funnel snapshot: ${report.funnelGeneratedAt || "unknown"}`);
    console.log("");
    console.log(
      "date       preview  session  paid   session/preview  paid/preview  paid/session",
    );
    for (const row of report.rows) {
      const sp = row.session_per_preview_pct == null ? "n/a" : `${row.session_per_preview_pct}%`;
      const pp = row.paid_per_preview_pct == null ? "n/a" : `${row.paid_per_preview_pct}%`;
      const ps = row.paid_per_session_pct == null ? "n/a" : `${row.paid_per_session_pct}%`;
      console.log(
        `${row.date}  ${String(row.preview_started).padStart(7)}  ${String(row.checkout_session_created).padStart(7)}  ${String(row.payment_verified).padStart(4)}   ${sp.padStart(15)}  ${pp.padStart(12)}  ${ps.padStart(12)}`,
      );
    }
    console.log("");
    if (!report.issues.length) {
      console.log("Sanity: no issues flagged.");
    } else {
      for (const issue of report.issues) {
        console.log(`${issue.level.toUpperCase()} ${issue.date} [${issue.code}]: ${issue.detail}`);
      }
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Checkout daily ratio sanity failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
