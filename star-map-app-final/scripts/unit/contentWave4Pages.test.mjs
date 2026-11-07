/**
 * Content expansion wave 4: promote first-home, night-we-met, and graduation
 * occasion slugs to canonical money pages; preserve LandingViewTracker ids;
 * keep wave-3 long-distance promotion intact; leave housewarming unchanged.
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

const FIRST_HOME = "src/app/first-home/page.tsx";
const NIGHT_WE_MET = "src/app/night-we-met/page.tsx";
const GRADUATION = "src/app/graduation/page.tsx";
const PRICE_LITERAL = /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/;

test("wave-4 surfaces exist with metadata and no hardcoded dollar prices", () => {
  for (const rel of [FIRST_HOME, NIGHT_WE_MET, GRADUATION]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `${rel} must exist`);
    const source = readSrc(rel);
    assert.match(source, /export const metadata/);
    assert.match(source, /alternates:\s*\{\s*canonical:/);
    assert.match(source, /MoneyPagePriceAtGlance/);
    assert.match(source, /GiftFormatLadder/);
    assert.match(source, /OccasionStorySection/);
    assert.doesNotMatch(source, PRICE_LITERAL);
  }
});

test("wave-4 pages preserve LandingViewTracker source ids from the occasion templates", () => {
  const firstHome = readSrc(FIRST_HOME);
  assert.match(firstHome, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(firstHome, /<LandingViewTracker source="occasion-first-home" \/>/);

  const nightWeMet = readSrc(NIGHT_WE_MET);
  assert.match(nightWeMet, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(nightWeMet, /<LandingViewTracker source="occasion-night-we-met" \/>/);

  const graduation = readSrc(GRADUATION);
  assert.match(graduation, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(graduation, /<LandingViewTracker source="occasion-graduation" \/>/);
});

test("wave-4 pages reuse each occasion entry's example line", () => {
  assert.match(readSrc(FIRST_HOME), /Our First Home · Denver, CO · August 2, 2023/);
  assert.match(readSrc(NIGHT_WE_MET), /The Night We Met · Vancouver, BC · August 16, 2025/);
  assert.match(readSrc(GRADUATION), /Class of 2024 · Boston, MA · May 25, 2024/);
});

test("seoIndexing promotes the three wave-4 slugs and keeps long-distance", async () => {
  const { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } =
    await loadTs("src/data/seoIndexing.ts");

  assert.equal(getCanonicalOccasionPath("first-home"), "/first-home");
  assert.equal(getCanonicalOccasionPath("night-we-met"), "/night-we-met");
  assert.equal(getCanonicalOccasionPath("graduation"), "/graduation");
  assert.equal(getCanonicalOccasionPath("long-distance"), "/long-distance");

  assert.equal(isIndexableOccasionSlug("first-home"), false);
  assert.equal(isIndexableOccasionSlug("night-we-met"), false);
  assert.equal(isIndexableOccasionSlug("graduation"), false);
  assert.equal(isIndexableOccasionSlug("long-distance"), false);

  assert.equal(resolveOccasionIntentPath("first-home"), "/first-home");
  assert.equal(resolveOccasionIntentPath("night-we-met"), "/night-we-met");
  assert.equal(resolveOccasionIntentPath("graduation"), "/graduation");
  assert.equal(resolveOccasionIntentPath("long-distance"), "/long-distance");
});

test("housewarming redirect and indexing state remain unchanged", async () => {
  const { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } =
    await loadTs("src/data/seoIndexing.ts");
  assert.equal(getCanonicalOccasionPath("housewarming"), null);
  assert.equal(isIndexableOccasionSlug("housewarming"), false);
  assert.equal(resolveOccasionIntentPath("housewarming"), "/star-map-for/housewarming");
});

test("sitemap registers the three wave-4 money pages once and omits redirected occasion URLs", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/first-home").length, 1);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/night-we-met").length, 1);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/graduation").length, 1);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/first-home"), false);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/night-we-met"), false);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/graduation"), false);
});

test("internal linking surfaces and long-distance link hygiene point at wave-4 pages", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /slug: "first-home"/);
  assert.match(occasionLinks, /slug: "night-we-met"/);
  assert.match(occasionLinks, /slug: "graduation"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/first-home"/);
  assert.match(giftIdeas, /href: "\/night-we-met"/);
  assert.match(giftIdeas, /href: "\/graduation"/);
  assert.doesNotMatch(giftIdeas, /\/star-map-for\/graduation/);

  const longDistance = readSrc("src/app/long-distance/page.tsx");
  assert.match(longDistance, /href="\/night-we-met"/);
  assert.doesNotMatch(longDistance, /\/star-map-for\/night-we-met/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /https:\/\/starmapco\.com\/first-home/);
  assert.match(llms, /https:\/\/starmapco\.com\/night-we-met/);
  assert.match(llms, /https:\/\/starmapco\.com\/graduation/);
});

test("night-we-met and graduation money pages reuse seoOccasions entry story content", () => {
  const nightWeMet = readSrc(NIGHT_WE_MET);
  assert.match(nightWeMet, /getOccasion\("night-we-met"\)/);
  assert.match(nightWeMet, /occasion\.storyParagraphs/);
  assert.match(nightWeMet, /href="\/first-date"/);
  assert.match(nightWeMet, /href="\/long-distance"/);
  assert.match(nightWeMet, /href="\/first-home"/);
  assert.match(nightWeMet, /href="\/anniversary"/);
  assert.match(nightWeMet, /href="\/how-accurate-are-star-maps"/);

  const graduation = readSrc(GRADUATION);
  assert.match(graduation, /getOccasion\("graduation"\)/);
  assert.match(graduation, /occasion\.storyParagraphs/);
  assert.match(graduation, /href="\/first-home"/);
  assert.match(graduation, /href="\/night-we-met"/);
  assert.match(graduation, /href="\/birthday"/);
  assert.match(graduation, /href="\/how-personalized-star-map-works"/);

  const firstHome = readSrc(FIRST_HOME);
  assert.match(firstHome, /Commemorate a first home with a star map from move‑in night or closing day/);
  assert.match(firstHome, /Use the closing date, move‑in day, or the first night you spent there/);
  assert.match(firstHome, /href="\/night-we-met"/);
  assert.match(firstHome, /href="\/graduation"/);
  assert.match(firstHome, /href="\/long-distance"/);
  assert.match(firstHome, /href="\/anniversary"/);
  assert.match(firstHome, /ChristmasOrderByTable/);
});
