import { kv } from "@/lib/kv";
import {
  parsePrintAssetEntitledTtlSeconds,
  printAssetKey,
  printAssetMapIndexKey,
  type StoredPrintAsset,
} from "@/lib/printAssets";
import { indexPrintAssetForMap } from "@/lib/printAssetReuse";

export async function extendPrintAssetTtlForFulfillment(
  assetId: string,
  recipeFingerprint?: string,
): Promise<boolean> {
  const record = await kv.get<StoredPrintAsset>(printAssetKey(assetId));
  if (!record?.base64Data || !record.mimeType) return false;

  const ttlSeconds = parsePrintAssetEntitledTtlSeconds();
  await kv.set(printAssetKey(assetId), record, { ex: ttlSeconds });

  if (record.mapId) {
    const index = await kv.get<{ assetId: string; recipeFingerprint?: string }>(
      printAssetMapIndexKey(record.mapId),
    );
    if (index?.assetId === assetId) {
      await indexPrintAssetForMap({
        mapId: record.mapId,
        assetId,
        recipeFingerprint: recipeFingerprint ?? index.recipeFingerprint,
        ttlSeconds,
      });
    }
  }

  return true;
}
