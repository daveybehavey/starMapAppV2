/**
 * experiments.ts — sticky variant selection with a deterministic localStorage stub.
 *
 * Regression targets:
 * - SSR / no-window path returns the fallback
 * - empty variants array returns fallback
 * - stored valid variant is reused; invalid stored value is replaced and persisted
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { getStickyVariant, getHeroCheckoutVariant, HERO_CHECKOUT_EXPERIMENT } = await import(
  "../../src/lib/experiments.ts"
);

test("getStickyVariant: no window / empty variants → fallback", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(getStickyVariant("exp_x", ["a", "b"], "a"), "a");
  assert.equal(getStickyVariant("exp_x", [], "fallback"), "fallback");
});

test("getStickyVariant: sticky reuse + invalid stored value reassignment", () => {
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };

  const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
  let nextBucket = 1; // 1 % 2 === 1 → "value"
  crypto.getRandomValues = (arr) => {
    arr[0] = nextBucket;
    return arr;
  };

  try {
    store.clear();
    assert.equal(getStickyVariant("exp_sticky", ["control", "value"], "control"), "value");
    assert.equal(store.get("exp:variant:exp_sticky"), "value");

    nextBucket = 0; // would choose control if assignment re-ran
    assert.equal(getStickyVariant("exp_sticky", ["control", "value"], "control"), "value");

    store.set("exp:variant:exp_sticky", "not-a-variant");
    nextBucket = 0;
    assert.equal(getStickyVariant("exp_sticky", ["control", "value"], "control"), "control");
    assert.equal(store.get("exp:variant:exp_sticky"), "control");

    store.set(`exp:variant:${HERO_CHECKOUT_EXPERIMENT}`, "value");
    assert.equal(getHeroCheckoutVariant(), "value");
  } finally {
    crypto.getRandomValues = originalGetRandomValues;
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
