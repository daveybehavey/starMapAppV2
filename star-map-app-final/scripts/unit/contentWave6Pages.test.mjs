/**
 * Content expansion wave 6: promote valentines-day to a canonical money page;
 * keep the wave-5-treated entry byte-identical (no re-treatment); preserve
 * LandingViewTracker id; keep all ten prior canonical redirects; close the
 * two stale template-URL hygiene references (night-we-met FAQ + gift-ideas href).
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

const VALENTINES = "src/app/valentines-day/page.tsx";
const PRICE_LITERAL = /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/;
const PRIOR_CANONICALS = [
  "anniversary",
  "birthday",
  "wedding",
  "new-baby",
  "proposal",
  "long-distance",
  "first-home",
  "night-we-met",
  "graduation",
  "first-date",
];

test("wave-6 /valentines-day exists with metadata, price components, story, and no hardcoded dollar prices", () => {
  assert.equal(fs.existsSync(path.join(ROOT, VALENTINES)), true, `${VALENTINES} must exist`);
  const source = readSrc(VALENTINES);
  assert.match(source, /export const metadata/);
  assert.match(source, /alternates:\s*\{\s*canonical:/);
  assert.match(source, /MoneyPagePriceAtGlance/);
  assert.match(source, /GiftFormatLadder/);
  assert.match(source, /OccasionStorySection/);
  assert.match(source, /getOccasion\("valentines-day"\)/);
  assert.match(source, /occasion\.storyParagraphs/);
  assert.doesNotMatch(source, PRICE_LITERAL);
});

test("wave-6 page preserves LandingViewTracker source id occasion-valentines-day", () => {
  const source = readSrc(VALENTINES);
  assert.match(source, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(source, /<LandingViewTracker source="occasion-valentines-day" \/>/);
});

test("wave-6 page reuses the valentines-day entry example line", () => {
  assert.match(readSrc(VALENTINES), /Valentine.?s Night · Toronto, ON · February 14, 2026/);
});

test("seoIndexing promotes valentines-day and keeps all ten prior canonical redirects", async () => {
  const {
    INDEXABLE_OCCASION_SLUGS,
    getCanonicalOccasionPath,
    isIndexableOccasionSlug,
    resolveOccasionIntentPath,
  } = await loadTs("src/data/seoIndexing.ts");

  assert.equal(getCanonicalOccasionPath("valentines-day"), "/valentines-day");
  assert.equal(isIndexableOccasionSlug("valentines-day"), false);
  assert.equal(resolveOccasionIntentPath("valentines-day"), "/valentines-day");

  assert.deepEqual([...INDEXABLE_OCCASION_SLUGS], [
    "engagement",
    "memorial",
    "mothers-day",
    "fathers-day",
    "christmas",
    "retirement",
  ]);

  for (const slug of PRIOR_CANONICALS) {
    assert.equal(
      getCanonicalOccasionPath(slug),
      `/${slug}`,
      `prior canonical redirect missing for ${slug}`,
    );
    assert.equal(isIndexableOccasionSlug(slug), false);
  }
});

test("sitemap registers /valentines-day once and omits redirected occasion URL", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/valentines-day").length, 1);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/valentines-day"), false);
});

test("internal linking surfaces point at /valentines-day", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /slug: "valentines-day"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/valentines-day"/);
  assert.doesNotMatch(giftIdeas, /\/star-map-for\/valentines-day/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /https:\/\/starmapco\.com\/valentines-day/);
});

test("valentines-day entry keeps wave-5 treatment (no typed prices, no mug)", async () => {
  const entry = await loadOccasion("valentines-day");
  const rendered = renderedCopy(entry);
  assert.doesNotMatch(rendered, /\$\s?\d/, "typed price figure in valentines-day copy");
  assert.doesNotMatch(rendered, /\b\d+\s?dollars?\b/i, "spelled-out price figure in valentines-day copy");
  assert.doesNotMatch(JSON.stringify(entry), /mug/i);
  const writeFaq = entry.faqs.find((faq) => faq.question === "What can I write on the map?");
  assert.ok(writeFaq, "valentines format-list FAQ must exist");
  assert.match(
    writeFaq.answer,
    /framed print, unframed poster, canvas, keepsake card, or HD digital file/,
  );
  assert.match(JSON.stringify(entry), /10% off on posters, canvas/);
});

test("Item 2 hygiene: night-we-met FAQ uses /first-date; no entry prose has /star-map-for/", async () => {
  const occasionsSource = readSrc("src/data/seoOccasions.ts");
  assert.match(occasionsSource, /\(\/first-date\)/);
  assert.doesNotMatch(occasionsSource, /\/star-map-for\//);

  const entry = await loadOccasion("night-we-met");
  const faq = entry.faqs.find((item) => /two different nights/i.test(item.answer));
  assert.ok(faq, "intent-split FAQ must exist");
  assert.match(faq.answer, /\(\/first-date\)/);
  assert.doesNotMatch(faq.answer, /\/star-map-for\/first-date/);
});
