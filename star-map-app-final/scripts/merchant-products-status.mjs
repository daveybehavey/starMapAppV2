#!/usr/bin/env node

import process from "node:process";
import {
  seedEnv,
  getMerchantAccountId,
  getMerchantTargetCountries,
  loadShippingMap,
  writeJsonReport,
} from "./merchant-shipping-common.mjs";
import { merchantApiRequest } from "./merchant-api.mjs";

const EXPECTED_PRINT_OFFERS = ["print_poster_unframed", "print_poster_framed"];
const REQUIRED_PROGRAMS = ["free-listings", "shopping-ads"];
const REQUIRED_CONTEXTS = ["FREE_LISTINGS", "SHOPPING_ADS"];

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

function getProgramKey(name) {
  return String(name || "").split("/").pop() || "";
}

function dedupeCountries(countries) {
  return Array.from(
    new Set(
      (countries || [])
        .map((country) => String(country || "").trim().toUpperCase())
        .filter((country) => /^[A-Z]{2}$/.test(country)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function pushCheck(checks, status, label, detail) {
  checks.push({ status, label, detail });
}

function printCheck(check) {
  const prefix =
    check.status === "pass" ? "PASS" :
    check.status === "warn" ? "WARN" :
    check.status === "fail" ? "FAIL" :
    "INFO";
  console.log(`[${prefix}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
}

function buildDestinationMap(product) {
  const map = new Map();
  for (const status of product?.productStatus?.destinationStatuses || []) {
    const context = String(status.reportingContext || "").trim();
    if (!context) continue;
    map.set(context, dedupeCountries(status.approvedCountries || []));
  }
  return map;
}

function summarizeOffer(offerId, products) {
  const standard = products.filter((product) => !product.legacyLocal);
  const local = products.filter((product) => Boolean(product.legacyLocal));
  const sample = standard[0] || local[0] || null;
  const destinationMap = buildDestinationMap(sample);
  return {
    offerId,
    records: products.length,
    standardRecords: standard.length,
    localRecords: local.length,
    approvedContexts: Array.from(destinationMap.keys()).sort((a, b) => a.localeCompare(b)),
    approvedCountriesByContext: Object.fromEntries(destinationMap.entries()),
    dataSource: sample?.dataSource || "",
    title: sample?.productAttributes?.title || "",
    link: sample?.productAttributes?.link || "",
    price: sample?.productAttributes?.price || null,
    shippingLabel: sample?.productAttributes?.shippingLabel || "",
    lastUpdateDate: sample?.productStatus?.lastUpdateDate || "",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await seedEnv();

  const shippingMap = loadShippingMap();
  const targetCountries = getMerchantTargetCountries(shippingMap);
  const accountId = getMerchantAccountId();

  const [productsResponse, programsResponse] = await Promise.all([
    merchantApiRequest(`products/v1/accounts/${accountId}/products?pageSize=250`),
    merchantApiRequest(`accounts/v1/accounts/${accountId}/programs`),
  ]);

  const products = Array.isArray(productsResponse?.products) ? productsResponse.products : [];
  const programs = Array.isArray(programsResponse?.programs) ? programsResponse.programs : [];

  const productGroups = new Map();
  for (const product of products) {
    const offerId = String(product.offerId || "").trim();
    if (!offerId) continue;
    if (!productGroups.has(offerId)) {
      productGroups.set(offerId, []);
    }
    productGroups.get(offerId).push(product);
  }

  const programMap = new Map(programs.map((program) => [getProgramKey(program.name), program]));
  const offerSummaries = EXPECTED_PRINT_OFFERS.map((offerId) =>
    summarizeOffer(offerId, productGroups.get(offerId) || []),
  );

  const checks = [];

  pushCheck(checks, "info", "Merchant account", accountId);
  pushCheck(checks, "info", "Target countries", targetCountries.join(", "));
  pushCheck(checks, "info", "Processed product records", String(products.length));

  for (const programKey of REQUIRED_PROGRAMS) {
    const program = programMap.get(programKey);
    if (!program) {
      pushCheck(checks, "fail", `Program present: ${programKey}`, "missing from Merchant API");
      continue;
    }

    const state = String(program.state || "").trim();
    pushCheck(
      checks,
      state === "ENABLED" ? "pass" : state === "ELIGIBLE" ? "warn" : "fail",
      `Program state: ${programKey}`,
      state || "unknown",
    );

    const unmetRequirements = Array.isArray(program.unmetRequirements) ? program.unmetRequirements : [];
    if (unmetRequirements.length) {
      const titles = unmetRequirements.map((requirement) => requirement.title).filter(Boolean).join(", ");
      pushCheck(checks, "info", `Program unmet requirements: ${programKey}`, titles || "present");
    }
  }

  for (const offer of offerSummaries) {
    pushCheck(
      checks,
      offer.standardRecords > 0 ? "pass" : "fail",
      `Offer present in standard listings: ${offer.offerId}`,
      offer.standardRecords > 0 ? `${offer.standardRecords} record(s)` : "missing",
    );

    pushCheck(
      checks,
      offer.localRecords > 0 ? "pass" : "warn",
      `Offer present in local listings: ${offer.offerId}`,
      offer.localRecords > 0 ? `${offer.localRecords} record(s)` : "missing",
    );

    for (const context of REQUIRED_CONTEXTS) {
      const approvedCountries = dedupeCountries(offer.approvedCountriesByContext?.[context] || []);
      if (!approvedCountries.length) {
        pushCheck(checks, "fail", `${offer.offerId} approved for ${context}`, "missing");
        continue;
      }

      const missingCountries = targetCountries.filter((country) => !approvedCountries.includes(country));
      pushCheck(
        checks,
        missingCountries.length === 0 ? "pass" : "fail",
        `${offer.offerId} approved countries for ${context}`,
        missingCountries.length === 0
          ? approvedCountries.join(", ")
          : `missing ${missingCountries.join(", ")}; approved ${approvedCountries.join(", ")}`,
      );
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  const summary =
    failed.length === 0
      ? "Merchant account has both print offers present and approved in the target countries."
      : "Merchant account is not fully ready. Fix failed checks first.";

  const report = {
    accountId,
    targetCountries,
    expectedOfferIds: EXPECTED_PRINT_OFFERS,
    summary,
    checks,
    programs: programs.map((program) => ({
      key: getProgramKey(program.name),
      state: program.state || "",
      activeRegionCodes: dedupeCountries(program.activeRegionCodes || []),
      unmetRequirements: Array.isArray(program.unmetRequirements)
        ? program.unmetRequirements.map((requirement) => ({
            title: requirement.title || "",
            affectedRegionCodes: dedupeCountries(requirement.affectedRegionCodes || []),
          }))
        : [],
    })),
    offers: offerSummaries,
  };

  const reportPath = writeJsonReport("reports/merchant-products-status.json", report);

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2));
    process.stdout.write("\n");
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log("Merchant products status");
  console.log("");
  for (const check of checks) {
    printCheck(check);
  }
  console.log("");
  for (const offer of offerSummaries) {
    console.log(`${offer.offerId}`);
    console.log(`  title: ${offer.title || "n/a"}`);
    console.log(`  standard records: ${offer.standardRecords}`);
    console.log(`  local records: ${offer.localRecords}`);
    console.log(`  contexts: ${offer.approvedContexts.join(", ") || "none"}`);
    console.log(`  link: ${offer.link || "n/a"}`);
    console.log(`  shipping label: ${offer.shippingLabel || "n/a"}`);
    if (offer.lastUpdateDate) {
      console.log(`  last update: ${offer.lastUpdateDate}`);
    }
    console.log("");
  }
  console.log(`Report written: ${reportPath}`);
  console.log(`Summary: ${summary}`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
