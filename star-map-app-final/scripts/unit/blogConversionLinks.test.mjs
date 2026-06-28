import assert from "node:assert/strict";
import test from "node:test";
import { getOrderedBlogConversionLinks, resolveBlogOccasion } from "./blogConversionLinks.harness.mjs";

test("resolveBlogOccasion maps high-intent slugs", () => {
  assert.equal(resolveBlogOccasion("custom-star-maps-for-weddings"), "wedding");
  assert.equal(resolveBlogOccasion("custom-star-map-for-anniversary"), "anniversary");
  assert.equal(resolveBlogOccasion("personalized-star-map-birthday-gift"), "birthday");
  assert.equal(resolveBlogOccasion("birth-star-map"), "new-baby");
  assert.equal(resolveBlogOccasion("memorial-star-map"), "memorial");
});

test("memorial posts prioritize memorial money pages", () => {
  const links = getOrderedBlogConversionLinks("memorial-star-map");
  assert.equal(links[0]?.href, "/star-map-for/memorial");
  assert.equal(links[1]?.href, "/blog/memorial-star-map");
  assert.ok(links.some((link) => link.href === "/hd-star-map"));
});

test("dynamic blog posts include generator and shop paths", () => {
  const links = getOrderedBlogConversionLinks("is-a-star-map-a-good-gift");
  assert.ok(links.some((link) => link.href === "/star-map-generator"));
  assert.ok(links.some((link) => link.href === "/shop"));
});
