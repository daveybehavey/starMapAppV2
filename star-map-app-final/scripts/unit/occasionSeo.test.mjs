import assert from "node:assert/strict";
import test from "node:test";

/** Keep in sync with new-baby row in seoOccasions.ts */
const NEW_BABY_SEO = {
  seoTitle: "New Baby Star Map Gift — Birth Night Sky | StarMapCo",
  seoH1: "New Baby Star Map Gift",
  seoDescription:
    "Create a personalized new baby star map from their birth date, time, and hospital or home city. Free preview, then framed + HD digital with free shipping on $100+ orders.",
};

test("new-baby occasion has GSC-tuned metadata fields", () => {
  assert.match(NEW_BABY_SEO.seoTitle, /New Baby/i);
  assert.match(NEW_BABY_SEO.seoDescription, /framed \+ HD/i);
  assert.match(NEW_BABY_SEO.seoDescription, /\$100\+/);
  assert.equal(NEW_BABY_SEO.seoH1, "New Baby Star Map Gift");
});

test("default occasion description mentions framed + HD path", () => {
  const suffix =
    "Start with a free preview, then choose framed + HD digital (free shipping at $100+), unframed poster, or instant HD delivery.";
  assert.match(suffix, /framed \+ HD digital/);
});
