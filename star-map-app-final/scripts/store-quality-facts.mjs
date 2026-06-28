#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedEnv, loadShippingMap, getMerchantTargetCountries, getMerchantCurrency } from "./merchant-shipping-common.mjs";

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    help: argv.includes("-h") || argv.includes("--help"),
  };
}

function printHelp() {
  console.log(`Usage: node scripts/store-quality-facts.mjs [--json]

Prints the factual shipping + returns inputs we publish and/or recommend for Merchant Center Store Quality.
`);
}

function readReturnsPolicySummary() {
  const contentPath = resolve(process.cwd(), "src", "app", "returns", "ReturnsContent.tsx");
  const raw = readFileSync(contentPath, "utf8");

  return {
    physicalPrints: {
      changeOfMind: "not accepted once production has started",
      damageDefectWindowDays: 7,
      returnCost: "customer_paid",
    },
    sourceFile: contentPath,
    hasSupportEmail: raw.includes("support@starmapco.com"),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Published Printful guidance: average fulfillment time (before shipment) 2–5 business days.
  const fulfillment = {
    minBusinessDays: 2,
    maxBusinessDays: 5,
    note: "Fulfillment time excludes carrier transit time.",
  };

  const shipFrom = {
    note:
      "Merchant Center may restrict the countries available for ship-from locations. If restricted, pick USA and use conservative handling times.",
    handlingTime: {
      maxBusinessDays: 5,
      fulfillmentDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      cutoffSuggestionLocalTime: "12:00",
    },
  };

  const returns = readReturnsPolicySummary();

  const shippingMap = loadShippingMap();
  const targetCountries = getMerchantTargetCountries(shippingMap);
  const currency = getMerchantCurrency();

  const result = {
    generatedAt: new Date().toISOString(),
    fulfillment,
    shipFrom,
    returns,
    merchantFeed: {
      currency,
      targetCountries,
      shippingLabels: ["print_unframed", "print_framed", "print_framed_hd_free"],
      freeShipping: {
        thresholdCents: parseInt(process.env.PRINT_FREE_SHIPPING_THRESHOLD_CENTS || "10000", 10),
        qualifyingExample: "Framed print + HD digital ($106 merchandise)",
        merchantFeedBundleId: "print_poster_framed_hd_bundle",
      },
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Store Quality facts (copy/paste safe):");
  console.log(`- Fulfillment (handling) time: ${fulfillment.minBusinessDays}-${fulfillment.maxBusinessDays} business days (average)`);
  console.log(`- Return cost (prints): customer-paid for change-of-mind; damage/defect claims within ${returns.physicalPrints.damageDefectWindowDays} days`);
  console.log(`- Feed countries: ${targetCountries.join(", ")}`);
  console.log(`- Feed shipping labels: print_unframed, print_framed, print_framed_hd_free`);
  console.log(`- Free shipping: merchandise $100+ at checkout; GMC bundle print_poster_framed_hd_bundle ships at $0`);
  console.log("");
  console.log("Suggested Merchant Center ship-from location values:");
  console.log(`- Max handling time: ${shipFrom.handlingTime.maxBusinessDays} business days`);
  console.log(`- Fulfillment days: ${shipFrom.handlingTime.fulfillmentDays.join(", ")}`);
  console.log(`- Cutoff time: ${shipFrom.handlingTime.cutoffSuggestionLocalTime} (local time)`);
}

seedEnv()
  .then(main)
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

