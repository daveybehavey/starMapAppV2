import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register("./tsAliasLoader.mjs", import.meta.url);
const { getStorefrontProductOffers } = await import("../../src/lib/storefrontProductOffers.ts");
const { getPricingTiers, getPrintPricingTiers } = await import("../../src/lib/pricing.ts");

test("storefront offers track catalogue overrides and public availability", () => {
  const overrides = {
    NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED: "false",
    PRICE_SINGLE_CENTS: "1234",
    PRINT_UNFRAMED_PRICE_CENTS: "5678",
    CURRENCY: "cad",
  };
  const saved = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, overrides);
    const digital = getPricingTiers().single;
    const offers = getStorefrontProductOffers("https://starmapco.com/");
    assert.equal(offers.length, 1);
    assert.equal(offers[0].price, "12.34");
    assert.equal(offers[0].priceCurrency, "CAD");
    assert.equal(offers[0].price, (digital.amountCents / 100).toFixed(2));
    assert.equal(offers[0].priceCurrency, digital.currency.toUpperCase());
    process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED = "true";
    const enabled = getStorefrontProductOffers("https://starmapco.com");
    assert.equal(enabled.length, 3);
    assert.equal(enabled[1].price, "56.78");
    for (const [index, variant] of ["poster_unframed", "poster_framed"].entries()) {
      const tier = getPrintPricingTiers()[variant];
      assert.equal(enabled[index + 1].price, (tier.amountCents / 100).toFixed(2));
      assert.equal(enabled[index + 1].priceCurrency, tier.currency.toUpperCase());
      assert.equal(new URL(enabled[index + 1].url).searchParams.get("print_variant"), variant);
    }
    assert.equal(getStorefrontProductOffers("https://starmapco.com", true).length, 1);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
