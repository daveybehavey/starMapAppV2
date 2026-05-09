import { getMerchFamily, type MerchFamilyId } from "@/lib/merchCatalog";

type CatalogVariant = {
  id: number;
  color?: string | null;
  size?: string | null;
  // other fields exist; we only need these for resolver
};

type CatalogVariantsResponse = {
  data?: CatalogVariant[];
  paging?: { total?: number; limit?: number; offset?: number };
};

type CatalogVariantKey = `${string}__${string}`;

type CatalogVariantIndex = {
  /** Keyed by `${color}__${size}` (both normalized). */
  byColorSize: Map<CatalogVariantKey, number>;
  /** Also keep the raw variant list count for diagnostics. */
  total: number;
};

const cache = new Map<string, Promise<CatalogVariantIndex>>();

function normalizeKeyPart(value: string) {
  return value.trim().toLowerCase();
}

function keyColorSize(color: string, size: string): CatalogVariantKey {
  return `${normalizeKeyPart(color)}__${normalizeKeyPart(size)}`;
}

function getPrintfulApiBase() {
  return (process.env.PRINTFUL_API_BASE_URL?.trim() || "https://api.printful.com").replace(/\/+$/, "");
}

function getPrintfulToken() {
  return process.env.PRINTFUL_API_TOKEN?.trim() || "";
}

async function fetchJson(pathname: string): Promise<unknown> {
  const base = getPrintfulApiBase();
  const token = getPrintfulToken();
  if (!token) throw new Error("printful_token_missing");

  const res = await fetch(`${base}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-printful-catalog-v2",
    },
    // Vercel/Node: avoid caching surprises
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && (json as { error?: { message?: unknown } }).error?.message
        ? String((json as { error: { message: unknown } }).error.message).slice(0, 240)
        : text.slice(0, 240);
    throw new Error(`printful_v2_${res.status}:${msg}`);
  }
  return json;
}

async function fetchAllCatalogVariants(productId: number, sellingRegionName: string): Promise<CatalogVariant[]> {
  const out: CatalogVariant[] = [];
  const limit = 100;
  for (let offset = 0; offset < 5000; offset += limit) {
    const json = (await fetchJson(
      `/v2/catalog-products/${productId}/catalog-variants?offset=${offset}&limit=${limit}&selling_region_name=${encodeURIComponent(
        sellingRegionName,
      )}`,
    )) as CatalogVariantsResponse;
    const data = Array.isArray(json?.data) ? json.data : [];
    for (const v of data) {
      if (typeof v?.id === "number") out.push(v);
    }
    const total = typeof json?.paging?.total === "number" ? json.paging.total : null;
    if (!data.length) break;
    if (total !== null && offset + limit >= total) break;
    if (data.length < limit) break;
  }
  return out;
}

export async function getCatalogVariantIndexForMerchFamily(familyId: MerchFamilyId): Promise<CatalogVariantIndex> {
  const family = getMerchFamily(familyId);
  const cacheKey = `${family.printfulCatalogProductId}:${family.sellingRegionName}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const variants = await fetchAllCatalogVariants(family.printfulCatalogProductId, family.sellingRegionName);
    const byColorSize = new Map<CatalogVariantKey, number>();
    for (const v of variants) {
      const color = typeof v.color === "string" ? v.color : "";
      const size = typeof v.size === "string" ? v.size : "";
      if (!color.trim() || !size.trim()) continue;
      byColorSize.set(keyColorSize(color, size), v.id);
    }
    return { byColorSize, total: variants.length } satisfies CatalogVariantIndex;
  })();

  cache.set(cacheKey, promise);
  return promise;
}

export function resolveCatalogVariantIdFromIndex(index: CatalogVariantIndex, color: string, size: string): number | null {
  const id = index.byColorSize.get(keyColorSize(color, size));
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : null;
}

