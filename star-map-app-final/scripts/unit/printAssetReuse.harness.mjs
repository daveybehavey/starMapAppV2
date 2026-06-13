const PRINT_ASSET_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keep in sync with printAssets.ts */
export function shouldReuseIndexedPrintAsset(input) {
  const { mapId, recipeFingerprint, index, asset } = input;
  if (!index || !asset) return undefined;
  if (!PRINT_ASSET_ID_REGEX.test(index.assetId)) return undefined;
  if (asset.mapId !== mapId) return undefined;
  if (recipeFingerprint && index.recipeFingerprint !== recipeFingerprint) return undefined;
  return index.assetId;
}
