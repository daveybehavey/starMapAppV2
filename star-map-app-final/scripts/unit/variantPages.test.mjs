/**
 * Merchant Center variant landing pages (issue #393) — spec v2 tests.
 *
 * T1 — Price parity: the page resolver and checkout resolve the same
 *      amount because both call checkout's own helpers in
 *      src/lib/pricing.ts. Scenarios: (a) clean env -> catalog
 *      fallbacks; (b) server price env override; (c) NEXT_PUBLIC_*
 *      price override. CAD never moves with USD env overrides.
 * T2 — Manifest completeness: every PRINT_CATALOG row is either in the
 *      manifest exactly once or on the explicit exclusion list.
 * T3 — Routing contract: unknown variant/market and the excluded
 *      keepsake-card slug (any spelling) resolve to not-found.
 * T4 — Schema builder: exactly one Offer, values equal to the
 *      resolver's, no gtin/mpn.
 * T5 — Sitemap contains all 10 URLs exactly once; each page's metadata
 *      canonical is its own URL.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./tsAliasLoader.mjs", import.meta.url);

const { PRINT_CATALOG } = await import("../../src/lib/printCatalog.ts");
const { getPrintCadPriceCents, getPrintPricingTiers } = await import(
  "../../src/lib/pricing.ts"
);
const {
  VARIANT_PAGE_EXCLUDED_VARIANTS,
  VARIANT_PAGE_MANIFEST,
  VARIANT_PAGE_MARKETS,
  buildVariantPageMetadata,
  buildVariantPagePath,
  buildVariantProductSchema,
  listVariantPagePaths,
  parseVariantPageParams,
  resolveVariantOffer,
} = await import("../../src/lib/variantPages.ts");
const { buildSitemapEntries } = await import("../../src/lib/buildSitemapEntries.ts");

const PRICE_ENV_KEYS = PRINT_CATALOG.flatMap((row) => [
  row.priceEnv,
  row.publicPriceEnv,
  row.labelEnv,
  row.publicLabelEnv,
]);
const TOUCHED_ENV = [
  ...PRICE_ENV_KEYS,
  "CURRENCY",
  "NEXT_PUBLIC_CURRENCY",
  "NEXT_PUBLIC_SITE_URL",
];

function withEnv(overrides, fn) {
  const saved = new Map(TOUCHED_ENV.map((key) => [key, process.env[key]]));
  for (const key of TOUCHED_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  try {
    return fn();
  } finally {
    for (const key of TOUCHED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const EXPECTED_SLUGS = [
  "poster-18x18",
  "poster-16x16",
  "framed-14x14",
  "canvas-14x14",
  "mug-11oz",
];

// ---------------------------------------------------------------- T1

test("T1a parity: clean env resolves the catalog fallback books, page = checkout", () => {
  withEnv({}, () => {
    const tiers = getPrintPricingTiers();
    for (const row of VARIANT_PAGE_MANIFEST) {
      const usd = resolveVariantOffer(row.slug, "usd");
      const cad = resolveVariantOffer(row.slug, "cad");
      assert.equal(usd.amountCents, tiers[row.variant].amountCents, `${row.slug} USD`);
      assert.equal(cad.amountCents, getPrintCadPriceCents(row.variant), `${row.slug} CAD`);
      assert.equal(usd.currency, "USD");
      assert.equal(cad.currency, "CAD");
    }
    // The fallback books verbatim (spec v2 §2.1, read from printCatalog.ts).
    const usdBook = Object.fromEntries(
      VARIANT_PAGE_MANIFEST.map((row) => [row.slug, resolveVariantOffer(row.slug, "usd").amountCents])
    );
    const cadBook = Object.fromEntries(
      VARIANT_PAGE_MANIFEST.map((row) => [row.slug, resolveVariantOffer(row.slug, "cad").amountCents])
    );
    assert.deepEqual(usdBook, {
      "poster-18x18": 4900,
      "poster-16x16": 3900,
      "framed-14x14": 9900,
      "canvas-14x14": 7900,
      "mug-11oz": 3900,
    });
    assert.deepEqual(cadBook, {
      "poster-18x18": 6900,
      "poster-16x16": 5500,
      "framed-14x14": 13900,
      "canvas-14x14": 11100,
      "mug-11oz": 5500,
    });
  });
});

test("T1b parity: server price env override moves page USD and checkout USD together; CAD unchanged", () => {
  withEnv({ PRINT_FRAMED_PRICE_CENTS: "10100" }, () => {
    assert.equal(getPrintPricingTiers().poster_framed.amountCents, 10100);
    assert.equal(resolveVariantOffer("framed-14x14", "usd").amountCents, 10100);
    assert.equal(resolveVariantOffer("framed-14x14", "usd").formattedPrice, "$101.00 USD");
    assert.equal(resolveVariantOffer("framed-14x14", "cad").amountCents, 13900);
    // Other variants untouched.
    assert.equal(resolveVariantOffer("poster-18x18", "usd").amountCents, 4900);
  });
});

test("T1c parity: NEXT_PUBLIC_* price override moves page USD and checkout USD together; CAD unchanged", () => {
  withEnv({ NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS: "10200" }, () => {
    assert.equal(getPrintPricingTiers().poster_framed.amountCents, 10200);
    assert.equal(resolveVariantOffer("framed-14x14", "usd").amountCents, 10200);
    assert.equal(resolveVariantOffer("framed-14x14", "cad").amountCents, 13900);
  });
});

// ---------------------------------------------------------------- T2

test("T2 manifest: every catalog row is manifested once or explicitly excluded", () => {
  const manifestVariants = VARIANT_PAGE_MANIFEST.map((row) => row.variant);
  assert.equal(new Set(manifestVariants).size, manifestVariants.length, "manifest variants unique");
  for (const catalogRow of PRINT_CATALOG) {
    const inManifest = manifestVariants.includes(catalogRow.id);
    const excluded = VARIANT_PAGE_EXCLUDED_VARIANTS.includes(catalogRow.id);
    assert.ok(
      inManifest !== excluded,
      `${catalogRow.id} must be in the manifest XOR on the exclusion list`
    );
  }
  assert.deepEqual([...VARIANT_PAGE_EXCLUDED_VARIANTS], ["card_4x6"]);
  assert.deepEqual(
    VARIANT_PAGE_MANIFEST.map((row) => row.slug).sort(),
    [...EXPECTED_SLUGS].sort(),
    "concrete 5-variant inventory"
  );
  assert.equal(new Set(VARIANT_PAGE_MANIFEST.map((row) => row.feedId)).size, 5, "feed ids unique");
  for (const row of VARIANT_PAGE_MANIFEST) {
    assert.ok(row.title.length > 0, `${row.slug} title`);
    assert.ok(row.sizeLabel.length > 0, `${row.slug} size`);
    assert.ok(row.imagePath.startsWith("/"), `${row.slug} image`);
    assert.ok(row.shippingLabel.length > 0, `${row.slug} shipping label`);
    assert.ok(row.googleProductCategory.length > 0, `${row.slug} category`);
    assert.ok(row.description.length > 0, `${row.slug} description`);
  }
  assert.equal(listVariantPagePaths().length, 10, "5 variants x 2 markets = 10 pages");
});

// ---------------------------------------------------------------- T3

test("T3 routing: valid params resolve; unknown/excluded resolve to not-found", () => {
  for (const slug of EXPECTED_SLUGS) {
    for (const market of VARIANT_PAGE_MARKETS) {
      const parsed = parseVariantPageParams(slug, market);
      assert.ok(parsed, `${slug}/${market} should resolve`);
      assert.equal(parsed.slug, slug);
      assert.equal(parsed.market, market);
    }
  }
  const notFound = [
    ["card-4x6", "usd"],
    ["CARD-4X6", "usd"],
    ["Card-4X6", "cad"],
    ["keepsake-card", "usd"],
    ["poster-19x19", "usd"],
    ["poster-18x18", "eur"],
    ["poster-18x18", "USD"],
    ["poster-18x18", ""],
    ["", "usd"],
    [undefined, "usd"],
    ["poster-18x18", undefined],
    [null, null],
  ];
  for (const [variant, market] of notFound) {
    assert.equal(
      parseVariantPageParams(variant, market),
      null,
      `${String(variant)}/${String(market)} must be not-found`
    );
  }
  assert.equal(resolveVariantOffer("card-4x6", "usd"), null);
  assert.equal(resolveVariantOffer("nope", "usd"), null);
});

// ------------------------------------------------------- handoff (CTA)

test("handoff: editor href preselects the variant and the page market's shipping country, and carries no price", () => {
  withEnv({}, () => {
    for (const row of VARIANT_PAGE_MANIFEST) {
      const usd = resolveVariantOffer(row.slug, "usd");
      const cad = resolveVariantOffer(row.slug, "cad");
      assert.ok(usd.editorHref.includes(`print_variant=${row.variant}`), `${row.slug} usd variant`);
      assert.ok(cad.editorHref.includes(`print_variant=${row.variant}`), `${row.slug} cad variant`);
      assert.ok(usd.editorHref.includes("shipping_country=US"), `${row.slug} usd country hint`);
      assert.ok(cad.editorHref.includes("shipping_country=CA"), `${row.slug} cad country hint`);
      assert.notEqual(usd.editorHref, cad.editorHref, `${row.slug} markets hand off differently`);
      assert.ok(!/price|amount|cents/i.test(usd.editorHref), `${row.slug} href carries no price`);
    }
  });
});

// ---------------------------------------------------------------- T4

test("T4 schema: exactly one Offer, equal to the resolver, no gtin/mpn", () => {
  withEnv({}, () => {
    for (const row of VARIANT_PAGE_MANIFEST) {
      for (const market of VARIANT_PAGE_MARKETS) {
        const offer = resolveVariantOffer(row.slug, market);
        const schema = buildVariantProductSchema(offer);
        assert.equal(schema["@type"], "Product");
        assert.equal(schema.sku, offer.feedId);
        assert.equal(schema["@id"], `${offer.canonicalUrl}#product`);
        assert.ok(!Array.isArray(schema.offers), "schema carries a single Offer object");
        assert.equal(schema.offers.url, offer.canonicalUrl);
        assert.equal(schema.offers.price, (offer.amountCents / 100).toFixed(2));
        assert.equal(schema.offers.priceCurrency, offer.currency);
        assert.equal(schema.offers.availability, "https://schema.org/InStock");
        const serialized = JSON.stringify(schema);
        assert.ok(!serialized.includes('"gtin"'), "no gtin");
        assert.ok(!serialized.includes('"mpn"'), "no mpn");
      }
    }
    const framed = buildVariantProductSchema(resolveVariantOffer("framed-14x14", "usd"));
    assert.equal(framed.offers.price, "99.00");
    assert.equal(framed.offers.priceCurrency, "USD");
    const mugCad = buildVariantProductSchema(resolveVariantOffer("mug-11oz", "cad"));
    assert.equal(mugCad.offers.price, "55.00");
    assert.equal(mugCad.offers.priceCurrency, "CAD");
    assert.equal(mugCad.category, "2169");
  });
});

// ---------------------------------------------------------------- T5

test("T5 sitemap + canonical: all 10 URLs exactly once; canonical is the page's own URL", () => {
  withEnv({}, () => {
    const entries = buildSitemapEntries({ baseUrl: "https://starmapco.com", blogPosts: [] });
    const urls = entries.map((entry) => entry.url);
    for (const slug of EXPECTED_SLUGS) {
      for (const market of VARIANT_PAGE_MARKETS) {
        const url = `https://starmapco.com${buildVariantPagePath(slug, market)}`;
        assert.equal(
          urls.filter((candidate) => candidate === url).length,
          1,
          `${url} appears exactly once in the sitemap`
        );
        const offer = resolveVariantOffer(slug, market);
        assert.equal(offer.canonicalUrl, url);
        const metadata = buildVariantPageMetadata(offer);
        assert.equal(metadata.alternates.canonical, url);
        assert.equal(metadata.openGraph.url, url);
      }
    }
  });
});
