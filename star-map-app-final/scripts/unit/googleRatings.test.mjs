import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_RATINGS,
  formatGoogleRatingValue,
  getGoogleFullStarCount,
  getGoogleReviewCountLabel,
} from "../../src/lib/googleRatings.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Verified proof (Google Business Profile "StarMapCo Star Maps", GBP manager,
// 2026-10-18): 5.0 stars from 2 reviews. If these constants ever change, the
// change must come from the listing itself, never from marketing copy.
test("rating constants match the verified Google listing", () => {
  assert.equal(GOOGLE_RATINGS.ratingValue, 5.0);
  assert.equal(GOOGLE_RATINGS.reviewCount, 2);
  assert.equal(GOOGLE_RATINGS.reviewUrl, "https://g.page/r/CVMm_3hOFgRTEAI");
});

test("display helpers format the aggregate the way Google shows it", () => {
  assert.equal(formatGoogleRatingValue(), "5.0");
  assert.equal(getGoogleReviewCountLabel(), "2 reviews");
  assert.equal(getGoogleFullStarCount(), 5);
});

test("quote entries, when present, are complete and within the verified count", () => {
  assert.ok(Array.isArray(GOOGLE_RATINGS.reviews));
  assert.ok(
    GOOGLE_RATINGS.reviews.length <= GOOGLE_RATINGS.reviewCount,
    "cannot display more quotes than the listing has reviews",
  );
  for (const review of GOOGLE_RATINGS.reviews) {
    assert.equal(typeof review.quote, "string");
    assert.ok(review.quote.trim().length > 0, "quote must be verbatim text, never empty");
    assert.ok(review.authorFirstName.trim().length > 0, "quote must carry a first name");
    assert.ok(review.rating >= 1 && review.rating <= 5, "quote rating must be 1-5");
  }
});

test("no surface hard-codes the rating — all read the one lib module", () => {
  const component = read("src/components/GoogleRatingsTrust.tsx");
  assert.match(component, /from "@\/lib\/googleRatings"/);
  assert.match(component, /GOOGLE_RATINGS/);
  assert.ok(
    !component.includes("g.page/r/"),
    "review URL must come from GOOGLE_RATINGS, not a component literal",
  );

  const home = read("src/app/HomeStaticSections.tsx");
  assert.match(home, /<GoogleRatingsTrust \/>/);

  const shop = read("src/app/shop/page.tsx");
  assert.match(shop, /<GoogleRatingsTrust variant="strip"/);
});

test("homepage Product schema claims NO aggregateRating; the visible component renders NO numbers (owner ruling 2026-10-27)", () => {
  // The rating belongs to the Google Business Profile (the business), not
  // to the homepage's Product. Google's review-snippet guidelines require
  // a Product's aggregateRating to be reviews of that product and prohibit
  // presenting another entity's ratings as product ratings — so the schema
  // must not carry one (and it must not move onto an Organization node
  // either). Separately, the owner ruled on 2026-10-27 that the site shows
  // no rating value or review count anywhere until the count is
  // impressive: the component links to the Google listing qualitatively
  // and the constants stay on file in the lib only.
  const page = read("src/app/page.tsx");
  assert.ok(
    !page.includes("aggregateRating"),
    "homepage JSON-LD must not contain an aggregateRating property",
  );
  assert.ok(
    !page.includes("AggregateRating"),
    "homepage JSON-LD must not contain an AggregateRating type",
  );

  const component = read("src/components/GoogleRatingsTrust.tsx");
  assert.match(component, /GOOGLE_RATINGS/);
  assert.doesNotMatch(component, /formatGoogleRatingValue\(\)/);
  assert.doesNotMatch(component, /getGoogleReviewCountLabel\(\)/);
  assert.doesNotMatch(component, /getGoogleFullStarCount\(\)/);
  assert.doesNotMatch(component, /\.ratingValue|\.reviewCount/);
});
