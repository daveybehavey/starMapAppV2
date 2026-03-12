#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const PRINTFUL_API_BASE = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim();

const COUNTRY_RECIPIENTS = {
  US: {
    name: "StarMapCo Test",
    address1: "123 Main St",
    city: "Chapel Hill",
    state_code: "NC",
    country_code: "US",
    zip: "27514",
  },
  CA: {
    name: "StarMapCo Test",
    address1: "123 Main St",
    city: "Toronto",
    state_code: "ON",
    country_code: "CA",
    zip: "M5V 2T6",
  },
  GB: {
    name: "StarMapCo Test",
    address1: "10 Downing St",
    city: "London",
    state_code: "",
    country_code: "GB",
    zip: "SW1A 2AA",
  },
};

function parseArgs(argv) {
  const args = {
    countries: ["US", "CA", "GB"],
    output: "docs/upsell-rollout-matrix.md",
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--countries") {
      if (!next) throw new Error("Missing value for --countries");
      args.countries = next
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value));
      i += 1;
      continue;
    }
    if (token === "--output") {
      if (!next) throw new Error("Missing value for --output");
      args.output = next;
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/generate-upsell-rollout-matrix.mjs [options]

Options:
  --countries US,CA,GB   Country codes to score (default: US,CA,GB)
  --output <path>        Markdown output path (default: docs/upsell-rollout-matrix.md)
  --json                 Print JSON summary
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  if (args.countries.length === 0) {
    throw new Error("No valid countries passed to --countries");
  }

  return args;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpToNine(value) {
  const ceiled = Math.ceil(value);
  const endings = [9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 109, 129, 149];
  for (const ending of endings) {
    if (ending >= ceiled) return ending;
  }
  return Math.ceil(ceiled / 10) * 10 - 1;
}

function getStripeFeeConfig() {
  const percent = Number.parseFloat((process.env.PRINT_MARGIN_STRIPE_PERCENT || "0.029").trim());
  const fixedCents = Number.parseInt((process.env.PRINT_MARGIN_STRIPE_FIXED_CENTS || "30").trim(), 10);
  return {
    percent: Number.isFinite(percent) ? percent : 0.029,
    fixedUsd: Number.isFinite(fixedCents) ? fixedCents / 100 : 0.3,
  };
}

async function fetchUsdCadRate() {
  const response = await fetch("https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`FX lookup failed (${response.status})`);
  const payload = await response.json();
  const observation = payload?.observations?.[0];
  const rate = Number.parseFloat(observation?.FXUSDCAD?.v);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX lookup missing USD/CAD rate");
  return { usdCad: rate, date: observation?.d || null };
}

function toUsd(amount, currency, usdCad) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 0;
  const normalized = String(currency || "USD").trim().toUpperCase();
  if (normalized === "USD") return value;
  if (normalized === "CAD") return value / usdCad;
  // Store currently returns CAD; keep safe fallback for unexpected currencies.
  return value;
}

async function printfulGet(path, token) {
  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code !== 200) {
    throw new Error(`Printful GET ${path} failed (${response.status})`);
  }
  return payload.result;
}

async function estimatePrintfulCost({ token, storeId, variantId, recipient }) {
  const response = await fetch(
    `${PRINTFUL_API_BASE}/orders/estimate-costs?store_id=${encodeURIComponent(storeId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        recipient,
        items: [{ variant_id: variantId, quantity: 1 }],
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code !== 200 || !payload?.result?.costs) {
    const reason =
      payload?.error?.message ||
      payload?.error?.reason ||
      payload?.result ||
      `HTTP ${response.status}`;
    throw new Error(`Variant ${variantId} estimate failed: ${String(reason).slice(0, 200)}`);
  }
  return payload.result.costs;
}

function requiredProductPriceUsd({ totalCostUsd, shippingUsd, targetMarginUsd, stripePercent, stripeFixedUsd }) {
  // (product + shipping)*(1-stripePercent) - stripeFixed - totalCost = targetMargin
  return ((targetMarginUsd + stripeFixedUsd + totalCostUsd) / (1 - stripePercent)) - shippingUsd;
}

function marginAtProposedPriceUsd({ productPriceUsd, shippingUsd, totalCostUsd, stripePercent, stripeFixedUsd }) {
  const revenue = productPriceUsd + shippingUsd;
  const stripeFee = revenue * stripePercent + stripeFixedUsd;
  return revenue - stripeFee - totalCostUsd;
}

function classifyCandidate({ bundleOnly, allMeetTarget, fit }) {
  if (bundleOnly) return "bundle_only";
  if (!allMeetTarget) return "reprice_before_launch";
  if (fit === "high") return "launch_ready";
  return "test_limited";
}

function markdownTable(rows) {
  const lines = [];
  lines.push("| SKU | Variant | Target margin | Proposed | Worst-country required | Worst-country projected | Action |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.variantId} | $${row.targetMarginUsd.toFixed(2)} | $${row.proposedPriceUsd.toFixed(2)} | $${row.worstRequiredUsd.toFixed(2)} | $${row.worstProjectedMarginUsd.toFixed(2)} | ${row.action} |`,
    );
  }
  return lines.join("\n");
}

function marketTable(rows, countries) {
  const headers = [
    "SKU",
    ...countries.flatMap((country) => [`${country} cost`, `${country} ship`, `${country} req`, `${country} projected`]),
  ];
  const lines = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const row of rows) {
    const parts = [row.label];
    for (const country of countries) {
      const market = row.markets[country];
      if (!market) {
        parts.push("-", "-", "-", "-");
        continue;
      }
      parts.push(
        `$${market.totalCostUsd.toFixed(2)}`,
        `$${market.shippingUsd.toFixed(2)}`,
        `$${market.requiredPriceUsd.toFixed(2)}`,
        `$${market.projectedMarginUsd.toFixed(2)}`,
      );
    }
    lines.push(`| ${parts.join(" | ")} |`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = (process.env.PRINTFUL_API_TOKEN || "").trim();
  const storeId = (process.env.PRINTFUL_STORE_ID || "").trim();
  if (!token) throw new Error("Missing PRINTFUL_API_TOKEN");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");

  const candidatesPath = resolve(process.cwd(), "data", "upsell-candidates.json");
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"));
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("data/upsell-candidates.json is empty");
  }

  const { usdCad, date } = await fetchUsdCadRate();
  const { percent: stripePercent, fixedUsd: stripeFixedUsd } = getStripeFeeConfig();

  const results = [];
  for (const candidate of candidates) {
    const variantId = Number(candidate.variantId);
    if (!Number.isFinite(variantId) || variantId <= 0) continue;

    const variant = await printfulGet(`/products/variant/${variantId}`, token);
    const markets = {};

    for (const country of args.countries) {
      const recipient = COUNTRY_RECIPIENTS[country];
      if (!recipient) continue;
      try {
        const costs = await estimatePrintfulCost({ token, storeId, variantId, recipient });
        const totalCostUsd = toUsd(costs.total, costs.currency, usdCad);
        const shippingUsd = toUsd(costs.shipping, costs.currency, usdCad);
        const requiredPriceUsd = requiredProductPriceUsd({
          totalCostUsd,
          shippingUsd,
          targetMarginUsd: Number(candidate.targetMarginUsd || 0),
          stripePercent,
          stripeFixedUsd,
        });
        const projectedMarginUsd = marginAtProposedPriceUsd({
          productPriceUsd: Number(candidate.proposedPriceUsd || 0),
          shippingUsd,
          totalCostUsd,
          stripePercent,
          stripeFixedUsd,
        });

        markets[country] = {
          totalCostUsd: roundMoney(totalCostUsd),
          shippingUsd: roundMoney(shippingUsd),
          requiredPriceUsd: roundMoney(requiredPriceUsd),
          projectedMarginUsd: roundMoney(projectedMarginUsd),
          sourceCurrency: String(costs.currency || "CAD").toUpperCase(),
        };
      } catch (error) {
        markets[country] = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const marketRows = Object.values(markets).filter((value) => typeof value.error !== "string");
    if (marketRows.length === 0) {
      results.push({
        ...candidate,
        variantId,
        variantName: variant?.variant?.name || null,
        action: "blocked",
        markets,
        allMeetTarget: false,
        worstRequiredUsd: Number.NaN,
        worstProjectedMarginUsd: Number.NaN,
        suggestedGlobalPriceUsd: null,
      });
      continue;
    }

    const worstRequiredUsd = Math.max(...marketRows.map((value) => value.requiredPriceUsd));
    const worstProjectedMarginUsd = Math.min(...marketRows.map((value) => value.projectedMarginUsd));
    const allMeetTarget = marketRows.every((value) => value.projectedMarginUsd >= Number(candidate.targetMarginUsd || 0));
    const action = classifyCandidate({
      bundleOnly: Boolean(candidate.bundleOnly),
      allMeetTarget,
      fit: String(candidate.fit || "medium").toLowerCase(),
    });
    results.push({
      ...candidate,
      variantId,
      variantName: variant?.variant?.name || null,
      action,
      markets,
      allMeetTarget,
      worstRequiredUsd: roundMoney(worstRequiredUsd),
      worstProjectedMarginUsd: roundMoney(worstProjectedMarginUsd),
      suggestedGlobalPriceUsd: roundUpToNine(worstRequiredUsd + 2),
    });
  }

  const sorted = [...results].sort((a, b) => {
    const rank = (item) => {
      if (item.action === "launch_ready") return 0;
      if (item.action === "test_limited") return 1;
      if (item.action === "reprice_before_launch") return 2;
      if (item.action === "bundle_only") return 3;
      return 4;
    };
    return rank(a) - rank(b);
  });

  const markdown = [
    "# Upsell Rollout Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Countries scored: ${args.countries.join(", ")}`,
    `FX (USD/CAD): ${usdCad.toFixed(4)}${date ? ` as of ${date}` : ""}`,
    "",
    "## Executive summary",
    "",
    markdownTable(sorted),
    "",
    "Action labels:",
    "- `launch_ready`: margin target met in all scored countries and fit is high.",
    "- `test_limited`: margin target met, but fit is medium so launch should be staged.",
    "- `reprice_before_launch`: margin target missed at proposed price in at least one scored country.",
    "- `bundle_only`: do not launch standalone; allow only as checkout add-on.",
    "- `blocked`: could not price due to variant/options/shipping errors.",
    "",
    "## Per-country margin detail (USD)",
    "",
    marketTable(sorted, args.countries),
    "",
  ].join("\n");

  const outputPath = resolve(process.cwd(), args.output);
  writeFileSync(outputPath, markdown, "utf8");

  console.log(`Generated ${outputPath}`);
  if (args.json) {
    console.log(JSON.stringify({ countries: args.countries, usdCad, results: sorted }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
