/**
 * shopExternalOffers.ts — curated partner-link JSON parser.
 *
 * Regression targets:
 * - empty / malformed JSON → []
 * - items without https:// href or title are dropped
 * - description falls back to title; optional cta kept when non-empty
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { parseShopExternalOffers } = await import("../../src/lib/shopExternalOffers.ts");

test("parseShopExternalOffers: empty and invalid inputs yield []", () => {
  assert.deepEqual(parseShopExternalOffers(undefined), []);
  assert.deepEqual(parseShopExternalOffers(""), []);
  assert.deepEqual(parseShopExternalOffers("   "), []);
  assert.deepEqual(parseShopExternalOffers("{not-json"), []);
  assert.deepEqual(parseShopExternalOffers('{"title":"x"}'), []);
});

test("parseShopExternalOffers: keeps https offers; drops http/missing fields", () => {
  const raw = JSON.stringify([
    {
      title: " Partner A ",
      description: "  ",
      href: "https://example.com/a",
      cta: " Shop now ",
    },
    { title: "Partner B", href: "http://insecure.example/b" },
    { title: "", href: "https://example.com/c" },
    { title: "Partner D", href: "https://example.com/d" },
    null,
    "skip-me",
  ]);
  assert.deepEqual(parseShopExternalOffers(raw), [
    {
      title: "Partner A",
      description: "Partner A",
      href: "https://example.com/a",
      cta: "Shop now",
    },
    {
      title: "Partner D",
      description: "Partner D",
      href: "https://example.com/d",
    },
  ]);
});
