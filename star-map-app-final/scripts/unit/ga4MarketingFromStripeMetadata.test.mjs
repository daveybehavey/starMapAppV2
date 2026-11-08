/**
 * commerceAnalyticsQa.mjs — buildGa4MarketingParamsFromStripeMetadata
 * (the server-side helper re-exported by marketingAttributionGa4.ts).
 *
 * marketingAttributionGa4.ts cannot be imported under the unit runner today:
 * it pulls `@/lib/commerceAnalyticsQa.mjs` through tsAliasLoader, which only
 * resolves `.ts`/`.tsx` for `@/` targets. Testing the underlying .mjs seam
 * covers the same GA4 marketing contract without changing the loader.
 *
 * Regression targets:
 * - null/empty metadata → {}
 * - only marketing_* Stripe keys become compact GA4 params
 * - utm_* keys alone do not leak into the output (must be applied via marketing_*)
 */
import assert from "node:assert/strict";
import test from "node:test";

const { buildGa4MarketingParamsFromStripeMetadata, applyMarketingAttributionMetadata } =
  await import("../../src/lib/commerceAnalyticsQa.mjs");

test("buildGa4MarketingParamsFromStripeMetadata: null/empty → {}", () => {
  assert.deepEqual(buildGa4MarketingParamsFromStripeMetadata(null), {});
  assert.deepEqual(buildGa4MarketingParamsFromStripeMetadata(undefined), {});
  assert.deepEqual(buildGa4MarketingParamsFromStripeMetadata({}), {});
  assert.deepEqual(
    buildGa4MarketingParamsFromStripeMetadata({
      utm_source: "wedding",
      utm_medium: "cpc",
    }),
    {},
  );
});

test("buildGa4MarketingParamsFromStripeMetadata: maps marketing_* metadata keys", () => {
  const metadata = {};
  applyMarketingAttributionMetadata(metadata, {
    source: "wedding",
    medium: "cpc",
    campaign: "fall",
    content: "card",
  });
  assert.deepEqual(buildGa4MarketingParamsFromStripeMetadata(metadata), {
    source: "wedding",
    medium: "cpc",
    campaign: "fall",
    content: "card",
  });
});
