/**
 * Merch public-env regression guard (Oct 2026 incident, fleet walk PR #32).
 *
 * Bug class: Next.js inlines only LITERAL `process.env.NEXT_PUBLIC_*` member
 * expressions into client bundles. merchCatalog.ts originally read the
 * per-family enable flags, labels, and prices through COMPUTED keys
 * (`process.env[family.enabledPublicEnv]` etc.). In the browser those reads
 * resolve against an empty env shim and yield undefined, while the server
 * still sees the real values — so /shop rendered all five merch cards
 * (server-side) while the browser editor resolved ZERO enabled families,
 * silently ignored the merch_family URL param, and offered print only.
 * Merch was unpurchasable for two days behind a "verified live" claim.
 *
 * The plain Node suite cannot catch this class by behaviour alone (Node's
 * process.env is real, so computed reads work under test). These pins
 * therefore combine:
 *   (a) source construction — every public merch value is read via a
 *       literal member expression, and the ONLY computed process.env read
 *       left in merchCatalog.ts is the server-only Stripe price id;
 *   (b) a browser simulation — import the catalog with production-like env
 *       set (the moment literal reads are captured, exactly like build-time
 *       inlining), then swap process.env for the empty shim a browser
 *       bundle sees for non-inlined keys and assert the public UI surface
 *       still resolves all five families, labels, and prices. Against the
 *       pre-fix implementation (b) fails: the family list comes back [].
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Production-like public env (wrangler.toml [vars]) set BEFORE importing the
// catalog: literal reads capture these values at module load, mirroring how
// build-time inlining bakes them into a client bundle.
const PROD_PUBLIC_ENV = {
  NEXT_PUBLIC_MERCH_BETA_ENABLED: "true",
  NEXT_PUBLIC_MERCH_STICKERS_ENABLED: "true",
  NEXT_PUBLIC_MERCH_MAGNETS_ENABLED: "true",
  NEXT_PUBLIC_MERCH_PINS_ENABLED: "true",
  NEXT_PUBLIC_MERCH_TEE_ENABLED: "true",
  NEXT_PUBLIC_MERCH_HOODIE_ENABLED: "true",
  NEXT_PUBLIC_MERCH_TEE_LABEL: "Trail Tee (env label)",
  NEXT_PUBLIC_MERCH_TEE_PRICE_CENTS: "3100",
};
const savedEnv = {};
for (const [key, value] of Object.entries(PROD_PUBLIC_ENV)) {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}

const catalog = await import("../../src/lib/merchCatalog.ts");

const catalogSource = readFileSync(new URL("../../src/lib/merchCatalog.ts", import.meta.url), "utf8");

test("source: every public merch env value is read through a literal member expression", () => {
  for (const family of catalog.MERCH_FAMILIES) {
    for (const key of [family.enabledPublicEnv, family.publicLabelEnv, family.publicPriceEnv]) {
      assert.ok(
        catalogSource.includes(`process.env.${key}`),
        `merchCatalog.ts must read ${key} via a literal process.env member expression (computed reads are not inlined into client bundles)`,
      );
    }
  }
  assert.ok(
    catalogSource.includes("process.env.NEXT_PUBLIC_MERCH_BETA_ENABLED"),
    "beta gate must stay a literal read",
  );
});

test("source: the only computed process.env read in merchCatalog.ts is the server-only Stripe price id", () => {
  const computedReads = catalogSource.match(/process\.env\[[^\]]*\]/g) ?? [];
  assert.deepEqual(
    computedReads,
    ["process.env[family.stripePriceEnv]"],
    `computed process.env reads in merchCatalog.ts drifted: ${JSON.stringify(computedReads)} — public values must use the literal maps; stripePriceEnv is server-only by design`,
  );
});

test("browser simulation: public merch surface survives an empty runtime env shim", () => {
  const realProcessEnv = process.env;
  // A browser bundle sees real values ONLY where the bundler inlined a
  // literal expression; every other key reads from an empty shim. Swapping
  // process.env after import reproduces exactly that split.
  process.env = {};
  try {
    const families = catalog.listMerchFamiliesEnabledForPublicUi();
    assert.deepEqual(
      families.map((f) => f.id),
      ["sticker_kisscut", "magnet_diecut", "pins_set", "tee_unisex_bc3001", "hoodie_unisex_g18500"],
      "all five merch families must stay enabled client-side (this is [] on the pre-fix computed-read implementation)",
    );
    assert.equal(catalog.isMerchFamilyEnabledForCheckout("tee_unisex_bc3001"), true);

    const tee = catalog.getMerchFamily("tee_unisex_bc3001");
    assert.equal(catalog.getMerchPublicDisplayLabel(tee), "Trail Tee (env label)");
    assert.equal(catalog.getMerchPublicDisplayPriceCents(tee), 3100);
    // Families without env overrides keep their code fallbacks under the shim.
    const stickers = catalog.getMerchFamily("sticker_kisscut");
    assert.equal(catalog.getMerchPublicDisplayPriceCents(stickers), stickers.priceFallbackCents);
    assert.equal(catalog.getMerchPublicDisplayLabel(stickers), stickers.labelFallback);
  } finally {
    process.env = realProcessEnv;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
