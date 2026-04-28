#!/usr/bin/env node

import {
  seedEnv,
  loadShippingMap,
  getMerchantCurrency,
  getMerchantTargetCountries,
  getMerchantServicePrefix,
  buildManagedShippingServices,
  writeJsonReport,
} from "./merchant-shipping-common.mjs";
import { MerchantApiError, getShippingSettings } from "./merchant-api.mjs";

function parseArgs(argv) {
  return {
    country: "",
    help: argv.includes("-h") || argv.includes("--help"),
  };
}

function printHelp() {
  console.log(`Usage: node scripts/merchant-shipping-verify.mjs [--country CA]

Verifies Merchant Center shipping services cover every target country for both labels:
  - print_unframed
  - print_framed

Requires Merchant API credentials (same as merchant:shipping:apply).`);
}

function readArgValue(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return "";
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return "";
  return String(next).trim().toUpperCase();
}

await seedEnv();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}
args.country = readArgValue(process.argv.slice(2), "--country");

const shippingMap = loadShippingMap();
const countries = getMerchantTargetCountries(shippingMap);
const currency = getMerchantCurrency();
const prefix = getMerchantServicePrefix();
const { groups, services: expectedServices } = buildManagedShippingServices({
  shippingMap,
  countries,
  currency,
  prefix,
});

const expectedLabels = new Set();
for (const variant of Object.keys(groups)) {
  for (const group of groups[variant]) {
    expectedLabels.add(group.shippingLabel);
  }
}

let settings = null;
try {
  settings = await getShippingSettings();
} catch (error) {
  if (error instanceof MerchantApiError && error.status === 404) {
    throw new Error("No shipping settings exist yet for this Merchant account.");
  }
  throw error;
}

const services = Array.isArray(settings?.services) ? settings.services : [];
const issues = [];

function serviceCoversLabelForCountry(service, label, country) {
  if (!service?.active) return false;
  if (!Array.isArray(service.deliveryCountries) || !service.deliveryCountries.includes(country)) return false;
  const rateGroups = Array.isArray(service.rateGroups) ? service.rateGroups : [];
  return rateGroups.some((group) => {
    const labels = Array.isArray(group?.applicableShippingLabels) ? group.applicableShippingLabels : [];
    return labels.includes(label);
  });
}

const scopeCountries = args.country ? [args.country] : countries;
for (const country of scopeCountries) {
  for (const label of expectedLabels) {
    const ok = services.some((svc) => serviceCoversLabelForCountry(svc, label, country));
    if (!ok) {
      issues.push(`${country}: missing active service for shipping label ${label}`);
    }
  }
}

const report = {
  verifiedAt: new Date().toISOString(),
  prefix,
  currency,
  countries: scopeCountries,
  expectedLabels: Array.from(expectedLabels.values()),
  expectedServiceCount: expectedServices.length,
  currentServiceCount: services.length,
  issues,
};

const reportPath = writeJsonReport("reports/merchant-shipping-verify.json", report);
if (issues.length) {
  console.error("FAIL: Merchant shipping coverage is incomplete.");
  for (const issue of issues) console.error(`- ${issue}`);
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

console.log(`PASS: Merchant shipping coverage OK for ${scopeCountries.length} countr${scopeCountries.length === 1 ? "y" : "ies"}.`);
console.log(`Report: ${reportPath}`);

