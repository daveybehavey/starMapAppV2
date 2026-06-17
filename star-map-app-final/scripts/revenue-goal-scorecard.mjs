#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOAL_CENTS = 1_000_000;
const GOAL_LABEL = "$10,000";
const GOAL_DEADLINE = new Date("2026-12-31T23:59:59.999Z");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    ytdDays: 365,
    runRateDays: 30,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--ytd-days") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--ytd-days must be positive");
      args.ytdDays = Math.min(365, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--run-rate-days") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--run-rate-days must be positive");
      args.runRateDays = Math.min(90, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/revenue-goal-scorecard.mjs [--ytd-days <n>] [--run-rate-days <n>] [--json]

Tracks progress toward ${GOAL_LABEL} production revenue by ${GOAL_DEADLINE.toISOString().slice(0, 10)}.
Uses commerce-digest production revenue (excludes QA-tagged Stripe sessions).

Requires STRIPE_SECRET_KEY (same as commerce-digest).`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function runDigest(days) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, "commerce-digest.mjs"), "--days", String(days), "--json"], {
    cwd: path.join(scriptDir, ".."),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "commerce-digest failed").trim();
    throw new Error(message);
  }
  return JSON.parse(result.stdout);
}

function daysBetween(start, end) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function buildScorecard(ytdDigest, runRateDigest) {
  const now = new Date();
  const ytdCents = Number(ytdDigest?.stripe?.productionTotalRevenueCents || 0);
  const runRateCents = Number(runRateDigest?.stripe?.productionTotalRevenueCents || 0);
  const runRateDays = Number(runRateDigest?.days || 30);
  const runRatePrintOrders = Number(runRateDigest?.stripe?.productionPrintPaidSessions || 0);
  const runRateProductionOrders = Number(runRateDigest?.stripe?.productionPaidSessions || 0);

  const remainingCents = Math.max(0, GOAL_CENTS - ytdCents);
  const daysLeft = daysBetween(now, GOAL_DEADLINE);
  const monthsLeft = daysLeft / 30.4375;

  const dailyRunRate = runRateCents / runRateDays;
  const projectedYearEndCents = ytdCents + dailyRunRate * daysLeft;
  const requiredMonthlyCents = remainingCents / Math.max(monthsLeft, 1);
  const requiredDailyCents = remainingCents / daysLeft;
  const gapMultiplier =
    dailyRunRate > 0 ? requiredDailyCents / dailyRunRate : Number.POSITIVE_INFINITY;

  const avgOrderCents =
    runRateProductionOrders > 0 ? Math.round(runRateCents / runRateProductionOrders) : 0;
  const avgPrintOrderCents =
    runRatePrintOrders > 0
      ? Math.round(Number(runRateDigest?.stripe?.productionPrintRevenueCents || 0) / runRatePrintOrders)
      : 0;
  const ordersNeededPerMonthAtCurrentAov =
    avgOrderCents > 0 ? Math.ceil(requiredMonthlyCents / avgOrderCents) : null;

  const onTrack = projectedYearEndCents >= GOAL_CENTS;
  const pacePct = GOAL_CENTS > 0 ? (projectedYearEndCents / GOAL_CENTS) * 100 : 0;

  return {
    generatedAt: now.toISOString(),
    goal: {
      label: GOAL_LABEL,
      cents: GOAL_CENTS,
      deadline: GOAL_DEADLINE.toISOString().slice(0, 10),
      daysLeft,
    },
    ytd: {
      days: Number(ytdDigest?.days || 0),
      productionRevenueCents: ytdCents,
      productionPaidOrders: Number(ytdDigest?.stripe?.productionPaidSessions || 0),
      productionPrintOrders: Number(ytdDigest?.stripe?.productionPrintPaidSessions || 0),
      marketingSources: ytdDigest?.stripe?.marketingSources || [],
    },
    runRate: {
      days: runRateDays,
      productionRevenueCents: runRateCents,
      productionPaidOrders: runRateProductionOrders,
      productionPrintOrders: runRatePrintOrders,
      avgOrderCents,
      avgPrintOrderCents,
      dailyRevenueCents: Math.round(dailyRunRate),
      monthlyRevenueCents: Math.round(dailyRunRate * 30.4375),
    },
    forecast: {
      projectedYearEndCents: Math.round(projectedYearEndCents),
      pacePct: Number(pacePct.toFixed(1)),
      onTrack,
      remainingCents,
      requiredMonthlyCents: Math.round(requiredMonthlyCents),
      requiredDailyCents: Math.round(requiredDailyCents),
      gapMultiplier: Number.isFinite(gapMultiplier) ? Number(gapMultiplier.toFixed(2)) : null,
      ordersNeededPerMonthAtCurrentAov,
    },
  };
}

function printHuman(scorecard) {
  const { goal, ytd, runRate, forecast } = scorecard;
  console.log("Revenue goal scorecard");
  console.log(`Goal: ${goal.label} production revenue by ${goal.deadline} (${goal.daysLeft} days left)`);
  console.log("");
  console.log("Year-to-date (production, excl. QA)");
  console.log(`  Revenue: ${formatMoney(ytd.productionRevenueCents)}`);
  console.log(`  Orders: ${ytd.productionPaidOrders} (${ytd.productionPrintOrders} print)`);
  if (ytd.marketingSources.length) {
    console.log(
      `  Marketing sources: ${ytd.marketingSources.map((row) => `${row.source}=${row.count}`).join(", ")}`,
    );
  }
  console.log("");
  console.log(`Run rate (last ${runRate.days}d)`);
  console.log(`  Revenue: ${formatMoney(runRate.productionRevenueCents)}`);
  console.log(`  ~${formatMoney(runRate.dailyRevenueCents)}/day · ~${formatMoney(runRate.monthlyRevenueCents)}/month`);
  console.log(
    `  Orders: ${runRate.productionPaidOrders} (avg ${formatMoney(runRate.avgOrderCents)}; print avg ${formatMoney(runRate.avgPrintOrderCents)})`,
  );
  console.log("");
  console.log("Forecast at current pace");
  console.log(`  Projected year-end: ${formatMoney(forecast.projectedYearEndCents)} (${forecast.pacePct}% of goal)`);
  console.log(`  Status: ${forecast.onTrack ? "ON TRACK" : "BEHIND — need more acquisition"}`);
  console.log(
    `  Still need: ${formatMoney(forecast.remainingCents)} → ~${formatMoney(forecast.requiredMonthlyCents)}/mo or ~${formatMoney(forecast.requiredDailyCents)}/day`,
  );
  if (forecast.gapMultiplier != null && Number.isFinite(forecast.gapMultiplier)) {
    console.log(`  Gap vs current pace: ${forecast.gapMultiplier}x revenue run rate`);
  }
  if (forecast.ordersNeededPerMonthAtCurrentAov != null) {
    console.log(`  Orders needed (at current AOV): ~${forecast.ordersNeededPerMonthAtCurrentAov}/month`);
  }
  console.log("");
  console.log("See docs/GOAL_10K_2026.md for channel plan and monthly milestones.");
}

const args = parseArgs(process.argv.slice(2));
const ytdDigest = runDigest(args.ytdDays);
const runRateDigest = args.runRateDays === args.ytdDays ? ytdDigest : runDigest(args.runRateDays);
const scorecard = buildScorecard(ytdDigest, runRateDigest);

if (args.json) {
  console.log(JSON.stringify(scorecard, null, 2));
} else {
  printHuman(scorecard);
}
