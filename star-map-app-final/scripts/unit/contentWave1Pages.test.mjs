/**
 * Content expansion wave 1: how-to guide, first Christmas landing, and
 * deepened anniversary guide. Pins page presence, sitemap registration,
 * editor-flow facts sourced from code, and “no hardcoded price” rules.
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

const HOW_TO = "src/app/how-personalized-star-map-works/page.tsx";
const FIRST_XMAS = "src/app/first-christmas-star-map/page.tsx";
const ANNIVERSARY = "src/app/anniversary/page.tsx";

test("wave-1 pages exist and expose canonical metadata", () => {
  for (const rel of [HOW_TO, FIRST_XMAS]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `${rel} must exist`);
    const source = readSrc(rel);
    assert.match(source, /export const metadata/);
    assert.match(source, /alternates:\s*\{\s*canonical:/);
    assert.doesNotMatch(source, /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/);
  }
});

test("how-to page mirrors the live editor flow vocabulary", () => {
  const source = readSrc(HOW_TO);
  for (const phrase of [
    "Add date + place to unlock preview",
    "Generate preview",
    "Revealing your sky",
    "Text Styling",
    "HD only",
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /from "@\/lib\/config"/);
  assert.match(source, /from "@\/lib\/aspectOptions"/);
  assert.match(source, /from "@\/lib\/frameStyle"/);
  assert.match(source, /from "@\/lib\/fonts"/);
  assert.match(source, /PAYWALL_PRINT_CHECKOUT_ROWS/);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /GiftFormatLadder/);
  assert.match(source, /href="\/first-christmas-star-map"/);
  assert.match(source, /href="\/anniversary"/);
});

test("how-to FAQ lives in landingFaqs and matches schema source", async () => {
  const { HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS } = await loadTs("src/lib/landingFaqs.ts");
  assert.ok(HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS.length >= 5);
  const source = readSrc(HOW_TO);
  assert.match(source, /HOW_PERSONALIZED_STAR_MAP_WORKS_FAQ_ITEMS/);
  assert.match(source, /<FaqSchema/);
});

test("first Christmas page follows occasion money-page pattern", () => {
  const source = readSrc(FIRST_XMAS);
  assert.match(source, /First Christmas Star Map Gift/);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /GiftFormatLadder/);
  assert.match(source, /ChristmasOrderByTable/);
  assert.match(source, /OccasionStorySection/);
  assert.match(source, /buildFramedHdCheckoutHref\("first-christmas-hero-framed-hd"\)/);
  assert.match(source, /href="\/christmas-star-map-gift"/);
  assert.match(source, /href="\/star-map-for\/new-baby"/);
  assert.match(source, /href="\/how-personalized-star-map-works"/);
  assert.doesNotMatch(source, /\binstantly\b/i);
});

test("anniversary page carries the deepened gift guide section", () => {
  const source = readSrc(ANNIVERSARY);
  assert.match(source, /data-testid="anniversary-gift-guide"/);
  assert.match(source, /How to choose a date/);
  assert.match(source, /What the map shows/);
  assert.match(source, /Gift presentation/);
  assert.match(source, /href="\/how-personalized-star-map-works"/);
  assert.match(source, /from "@\/lib\/config"/);
  assert.match(source, /styles\.map/);
  assert.match(source, /shapes\.map/);
  assert.match(source, /PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS/);
  assert.match(source, /PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS/);
});

test("sitemap registers both new wave-1 URLs exactly once", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(
    urls.filter((url) => url === "https://starmapco.com/how-personalized-star-map-works").length,
    1
  );
  assert.equal(
    urls.filter((url) => url === "https://starmapco.com/first-christmas-star-map").length,
    1
  );
});

test("internal linking surfaces include first Christmas and how-to", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /href: "\/first-christmas-star-map"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/first-christmas-star-map"/);

  const christmas = readSrc("src/app/christmas-star-map-gift/page.tsx");
  assert.match(christmas, /href="\/first-christmas-star-map"/);
  assert.match(christmas, /href="\/how-personalized-star-map-works"/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /how-personalized-star-map-works/);
  assert.match(llms, /first-christmas-star-map/);
});

test("how-to page style and shape labels stay sourced from config", () => {
  const source = readSrc(HOW_TO);
  // Page renders labels via the imported arrays rather than hardcoding each name.
  assert.match(source, /from "@\/lib\/config"/);
  assert.match(source, /styles\.map/);
  assert.match(source, /shapes\.map/);
  assert.match(source, /fontOptions\.map/);
  assert.match(source, /ASPECT_OPTIONS\.map/);
  assert.match(source, /FRAME_STYLE_OPTIONS\.map/);
});
