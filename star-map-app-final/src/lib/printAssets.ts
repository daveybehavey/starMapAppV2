export type StoredPrintAsset = {
  mapId?: string;
  mimeType: "image/png" | "image/jpeg";
  base64Data: string;
  createdAt: number;
  source?: "editor" | "download";
};

export type PrintAssetMapIndex = {
  assetId: string;
  recipeFingerprint: string;
  createdAt: number;
};

export const PRINT_ASSET_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function printAssetKey(assetId: string) {
  return `print:asset:${assetId}`;
}

export function printAssetMapIndexKey(mapId: string) {
  return `print:asset:map:${mapId}`;
}

export function normalizeRecipeFingerprint(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 8192) return undefined;
  return trimmed;
}

export function shouldReuseIndexedPrintAsset(input: {
  mapId: string;
  recipeFingerprint?: string;
  index?: PrintAssetMapIndex | null;
  asset?: StoredPrintAsset | null;
}): string | undefined {
  const { mapId, recipeFingerprint, index, asset } = input;
  if (!index || !asset) return undefined;
  if (!PRINT_ASSET_ID_REGEX.test(index.assetId)) return undefined;
  if (asset.mapId !== mapId) return undefined;
  if (recipeFingerprint && index.recipeFingerprint !== recipeFingerprint) return undefined;
  return index.assetId;
}

export function parsePrintAssetTtlSeconds() {
  const raw = process.env.PRINT_ASSET_TTL_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 14;
  return safeDays * 24 * 60 * 60;
}

/** Longer TTL once a paid order references the asset (Printful may fetch late). */
export function parsePrintAssetEntitledTtlSeconds() {
  const raw = process.env.PRINT_ASSET_ENTITLED_TTL_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 60;
  return safeDays * 24 * 60 * 60;
}

