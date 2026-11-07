/**
 * Content expansion wave 3: /long-distance money page + occasion slug
 * promotion, /star-map-size-guide, and deepened /how-accurate-are-star-maps.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

const LONG_DISTANCE = "src/app/long-distance/page.tsx";
const SIZE_GUIDE = "src/app/star-map-size-guide/page.tsx";
const ACCURACY = "src/app/how-accurate-are-star-maps/page.tsx";
const PRICE_LITERAL = /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/;

test("wave-3 surfaces exist with metadata and no hardcoded dollar prices", () => {
  for (const rel of [LONG_DISTANCE, SIZE_GUIDE, ACCURACY]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `${rel} must exist`);
    const source = readSrc(rel);
    assert.match(source, /export const metadata/);
    assert.match(source, /alternates:\s*\{\s*canonical:/);
    assert.doesNotMatch(source, PRICE_LITERAL);
  }
});

test("long-distance money page renders pricing helpers and story section", () => {
  const source = readSrc(LONG_DISTANCE);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /GiftFormatLadder/);
  assert.match(source, /OccasionStorySection/);
  assert.match(source, /ChristmasOrderByTable/);
  assert.match(source, /The same night, two cities/);
  assert.match(source, /href="\/how-personalized-star-map-works"/);
  assert.match(source, /href="\/how-accurate-are-star-maps"/);
  assert.match(source, /href="\/star-map-size-guide"/);
  assert.match(source, /href="\/anniversary"/);
  assert.match(source, /href="\/star-map-for\/night-we-met"/);
  assert.match(source, /href="\/editor/);
});

test("long-distance page reuses occasion phrases including the dedication line", () => {
  const source = readSrc(LONG_DISTANCE);
  assert.match(source, /Celebrate long‑distance love with a star map that marks a shared date and sky/);
  assert.match(source, /Choose the date you became long‑distance, the last time you were together, or a reunion/);
  assert.match(source, /Add both city names in the dedication line/);
  assert.match(source, /Always Together · Seattle, WA · February 14, 2024/);
  assert.match(source, /one sky per map/);
  assert.match(source, /pair of maps/);
});

test("long-distance preserves LandingViewTracker source occasion-long-distance", () => {
  const source = readSrc(LONG_DISTANCE);
  assert.match(source, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(source, /<LandingViewTracker source="occasion-long-distance" \/>/);
});

test("long-distance canonicalizes away from /star-map-for", async () => {
  const { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } =
    await loadTs("src/data/seoIndexing.ts");
  assert.equal(getCanonicalOccasionPath("long-distance"), "/long-distance");
  assert.equal(isIndexableOccasionSlug("long-distance"), false);
  assert.equal(resolveOccasionIntentPath("long-distance"), "/long-distance");
});

test("star-map-size-guide answers size intent from live wall formats", () => {
  const source = readSrc(SIZE_GUIDE);
  assert.match(source, /What size star map should I buy/);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /formatStandalonePrintPriceWithShipping/);
  assert.match(source, /poster_framed/);
  assert.match(source, /canvas_wrap/);
  assert.match(source, /poster_unframed_16x16/);
  assert.match(source, /poster_unframed/);
  assert.match(source, /Every wall print is square|all square|All live wall prints/i);
  assert.match(source, /href="\/star-map-gift-formats"/);
  assert.match(source, /href="\/how-to-print-star-map"/);
  assert.match(source, /href="\/hd-star-map"/);
  assert.match(source, /href="\/shipping"/);
  assert.match(source, /href="\/long-distance"/);
  assert.match(source, /getPrintPhysicalOrderSummaryLine/);
  assert.doesNotMatch(source, /LandingViewTracker/);
  assert.doesNotMatch(source, /GiftFormatLadder/);
});

test("how-accurate page adds LandingViewTracker and two-cities section", () => {
  const source = readSrc(ACCURACY);
  assert.match(source, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(source, /<LandingViewTracker source="how-accurate-are-star-maps" \/>/);
  assert.match(source, /The same night from two cities/);
  assert.match(source, /href="\/long-distance"/);
  assert.match(source, /place-dependent/);
});

test("sitemap registers /long-distance and /star-map-size-guide once and omits redirected occasion URL", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/long-distance").length, 1);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/star-map-size-guide").length, 1);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/long-distance"), false);
});

test("internal linking surfaces point at the new wave-3 pages", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /slug: "long-distance"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/long-distance"/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /https:\/\/starmapco\.com\/long-distance/);
  assert.match(llms, /https:\/\/starmapco\.com\/star-map-size-guide/);
});
