#!/usr/bin/env node

import {
  seedEnv,
  loadShippingMap,
  getMerchantCurrency,
  getMerchantTargetCountries,
  getMerchantServicePrefix,
  buildManagedShippingServices,
  summarizeServices,
  writeJsonReport,
} from "./merchant-shipping-common.mjs";

await seedEnv();

const shippingMap = loadShippingMap();
const countries = getMerchantTargetCountries(shippingMap);
const currency = getMerchantCurrency();
const prefix = getMerchantServicePrefix();
const { groups, services } = buildManagedShippingServices({
  shippingMap,
  countries,
  currency,
  prefix,
});

const report = {
  generatedAt: new Date().toISOString(),
  countries,
  currency,
  prefix,
  groupCounts: {
    poster_unframed: groups.poster_unframed.length,
    poster_framed: groups.poster_framed.length,
  },
  services: summarizeServices(services),
};

const reportPath = writeJsonReport("reports/merchant-shipping-plan.json", report);
console.log(`Countries: ${countries.length}`);
console.log(`Currency: ${currency}`);
console.log(`Managed services: ${services.length}`);
console.log(`- Unframed groups: ${groups.poster_unframed.length}`);
console.log(`- Framed groups: ${groups.poster_framed.length}`);
console.log(`Report written: ${reportPath}`);
