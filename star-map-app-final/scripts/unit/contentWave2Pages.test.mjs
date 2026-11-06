/**
 * Content expansion wave 2: standalone /new-baby and /proposal money pages,
 * canonical redirects, sitemap registration, and reused site buyer phrases.
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

const NEW_BABY = "src/app/new-baby/page.tsx";
const PROPOSAL = "src/app/proposal/page.tsx";

test("wave-2 money pages exist without hardcoded dollar prices", () => {
  for (const rel of [NEW_BABY, PROPOSAL]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `${rel} must exist`);
    const source = readSrc(rel);
    assert.match(source, /export const metadata/);
    assert.match(source, /MoneyPagePriceAtGlance/);
    assert.match(source, /GiftFormatLadder/);
    assert.match(source, /OccasionStorySection/);
    assert.doesNotMatch(source, /\$\d+(?:\.\d{2})?\s*(?:USD|CAD)?/);
  }
});

test("new-baby page reuses existing site buyer phrases", () => {
  const source = readSrc(NEW_BABY);
  assert.match(source, /The sky on the night they arrived/);
  assert.match(source, /A nursery keepsake that grows with them/);
  assert.match(source, /A keepsake they grow into, not out of/);
  assert.match(source, /A new baby star map for their first chapter/);
  assert.match(source, /Remember the day their world began/);
  assert.match(source, /the sky on the day someone was born is truly one of a kind/);
  assert.match(source, /Make a moment into a keepsake/);
  assert.match(source, /captures the sky exactly as it appeared when they arrived/);
});

test("proposal page reuses wedding/proposal buyer phrases from the site", () => {
  const source = readSrc(PROPOSAL);
  assert.match(source, /Turn the proposal moment into a timeless keepsake/);
  assert.match(source, /matches the exact sky/);
  assert.match(source, /Celebrate the engagement with a star map that captures the exact sky from the proposal night/);
  assert.match(source, /A wedding star map for the day they said yes/);
  assert.match(source, /Give their wedding day a place on the wall/);
  assert.match(source, /the map shows that exact sky/);
  assert.match(source, /Create a wedding star map that captures the exact sky from your wedding night or ceremony date/);
  assert.match(source, /Make a moment into a keepsake/);
  assert.match(source, /href="\/wedding"/);
});

test("new-baby and proposal canonicalize away from /star-map-for", async () => {
  const { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } =
    await loadTs("src/data/seoIndexing.ts");
  assert.equal(getCanonicalOccasionPath("new-baby"), "/new-baby");
  assert.equal(getCanonicalOccasionPath("proposal"), "/proposal");
  assert.equal(isIndexableOccasionSlug("new-baby"), false);
  assert.equal(isIndexableOccasionSlug("proposal"), false);
  assert.equal(resolveOccasionIntentPath("new-baby"), "/new-baby");
  assert.equal(resolveOccasionIntentPath("proposal"), "/proposal");
});

test("sitemap registers /new-baby and /proposal once and omits redirected occasion URLs", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/new-baby").length, 1);
  assert.equal(urls.filter((url) => url === "https://starmapco.com/proposal").length, 1);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/new-baby"), false);
  assert.equal(urls.includes("https://starmapco.com/star-map-for/proposal"), false);
});

test("internal linking surfaces point at the new money pages", () => {
  const occasionLinks = readSrc("src/components/OccasionLinks.tsx");
  assert.match(occasionLinks, /slug: "new-baby"/);
  assert.match(occasionLinks, /slug: "proposal"/);

  const giftIdeas = readSrc("src/app/star-map-gift-ideas/page.tsx");
  assert.match(giftIdeas, /href: "\/new-baby"/);
  assert.match(giftIdeas, /href: "\/proposal"/);

  const blogLinks = readSrc("src/lib/blogConversionLinks.ts");
  assert.match(blogLinks, /href: "\/new-baby"/);
  assert.doesNotMatch(blogLinks, /\/star-map-for\/new-baby/);

  const llms = readSrc("public/llms.txt");
  assert.match(llms, /https:\/\/starmapco\.com\/new-baby/);
  assert.match(llms, /https:\/\/starmapco\.com\/proposal/);
});

test("wave-2 pages preserve landing-view tracking from the occasion pages they replace", () => {
  const newBaby = readSrc(NEW_BABY);
  assert.match(newBaby, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(newBaby, /<LandingViewTracker source="occasion-new-baby" \/>/);
  const proposal = readSrc(PROPOSAL);
  assert.match(proposal, /import \{ LandingViewTracker \} from "@\/components\/analytics\/LandingViewTracker";/);
  assert.match(proposal, /<LandingViewTracker source="occasion-proposal" \/>/);
});
