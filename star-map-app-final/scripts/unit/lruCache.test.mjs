/**
 * lruCache.ts — eviction and MRU reordering.
 *
 * Regression targets:
 * - capacity eviction drops the least-recently-used key, not the newest
 * - get() refreshes recency so a frequently-read key survives eviction
 * - set() on an existing key updates value and moves it to MRU
 * - delete / clear / has / size match Map semantics at the public seam
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { LRUCache } = await import("../../src/lib/lruCache.ts");

test("eviction: inserting past maxSize drops the oldest unread key", () => {
  const cache = new LRUCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.has("a"), false);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("get refreshes recency: a touched key survives the next eviction", () => {
  const cache = new LRUCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1); // a becomes MRU; b is now LRU
  cache.set("c", 3);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("set on an existing key updates the value and marks it MRU", () => {
  const cache = new LRUCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 11);
  cache.set("c", 3);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("a"), 11);
  assert.equal(cache.get("c"), 3);
});

test("delete / clear / missing get behave like a Map", () => {
  const cache = new LRUCache(3);
  cache.set("a", 1);
  assert.equal(cache.delete("a"), true);
  assert.equal(cache.delete("a"), false);
  assert.equal(cache.get("missing"), undefined);
  cache.set("x", 9);
  cache.set("y", 8);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.has("x"), false);
});
