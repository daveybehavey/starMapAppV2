import test from "node:test";
import assert from "node:assert/strict";
import { shouldReuseIndexedPrintAsset } from "./printAssetReuse.harness.mjs";

test("shouldReuseIndexedPrintAsset returns asset id when map and fingerprint match", () => {
  const assetId = shouldReuseIndexedPrintAsset({
    mapId: "c1b74e84-3aab-4679-95f8-6d0728d39828",
    recipeFingerprint: "fp-123",
    index: {
      assetId: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      recipeFingerprint: "fp-123",
      createdAt: Date.now(),
    },
    asset: {
      mapId: "c1b74e84-3aab-4679-95f8-6d0728d39828",
      mimeType: "image/jpeg",
      base64Data: "abc",
      createdAt: Date.now(),
    },
  });

  assert.equal(assetId, "a1b2c3d4-e5f6-4789-a012-3456789abcde");
});

test("shouldReuseIndexedPrintAsset rejects fingerprint mismatch", () => {
  const assetId = shouldReuseIndexedPrintAsset({
    mapId: "c1b74e84-3aab-4679-95f8-6d0728d39828",
    recipeFingerprint: "fp-new",
    index: {
      assetId: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      recipeFingerprint: "fp-old",
      createdAt: Date.now(),
    },
    asset: {
      mapId: "c1b74e84-3aab-4679-95f8-6d0728d39828",
      mimeType: "image/jpeg",
      base64Data: "abc",
      createdAt: Date.now(),
    },
  });

  assert.equal(assetId, undefined);
});
