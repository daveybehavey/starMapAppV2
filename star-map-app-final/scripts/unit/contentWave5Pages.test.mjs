/**
 * Content expansion wave 5: promote first-date to a canonical money page;
 * apply the night-we-met copy-fix (#602) treatment to first-date and the
 * census-flagged seoOccasions entries; preserve LandingViewTracker id;
 * keep wave-3/4 promotions intact; update the wave-4 night-we-met → first-date
 * internal link to the new canonical path.
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

async function loadOccasion(slug) {
  const { getOccasion } = await loadTs("src/data/seoOccasions.ts");
  const entry = getOccasion(slug);
  assert.ok(entry, `${slug} occasion entry must exist`);
  return entry;
}

function renderedCopy(entry) {
  return [
    entry.seoDescription ?? "",
    entry.intro,
    entry.detail ?? "",
    ...(entry.storyParagraphs ?? []),
    ...entry.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ].join("\n");
}

const FIRST_DATE = "src/app/first-date/page.tsx";
const PRICE_LITERAL = /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/;
const CENSUS_TREATED_SLUGS = ["first-date", "valentines-day", "engagement", "new-baby", "christmas"];

test("wave-5 /first-date exists with metadata, price components, story, and no hardcoded dollar prices", () => {
  assert.equal(fs.existsSync(path.join(ROOT, FIRST_DATE)), true, `${FIRST_DATE} must exist`);
  const source = readSrc(FIRST_DATE);
  assert.match(source, /export const metadata/);
  assert.match(source, /alternates:\s*\{\s*canonical:/);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /GiftFormatLadder/);
  assert.match(source, /OccasionStorySection/);
  assert.match(source, /getOccasion\("first-date"\)/);
  assert.match(source, /occasion\.storyParagraphs/);
  assert.doesNotMatch(source, PRICE_LITERAL);
});

test("wave-5 page preserves LandingViewTracker source id occasion-first-date", () => {
  const source = readSrc(FIRST_DATE);
  assert.match(source, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(source, /<LandingViewTracker source="occasion-first-date" \/>/);
});

test("wave-5 page reuses the first-date entry example line", () => {
  assert.match(readSrc(FIRST_DATE), /Our First Date · Seattle, WA · November 3, 2018/);
});

test("seoIndexing promotes first-date and keeps wave-3/4 promotions", async () => {
  const { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } =
    await loadTs("src/data/seoIndexing.ts");

  assert.equal(getCanonicalOccasionPath("first-date"), "/first-date");
  assert.equal(isIndexableOccasionSlug("first-date"), false);
  assert.equal(resolveOccasionIntentPath("first-date"), "/first-date");

  assert.equal(getCanonicalOccasionPath("long-distance"), "/long-distance");
  assert.equal(getCanonicalOccasionPath("first-home"), "/first-home");
  assert.equal(getCanonicalOccasionPath("night-we-met"), "/night-we-met");
  assert.equal(getCanonicalOccasionPath("graduation"), "/graduation");

  assert.equal(isIndexableOccasionSlug("long-distance"), false);
  assert.equal(isIndexableOccasionSlug("first-home"), false);
  assert.equal(isIndexableOccasionSlug("night-we-met"), false);
  assert.equal(isIndexableOccasionSlug("graduation"), false);
});

test("sitemap registers /first-date once and omits redirected occasion URL", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/first-date").length, 1);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/first-date"), false);
});

test("internal linking surfaces point at /first-date", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /slug: "first-date"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/first-date"/);
  assert.doesNotMatch(giftIdeas, /\/star-map-for\/first-date/);

  const nightWeMet = readSrc("src/app/night-we-met/page.tsx");
  assert.match(nightWeMet, /href="\/first-date"/);
  assert.doesNotMatch(nightWeMet, /\/star-map-for\/first-date/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /https:\/\/starmapco\.com\/first-date/);
});

test("treated first-date entry has no typed prices and no mug in format list (copy-fix pin style)", async () => {
  const entry = await loadOccasion("first-date");
  const rendered = renderedCopy(entry);
  assert.doesNotMatch(rendered, /\$\s?\d/, "typed price figure in first-date copy");
  assert.doesNotMatch(rendered, /\b\d+\s?dollars?\b/i, "spelled-out price figure in first-date copy");
  assert.doesNotMatch(JSON.stringify(entry), /mug/i);
  const whatFaq = entry.faqs.find((faq) => faq.question === "What is a first date star map?");
  assert.ok(whatFaq, "the format-list FAQ must exist");
  assert.match(
    whatFaq.answer,
    /framed print, unframed poster, canvas, keepsake card, or HD digital file/,
    "orderable format list must be exactly the editor/paywall formats",
  );
  assert.match(JSON.stringify(entry), /\/night-we-met/, "stale template path updated to canonical");
  assert.doesNotMatch(JSON.stringify(entry), /\/star-map-for\/night-we-met/);
  assert.match(JSON.stringify(entry), /10% off on posters, canvas and framed prints/);
});

test("Item 2 census-treated entries have no typed prices; mug stripped where present", async () => {
  // Census authority: PR #602 body. Scope excluding night-we-met (already
  // treated) and first-date (Item 1, pinned above): valentines-day,
  // engagement, new-baby, christmas.
  for (const slug of CENSUS_TREATED_SLUGS.filter((s) => s !== "first-date")) {
    const entry = await loadOccasion(slug);
    const rendered = renderedCopy(entry);
    assert.doesNotMatch(rendered, /\$\s?\d/, `typed price figure in ${slug} copy`);
    assert.doesNotMatch(rendered, /\b\d+\s?dollars?\b/i, `spelled-out price figure in ${slug} copy`);
  }

  const valentines = await loadOccasion("valentines-day");
  assert.doesNotMatch(JSON.stringify(valentines), /mug/i);
  const writeFaq = valentines.faqs.find((faq) => faq.question === "What can I write on the map?");
  assert.ok(writeFaq, "valentines format-list FAQ must exist");
  assert.match(
    writeFaq.answer,
    /framed print, unframed poster, canvas, keepsake card, or HD digital file/,
  );
  assert.match(JSON.stringify(valentines), /10% off on posters, canvas/);
});
