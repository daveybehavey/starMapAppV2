#!/usr/bin/env node

import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

function parseArgs(argv) {
  const minMarginCents = parseNumberEnv("PRINT_MIN_MARGIN_CENTS", 1000);
  const args = {
    shippingChargeUsd: parseNumberEnv("PRINT_STANDARD_SHIPPING_CENTS", 1399) / 100,
    unframedRetailUsd: parseNumberEnv("PRINT_UNFRAMED_PRICE_CENTS", 4900) / 100,
    framedRetailUsd: parseNumberEnv("PRINT_FRAMED_PRICE_CENTS", 9900) / 100,
    digitalAddOnUsd: parseNumberEnv("PRINT_DIGITAL_ADDON_PRICE_CENTS", 700) / 100,
    stripeRate: 0.029,
    stripeFixedUsd: 0.3,
    targetProfitUsd: minMarginCents / 100,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--shipping-charge-usd") {
      args.shippingChargeUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--unframed-retail-usd") {
      args.unframedRetailUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--framed-retail-usd") {
      args.framedRetailUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--digital-addon-usd") {
      args.digitalAddOnUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--stripe-rate") {
      args.stripeRate = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--stripe-fixed-usd") {
      args.stripeFixedUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--target-profit-usd") {
      args.targetProfitUsd = mustNumber(token, next);
      index += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/print-margin-audit.mjs [options]

Options:
  --shipping-charge-usd <n>   Customer shipping charge used in checkout (default from env)
  --unframed-retail-usd <n>   Current/proposed unframed retail price
  --framed-retail-usd <n>     Current/proposed framed retail price
  --digital-addon-usd <n>     Digital add-on price
  --stripe-rate <n>           Stripe percentage fee as decimal (default 0.029)
  --stripe-fixed-usd <n>      Stripe fixed fee in USD (default 0.30)
  --target-profit-usd <n>     Profit target (USD); defaults from PRINT_MIN_MARGIN_CENTS or 1000 cents ($10)
  --json                      Output machine-readable JSON
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function mustNumber(flag, value) {
  if (value == null) throw new Error(`Missing value for ${flag}`);
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number`);
  return parsed;
}

function parseNumberEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseVariantId(raw) {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const CURRENT_UNFRAMED_ID = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED);
const CURRENT_FRAMED_ID = parseVariantId(process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED);

const CANDIDATE_VARIANTS = [
  { id: 14125, group: "unframed", label: "Poster 11x14", recommended: true },
  { id: 1349, group: "unframed", label: "Poster 12x16", recommended: true },
  { id: 4465, group: "unframed", label: "Poster 16x16", recommended: false },
  { id: CURRENT_UNFRAMED_ID, group: "unframed", label: "Poster (current live)", recommended: false },
  { id: 14292, group: "framed", label: "Black framed 11x14", recommended: true },
  { id: 1350, group: "framed", label: "Black framed 12x16", recommended: true },
  { id: 4655, group: "framed", label: "Black framed 16x16", recommended: true },
  { id: CURRENT_FRAMED_ID, group: "framed", label: "Black framed (current live)", recommended: false },
].filter((entry) => Number.isFinite(entry.id) && entry.id > 0);

const RECIPIENTS = {
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
};

async function fetchUsdCadFx() {
  const response = await fetch("https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Bank of Canada FX lookup failed (${response.status})`);
  }
  const data = await response.json();
  const observation = data?.observations?.[0];
  const rate = Number.parseFloat(observation?.FXUSDCAD?.v);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Bank of Canada FX response missing FXUSDCAD");
  }
  return {
    date: observation?.d ?? null,
    usdCad: rate,
  };
}

async function fetchVariant(token, variantId) {
  const response = await fetch(`https://api.printful.com/products/variant/${variantId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.result?.variant) {
    const message = data?.error?.message || data?.error?.reason || `HTTP ${response.status}`;
    throw new Error(`Variant ${variantId} lookup failed: ${message}`);
  }
  return data.result.variant;
}

async function estimateCosts(token, storeId, variantId, recipient) {
  const response = await fetch(`https://api.printful.com/orders/estimate-costs?store_id=${encodeURIComponent(storeId)}`, {
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
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.result?.costs) {
    const message = data?.error?.message || data?.error?.reason || `HTTP ${response.status}`;
    throw new Error(`Estimate for variant ${variantId} failed: ${message}`);
  }
  return data.result.costs;
}

function computeProfit({ retailUsd, shippingChargeUsd, fulfillmentUsd, stripeRate, stripeFixedUsd, digitalAddOnUsd = 0 }) {
  const grossRevenueUsd = retailUsd + shippingChargeUsd + digitalAddOnUsd;
  const stripeFeeUsd = grossRevenueUsd * stripeRate + stripeFixedUsd;
  const profitUsd = grossRevenueUsd - stripeFeeUsd - fulfillmentUsd;
  return {
    grossRevenueUsd: roundMoney(grossRevenueUsd),
    stripeFeeUsd: roundMoney(stripeFeeUsd),
    profitUsd: roundMoney(profitUsd),
  };
}

function requiredRetailUsd({ targetProfitUsd, shippingChargeUsd, fulfillmentUsd, stripeRate, stripeFixedUsd, digitalAddOnUsd = 0 }) {
  const netNonRetailContribution = shippingChargeUsd + digitalAddOnUsd - (shippingChargeUsd + digitalAddOnUsd) * stripeRate;
  const numerator = targetProfitUsd + fulfillmentUsd + stripeFixedUsd - netNonRetailContribution;
  return roundMoney(numerator / (1 - stripeRate));
}

function groupRowsByDestination(rows) {
  return rows.reduce((acc, row) => {
    const key = row.destination;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.PRINTFUL_API_TOKEN?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_TOKEN");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");

  const fx = await fetchUsdCadFx();
  const rows = [];

  for (const candidate of CANDIDATE_VARIANTS) {
    const variant = await fetchVariant(token, candidate.id);
    for (const [country, recipient] of Object.entries(RECIPIENTS)) {
      const costs = await estimateCosts(token, storeId, candidate.id, recipient);
      const fulfillmentUsd = roundMoney(Number(costs.total) / fx.usdCad);
      const retailUsd = candidate.group === "framed" ? args.framedRetailUsd : args.unframedRetailUsd;
      const current = computeProfit({
        retailUsd,
        shippingChargeUsd: args.shippingChargeUsd,
        fulfillmentUsd,
        stripeRate: args.stripeRate,
        stripeFixedUsd: args.stripeFixedUsd,
      });
      const withDigitalAddOn = computeProfit({
        retailUsd,
        shippingChargeUsd: args.shippingChargeUsd,
        fulfillmentUsd,
        stripeRate: args.stripeRate,
        stripeFixedUsd: args.stripeFixedUsd,
        digitalAddOnUsd: args.digitalAddOnUsd,
      });
      rows.push({
        group: candidate.group,
        label: candidate.label,
        variantId: candidate.id,
        recommended: candidate.recommended,
        destination: country,
        size: variant.size,
        printfulBaseUsd: roundMoney(Number(variant.price)),
        fulfillmentCurrency: costs.currency,
        fulfillmentSubtotal: roundMoney(Number(costs.subtotal)),
        fulfillmentShipping: roundMoney(Number(costs.shipping)),
        fulfillmentTax: roundMoney(Number(costs.tax || 0)),
        fulfillmentTotal: roundMoney(Number(costs.total)),
        fulfillmentTotalUsd: fulfillmentUsd,
        currentRetailUsd: retailUsd,
        shippingChargeUsd: args.shippingChargeUsd,
        currentProfitUsd: current.profitUsd,
        currentProfitWithDigitalAddOnUsd: withDigitalAddOn.profitUsd,
        requiredRetailForTargetUsd: requiredRetailUsd({
          targetProfitUsd: args.targetProfitUsd,
          shippingChargeUsd: args.shippingChargeUsd,
          fulfillmentUsd,
          stripeRate: args.stripeRate,
          stripeFixedUsd: args.stripeFixedUsd,
        }),
      });
    }
  }

  const summary = {
    fx,
    assumptions: {
      shippingChargeUsd: args.shippingChargeUsd,
      unframedRetailUsd: args.unframedRetailUsd,
      framedRetailUsd: args.framedRetailUsd,
      digitalAddOnUsd: args.digitalAddOnUsd,
      stripeRate: args.stripeRate,
      stripeFixedUsd: args.stripeFixedUsd,
      targetProfitUsd: args.targetProfitUsd,
    },
    rows,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Print margin audit");
  console.log(`FX source: Bank of Canada USD/CAD ${fx.usdCad} (${fx.date ?? "recent"})`);
  console.log(
    `Assumptions: unframed=${formatMoney(args.unframedRetailUsd)}, framed=${formatMoney(args.framedRetailUsd)}, shipping=${formatMoney(args.shippingChargeUsd)}, digital add-on=${formatMoney(args.digitalAddOnUsd)}, Stripe=${(args.stripeRate * 100).toFixed(1)}% + ${formatMoney(args.stripeFixedUsd)}, target profit=${formatMoney(args.targetProfitUsd)}`,
  );
  console.log("");

  const byDestination = groupRowsByDestination(rows);
  for (const destination of Object.keys(byDestination)) {
    console.log(`${destination} estimates`);
    console.table(
      byDestination[destination]
        .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.group.localeCompare(b.group) || a.fulfillmentTotalUsd - b.fulfillmentTotalUsd)
        .map((row) => ({
          label: row.label,
          group: row.group,
          size: row.size,
          liveRetail: formatMoney(row.currentRetailUsd),
          fulfillment: formatMoney(row.fulfillmentTotalUsd),
          shipping: `${row.fulfillmentShipping.toFixed(2)} ${row.fulfillmentCurrency}`,
          liveProfit: formatMoney(row.currentProfitUsd),
          plusHd: formatMoney(row.currentProfitWithDigitalAddOnUsd),
          requiredForTarget: formatMoney(row.requiredRetailForTargetUsd),
        })),
    );
  }

  const currentLive = rows.filter((row) =>
    (row.group === "unframed" && row.variantId === CURRENT_UNFRAMED_ID) ||
    (row.group === "framed" && row.variantId === CURRENT_FRAMED_ID),
  );
  console.log("Current live SKU snapshot");
  console.table(
    currentLive.map((row) => ({
      destination: row.destination,
      label: row.label,
      retail: formatMoney(row.currentRetailUsd),
      fulfillment: formatMoney(row.fulfillmentTotalUsd),
      profit: formatMoney(row.currentProfitUsd),
      profitWithHd: formatMoney(row.currentProfitWithDigitalAddOnUsd),
      requiredForTarget: formatMoney(row.requiredRetailForTargetUsd),
    })),
  );
}

main().catch((error) => {
  console.error("Print margin audit failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
