/**
 * printAssets.ts — REAL module (not the printAssetReuse harness mirror).
 *
 * Regression targets:
 * - key builders stay namespaced
 * - recipe fingerprint length gates (too short / too long / non-string)
 * - reuse requires matching mapId + optional fingerprint + valid asset id
 * - TTL parsers default and reject non-positive / non-finite days
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  PRINT_ASSET_ID_REGEX,
  printAssetKey,
  printAssetMapIndexKey,
  normalizeRecipeFingerprint,
  shouldReuseIndexedPrintAsset,
  parsePrintAssetTtlSeconds,
  parsePrintAssetEntitledTtlSeconds,
} = await import("../../src/lib/printAssets.ts");

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

test("print asset keys stay namespaced by asset id and map id", () => {
  assert.equal(printAssetKey("abc"), "print:asset:abc");
  assert.equal(printAssetMapIndexKey("map_1"), "print:asset:map:map_1");
});

test("normalizeRecipeFingerprint accepts mid-length strings only", () => {
  assert.equal(normalizeRecipeFingerprint(12), undefined);
  assert.equal(normalizeRecipeFingerprint("short"), undefined);
  assert.equal(normalizeRecipeFingerprint("a".repeat(7)), undefined);
  assert.equal(normalizeRecipeFingerprint("a".repeat(8)), "a".repeat(8));
  assert.equal(normalizeRecipeFingerprint(`  ${"b".repeat(16)}  `), "b".repeat(16));
  assert.equal(normalizeRecipeFingerprint("c".repeat(8193)), undefined);
});

test("shouldReuseIndexedPrintAsset: match / fingerprint / map / id failures", () => {
  const index = { assetId: VALID_ID, recipeFingerprint: "recipe-aaaa", createdAt: 1 };
  const asset = { mapId: "map-1", mimeType: "image/png", base64Data: "QQ==", createdAt: 1 };

  assert.equal(
    shouldReuseIndexedPrintAsset({
      mapId: "map-1",
      recipeFingerprint: "recipe-aaaa",
      index,
      asset,
    }),
    VALID_ID,
  );
  assert.equal(
    shouldReuseIndexedPrintAsset({
      mapId: "map-1",
      recipeFingerprint: "recipe-bbbb",
      index,
      asset,
    }),
    undefined,
  );
  assert.equal(
    shouldReuseIndexedPrintAsset({
      mapId: "map-other",
      recipeFingerprint: "recipe-aaaa",
      index,
      asset,
    }),
    undefined,
  );
  assert.equal(
    shouldReuseIndexedPrintAsset({
      mapId: "map-1",
      index: { ...index, assetId: "not-a-uuid" },
      asset,
    }),
    undefined,
  );
  assert.equal(shouldReuseIndexedPrintAsset({ mapId: "map-1", index: null, asset }), undefined);
  assert.equal(shouldReuseIndexedPrintAsset({ mapId: "map-1", index, asset: null }), undefined);
  // Without a requested fingerprint, reuse is allowed when map + id match.
  assert.equal(
    shouldReuseIndexedPrintAsset({ mapId: "map-1", index, asset }),
    VALID_ID,
  );
  assert.ok(PRINT_ASSET_ID_REGEX.test(VALID_ID));
  assert.equal(PRINT_ASSET_ID_REGEX.test("550e8400-e29b-91d4-a716-446655440000"), false);
});

test("TTL parsers: defaults, positive days, reject zero/NaN/negative", () => {
  const savedTtl = process.env.PRINT_ASSET_TTL_DAYS;
  const savedEntitled = process.env.PRINT_ASSET_ENTITLED_TTL_DAYS;
  try {
    delete process.env.PRINT_ASSET_TTL_DAYS;
    delete process.env.PRINT_ASSET_ENTITLED_TTL_DAYS;
    assert.equal(parsePrintAssetTtlSeconds(), 14 * 24 * 60 * 60);
    assert.equal(parsePrintAssetEntitledTtlSeconds(), 60 * 24 * 60 * 60);

    process.env.PRINT_ASSET_TTL_DAYS = "3";
    process.env.PRINT_ASSET_ENTITLED_TTL_DAYS = "10";
    assert.equal(parsePrintAssetTtlSeconds(), 3 * 24 * 60 * 60);
    assert.equal(parsePrintAssetEntitledTtlSeconds(), 10 * 24 * 60 * 60);

    process.env.PRINT_ASSET_TTL_DAYS = "0";
    process.env.PRINT_ASSET_ENTITLED_TTL_DAYS = "-2";
    assert.equal(parsePrintAssetTtlSeconds(), 14 * 24 * 60 * 60);
    assert.equal(parsePrintAssetEntitledTtlSeconds(), 60 * 24 * 60 * 60);

    process.env.PRINT_ASSET_TTL_DAYS = "nope";
    process.env.PRINT_ASSET_ENTITLED_TTL_DAYS = "NaN";
    assert.equal(parsePrintAssetTtlSeconds(), 14 * 24 * 60 * 60);
    assert.equal(parsePrintAssetEntitledTtlSeconds(), 60 * 24 * 60 * 60);
  } finally {
    if (savedTtl === undefined) delete process.env.PRINT_ASSET_TTL_DAYS;
    else process.env.PRINT_ASSET_TTL_DAYS = savedTtl;
    if (savedEntitled === undefined) delete process.env.PRINT_ASSET_ENTITLED_TTL_DAYS;
    else process.env.PRINT_ASSET_ENTITLED_TTL_DAYS = savedEntitled;
  }
});
