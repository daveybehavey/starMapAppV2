#!/usr/bin/env node

import {
  seedEnv,
  loadShippingMap,
  getMerchantCurrency,
  getMerchantTargetCountries,
  getMerchantServicePrefix,
  getMerchantAccountId,
  buildManagedShippingServices,
  isManagedServiceName,
  summarizeServices,
  writeJsonReport,
} from "./merchant-shipping-common.mjs";
import { MerchantApiError, getShippingSettings, getShippingSettingsResourceName, insertShippingSettings } from "./merchant-api.mjs";

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    replaceAllServices: argv.includes("--replace-all-services"),
    getCurrent: argv.includes("--get-current"),
    help: argv.includes("-h") || argv.includes("--help"),
  };
}

function printHelp() {
  console.log(`Usage: node scripts/merchant-shipping-sync.mjs [--get-current] [--apply] [--replace-all-services]

Options:
  --get-current           Fetch current Merchant shipping settings and write a report.
  --apply                 Insert the generated shipping settings into Merchant API.
  --replace-all-services  Replace all existing shipping services instead of preserving non-managed services.

Default behavior without --apply:
  - fetch current settings if available
  - generate a preview payload
  - write reports under reports/
`);
}

await seedEnv();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const accountId = getMerchantAccountId();
const shippingMap = loadShippingMap();
const countries = getMerchantTargetCountries(shippingMap);
const currency = getMerchantCurrency();
const prefix = getMerchantServicePrefix();
const { services: managedServices } = buildManagedShippingServices({
  shippingMap,
  countries,
  currency,
  prefix,
});

let currentSettings = null;
try {
  currentSettings = await getShippingSettings();
} catch (error) {
  if (!(error instanceof MerchantApiError && error.status === 404)) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof MerchantApiError && error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (args.getCurrent) {
  if (!currentSettings) {
    console.log(`No shipping settings found yet for account ${accountId}.`);
    process.exit(0);
  }
  const reportPath = writeJsonReport("reports/merchant-shipping-settings.current.json", currentSettings);
  console.log(`Current services: ${currentSettings.services?.length || 0}`);
  console.log(`Report written: ${reportPath}`);
  process.exit(0);
}

const existingServices = Array.isArray(currentSettings?.services) ? currentSettings.services : [];
const preservedServices = args.replaceAllServices
  ? []
  : existingServices.filter((service) => !isManagedServiceName(service.serviceName, prefix));
const removedManagedServices = existingServices.filter((service) => isManagedServiceName(service.serviceName, prefix));

const nextSettings = {
  name: currentSettings?.name || getShippingSettingsResourceName(),
  etag: currentSettings?.etag || "",
  services: [...preservedServices, ...managedServices],
  warehouses: Array.isArray(currentSettings?.warehouses) ? currentSettings.warehouses : [],
};

const preview = {
  generatedAt: new Date().toISOString(),
  accountId,
  currency,
  countries,
  prefix,
  replaceAllServices: args.replaceAllServices,
  currentServiceCount: existingServices.length,
  preservedServiceCount: preservedServices.length,
  replacedManagedServiceCount: removedManagedServices.length,
  managedServiceCount: managedServices.length,
  finalServiceCount: nextSettings.services.length,
  preservedServices: summarizeServices(preservedServices),
  managedServices: summarizeServices(managedServices),
  payload: nextSettings,
};

const previewPath = writeJsonReport("reports/merchant-shipping-settings.preview.json", preview);
console.log(`Merchant account: ${accountId}`);
console.log(`Countries: ${countries.length}`);
console.log(`Current services: ${existingServices.length}`);
console.log(`Preserved unmanaged services: ${preservedServices.length}`);
console.log(`Generated managed services: ${managedServices.length}`);
console.log(`Preview written: ${previewPath}`);

if (!args.apply) {
  console.log("Dry run only. Re-run with --apply to insert these shipping settings.");
  if (preservedServices.length) {
    console.log("Note: unmanaged existing services will be preserved. Use --replace-all-services to wipe them.");
  }
  process.exit(0);
}

try {
  const applied = await insertShippingSettings(nextSettings);
  const reportPath = writeJsonReport("reports/merchant-shipping-settings.applied.json", applied);
  console.log(`Applied shipping settings. Final services: ${applied.services?.length || 0}`);
  console.log(`Applied report: ${reportPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof MerchantApiError && error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exit(1);
}
