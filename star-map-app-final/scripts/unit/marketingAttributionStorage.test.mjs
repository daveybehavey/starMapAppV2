import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETING_ATTRIBUTION_STORAGE_KEY,
  readStoredClientMarketingAttribution,
  resetMarketingAttributionStorageForTests,
  storeClientMarketingAttribution,
} from "./marketingAttributionStorage.harness.mjs";

test("store and read wedding campaign attribution", () => {
  resetMarketingAttributionStorageForTests();
  storeClientMarketingAttribution({
    source: "google",
    medium: "cpc",
    campaign: "gift_wedding_2026",
    content: "wedding_star_map_gift",
  });

  const stored = readStoredClientMarketingAttribution();
  assert.equal(stored?.campaign, "gift_wedding_2026");
  assert.equal(stored?.source, "google");
  assert.equal(stored?.medium, "cpc");
  assert.equal(stored?.content, "wedding_star_map_gift");
});

test("empty attribution is ignored", () => {
  resetMarketingAttributionStorageForTests();
  storeClientMarketingAttribution({});
  assert.equal(readStoredClientMarketingAttribution(), null);
});

test("storage key matches app constant", () => {
  assert.equal(MARKETING_ATTRIBUTION_STORAGE_KEY, "starmap_mkt_attr");
});
