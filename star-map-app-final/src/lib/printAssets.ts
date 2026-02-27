export type StoredPrintAsset = {
  mapId?: string;
  mimeType: "image/png" | "image/jpeg";
  base64Data: string;
  createdAt: number;
  source?: "editor" | "download";
};

export const PRINT_ASSET_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function printAssetKey(assetId: string) {
  return `print:asset:${assetId}`;
}

export function parsePrintAssetTtlSeconds() {
  const raw = process.env.PRINT_ASSET_TTL_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 14;
  return safeDays * 24 * 60 * 60;
}

