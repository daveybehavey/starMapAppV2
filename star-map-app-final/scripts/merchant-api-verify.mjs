#!/usr/bin/env node

import { seedEnv, getMerchantAccountId, writeJsonReport } from "./merchant-shipping-common.mjs";
import { MerchantApiError, getShippingSettings, getShippingSettingsResourceName } from "./merchant-api.mjs";

await seedEnv();

const accountId = getMerchantAccountId();
const resourceName = getShippingSettingsResourceName();

console.log(`Merchant account: ${accountId}`);
console.log(`Shipping settings resource: ${resourceName}`);

try {
  const settings = await getShippingSettings();
  const reportPath = writeJsonReport("reports/merchant-shipping-settings.current.json", settings);
  console.log(`Merchant API auth OK. Services: ${settings.services?.length || 0}. Warehouses: ${settings.warehouses?.length || 0}.`);
  console.log(`Report written: ${reportPath}`);
} catch (error) {
  if (error instanceof MerchantApiError && error.status === 404) {
    console.log("Merchant API auth OK, but shipping settings do not exist yet for this account.");
    process.exit(0);
  }
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof MerchantApiError && error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exit(1);
}
