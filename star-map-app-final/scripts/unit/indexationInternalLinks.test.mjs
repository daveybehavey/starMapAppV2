/**
 * Indexation hygiene pins (W17-3 fix step 2 + orphan money-page linking):
 *
 * - Internal links between content pages must NOT carry `?source=` — those
 *   variants split crawl/link signals across money pages (295 variants in the
 *   2026-10-25 crawl). Attribution moved off the URL (data attribute).
 * - `/editor?...` hrefs are OUT of scope and keep their `source` param: the
 *   editor reads it for funnel attribution and checkout configuration.
 * - Promotional-email URLs (lib/promotions.ts) are an off-site channel, not
 *   site-internal link generation; their `?source=` attribution stays.
 * - The framed+HD bundle money page (/star-map-poster/framed-hd-bundle) must
 *   have internal links from the framed product/gift surfaces. It previously
 *   had zero. NOTE: /star-map-poster itself must NOT carry the bundle link —
 *   merchantFeedLandingLinks.test.mjs pins that page bundle-free so the feed
 *   landing roles stay distinct.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const readSrc = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const CONTENT_FILES_WITH_STRIPPED_LINKS = [
  "src/app/blog/page.tsx",
  "src/app/blog/astronomy-behind-star-maps/page.tsx",
  "src/app/blog/choose-date-location-custom-star-map/page.tsx",
  "src/app/blog/custom-star-map-for-anniversary/page.tsx",
  "src/app/blog/custom-star-maps-for-weddings/page.tsx",
  "src/app/blog/memorial-star-map/page.tsx",
  "src/app/blog/personalized-star-map-birthday-gift/page.tsx",
  "src/app/blog/valentines-day-star-map/page.tsx",
  "src/app/wedding/page.tsx",
  "src/lib/blogPosts.tsx",
  "src/components/AccuracyAuthorityCard.tsx",
  "src/components/BlogPostConversionLinks.tsx",
];

function hrefsWithSourceParam(source) {
  const hrefs = [];
  const re = /href="([^"]*\?source=[^"]*)"/g;
  let match = re.exec(source);
  while (match) {
    hrefs.push(match[1]);
    match = re.exec(source);
  }
  return hrefs;
}

test("no content-page href carries ?source= in the cleaned files", () => {
  for (const rel of CONTENT_FILES_WITH_STRIPPED_LINKS) {
    const offenders = hrefsWithSourceParam(readSrc(rel));
    assert.deepEqual(offenders, [], `${rel} still mints ?source= hrefs: ${offenders.join(", ")}`);
  }
});

test("shared link helpers mint clean hrefs and keep attribution off the URL", () => {
  const conversion = readSrc("src/components/BlogPostConversionLinks.tsx");
  assert.match(conversion, /href=\{item\.href\}/);
  assert.match(conversion, /data-source=\{`blog_\$\{source\}`\}/);

  const accuracy = readSrc("src/components/AccuracyAuthorityCard.tsx");
  assert.match(accuracy, /href="\/how-accurate-are-star-maps"/);
  assert.doesNotMatch(accuracy, /how-accurate-are-star-maps\?source/);
});

test("editor hrefs keep their source param (editor funnel is out of scope)", () => {
  const blogPost = readSrc("src/app/blog/astronomy-behind-star-maps/page.tsx");
  assert.match(blogPost, /\/editor\?mode=quick&source=blog-astronomy-framed/);

  const accuracy = readSrc("src/components/AccuracyAuthorityCard.tsx");
  assert.match(accuracy, /\/editor\?mode=quick&source=/);

  const sticky = readSrc("src/components/StickyCtaBar.tsx");
  assert.match(sticky, /"\/editor\?mode=quick"/);
});

test("promotional email URL keeps its attribution param (off-site channel)", () => {
  const promotions = readSrc("src/lib/promotions.ts");
  assert.match(promotions, /\/wedding\?source=\$\{encodeURIComponent\(source\)\}/);
});

test("framed+HD bundle page is linked from framed product and gift surfaces", () => {
  const shop = readSrc("src/app/shop/page.tsx");
  assert.match(shop, /href="\/star-map-poster\/framed-hd-bundle"/);

  const formats = readSrc("src/app/star-map-gift-formats/page.tsx");
  assert.match(formats, /href="\/star-map-poster\/framed-hd-bundle"/);

  // The bundle page itself still exists at its crawlable route.
  assert.match(
    readSrc("src/app/star-map-poster/framed-hd-bundle/page.tsx"),
    /BUNDLE_PATH = "\/star-map-poster\/framed-hd-bundle"/,
  );
});
