import { kv } from "@/lib/kv";
import {
  printAssetKey,
  printAssetMapIndexKey,
  PRINT_ASSET_ID_REGEX,
  shouldReuseIndexedPrintAsset,
  type PrintAssetMapIndex,
  type StoredPrintAsset,
} from "@/lib/printAssets";

export { shouldReuseIndexedPrintAsset };

export async function loadReusablePrintAssetId(
  mapId: string,
  recipeFingerprint?: string,
): Promise<string | undefined> {
  const trimmedMapId = mapId.trim();
  if (!trimmedMapId) return undefined;

  const index = await kv.get<PrintAssetMapIndex>(printAssetMapIndexKey(trimmedMapId));
  if (!index) return undefined;

  const asset = await kv.get<StoredPrintAsset>(printAssetKey(index.assetId));
  return shouldReuseIndexedPrintAsset({
    mapId: trimmedMapId,
    recipeFingerprint,
    index,
    asset,
  });
}

export async function indexPrintAssetForMap(input: {
  mapId: string;
  assetId: string;
  recipeFingerprint?: string;
  ttlSeconds: number;
}): Promise<void> {
  const mapId = input.mapId.trim();
  if (!mapId || !PRINT_ASSET_ID_REGEX.test(input.assetId)) return;

  const payload: PrintAssetMapIndex = {
    assetId: input.assetId,
    recipeFingerprint: input.recipeFingerprint?.trim() || "",
    createdAt: Date.now(),
  };
  await kv.set(printAssetMapIndexKey(mapId), payload, { ex: input.ttlSeconds });
}
