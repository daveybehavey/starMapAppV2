import assert from "node:assert/strict";
import test from "node:test";

/** GSC-tuned occasion rows — keep in sync with seoOccasions.ts */
const TUNED_OCCASIONS = [
  {
    slug: "new-baby",
    seoTitle: "New Baby Star Map Gift — Birth Night Sky | StarMapCo",
    seoH1: "New Baby Star Map Gift",
    mustMatchTitle: /New Baby/i,
  },
  {
    slug: "engagement",
    seoTitle: "Engagement Star Map Gift — Proposal Night Sky | StarMapCo",
    seoH1: "Engagement Star Map Gift",
    mustMatchTitle: /Engagement/i,
  },
  {
    slug: "proposal",
    seoTitle: "Proposal Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "Proposal Star Map Gift",
    mustMatchTitle: /Proposal/i,
  },
  {
    slug: "memorial",
    seoTitle: "Memorial Star Map Gift — Remembrance Night Sky | StarMapCo",
    seoH1: "Memorial Star Map Gift",
    mustMatchTitle: /Memorial/i,
  },
  {
    slug: "graduation",
    seoTitle: "Graduation Star Map Gift — Ceremony Night Sky | StarMapCo",
    seoH1: "Graduation Star Map Gift",
    mustMatchTitle: /Graduation/i,
  },
  {
    slug: "mothers-day",
    seoTitle: "Mother's Day Star Map Gift — Personalized Night Sky | StarMapCo",
    seoH1: "Mother's Day Star Map Gift",
    mustMatchTitle: /Mother/i,
  },
  {
    slug: "first-date",
    seoTitle: "First Date Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "First Date Star Map Gift",
    mustMatchTitle: /First Date/i,
  },
];

for (const occasion of TUNED_OCCASIONS) {
  test(`${occasion.slug} occasion has GSC-tuned title and H1`, () => {
    assert.match(occasion.seoTitle, occasion.mustMatchTitle);
    assert.match(occasion.seoH1, occasion.mustMatchTitle);
    assert.match(occasion.seoTitle, /StarMapCo$/);
  });
}

test("default occasion description mentions framed + HD path", () => {
  const suffix =
    "Start with a free preview, then choose framed + HD digital (free shipping at $100+), unframed poster, or instant HD delivery.";
  assert.match(suffix, /framed \+ HD digital/);
});
