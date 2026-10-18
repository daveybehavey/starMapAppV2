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

test("homepage JSON-LD aggregateRating is built from the same constants", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /aggregateRating/);
  assert.match(page, /ratingValue: GOOGLE_RATINGS\.ratingValue\.toFixed\(1\)/);
  assert.match(page, /reviewCount: GOOGLE_RATINGS\.reviewCount/);
  assert.ok(
    !/ratingValue:\s*"\d/.test(page),
    "schema ratingValue must not be a hard-coded string",
  );
});
