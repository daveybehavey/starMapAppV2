/**
 * S95-7 SEO quick fixes:
 *  1. /shop emits Product/Offer JSON-LD through the shared ProductSchema
 *     component, with prices derived only from the canonical pricing
 *     tiers (never literals) and print offers gated on the print-checkout
 *     flag — mirroring the occasion pages (anniversary/birthday).
 *  2. /personalized-star-map — a self-canonical commercial page linked
 *     from the occasion pages — is an explicit sitemap entry.
 *
 * No review/rating data may enter the shop schema: public review counts
 * stay off the site by standing policy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHOP_SOURCE = fs.readFileSync(path.join(ROOT, "src/app/shop/page.tsx"), "utf8");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

test("sitemap includes /personalized-star-map exactly once as a static entry", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");

  for (const flags of [
    { bulkEnabled: true, shopNavEnabled: true },
    { bulkEnabled: false, shopNavEnabled: false },
  ]) {
    const entries = buildSitemapEntries({
      baseUrl: "https://starmapco.com",
      blogPosts: [],
      ...flags,
    });
    const matches = entries.filter(
      (entry) => entry.url === "https://starmapco.com/personalized-star-map"
    );
    assert.equal(matches.length, 1, `/personalized-star-map must appear exactly once (${JSON.stringify(flags)})`);
    assert.equal(matches[0].changeFrequency, "monthly");
    assert.equal(matches[0].priority, 0.85);
    // No truthful content date is recorded for this page — omit lastModified.
    assert.equal(matches[0].lastModified, undefined);
  }
});

test("/personalized-star-map is self-canonical (sitemap eligibility)", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/personalized-star-map/page.tsx"), "utf8");
  assert.match(page, /alternates:\s*\{\s*canonical:\s*`\$\{siteUrl\}\/personalized-star-map`\s*\}/);
});

test("shop page renders ProductSchema with canonical-tier offers only", () => {
  assert.match(SHOP_SOURCE, /import ProductSchema from "@\/components\/ProductSchema";/);
  assert.match(SHOP_SOURCE, /<ProductSchema/);
  // Digital offer price comes from the canonical digital tier.
  assert.match(SHOP_SOURCE, /price:\s*\(digitals\.single\.amountCents \/ 100\)\.toFixed\(2\)/);
  assert.match(SHOP_SOURCE, /priceCurrency:\s*\(digitals\.single\.currency \|\| "USD"\)\.toUpperCase\(\)/);
  // Print offer prices come from the canonical print tiers, per variant.
  assert.match(SHOP_SOURCE, /price:\s*\(tier\.amountCents \/ 100\)\.toFixed\(2\)/);
  assert.match(SHOP_SOURCE, /priceCurrency:\s*\(tier\.currency \|\| "USD"\)\.toUpperCase\(\)/);
  // No literal schema prices anywhere on the page.
  assert.doesNotMatch(SHOP_SOURCE, /price:\s*"/, "schema prices must be derived, never literals");
});

test("shop schema covers every displayed print variant and gates prints on the checkout flag", () => {
  for (const variant of [
    "poster_framed",
    "poster_unframed",
    "poster_unframed_16x16",
    "canvas_wrap",
    "mug_11oz",
    "card_4x6",
  ]) {
    assert.match(SHOP_SOURCE, new RegExp(`"${variant}"`), `schema offers must include ${variant}`);
  }
  assert.match(
    SHOP_SOURCE,
    /\.\.\.\(printCheckoutEnabled\s*\?\s*printSchemaVariants\.map\(/,
    "print offers must be emitted only while print checkout is enabled"
  );
});

test("shop schema carries no review or rating data (public counts stay off)", () => {
  assert.doesNotMatch(SHOP_SOURCE, /aggregateRating/);
  assert.doesNotMatch(SHOP_SOURCE, /reviewCount/);
  assert.doesNotMatch(SHOP_SOURCE, /ratingValue/);
});
