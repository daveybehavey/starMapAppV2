import { getMerchFamily, type MerchFamilyId } from "@/lib/merchCatalog";
import { getCatalogVariantIndexForMerchFamily, resolveCatalogVariantIdFromIndex } from "@/lib/printfulCatalogV2";

export type ResolvedMerchVariant = {
  familyId: MerchFamilyId;
  catalogProductId: number;
  catalogVariantId: number;
  sellingRegionName: "worldwide";
  placement: "default" | "front";
  technique: "digital" | "dtg";
  options: {
    size?: string;
    color?: string;
  };
};

export class MerchResolutionError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeOption(value: string) {
  return value.trim();
}

function normalizeSize(value: string) {
  const trimmed = value.trim();
  // Accept "3x3" or "3 x 3" as "3×3" (matches curated catalog strings).
  const normalized = trimmed.replace(/(\d(?:\.\d+)?)\s*[x×]\s*(\d(?:\.\d+)?)/gi, "$1×$2");
  return normalized;
}

export async function resolveMerchSelection(input: {
  familyId: MerchFamilyId;
  options: { size?: string | null; color?: string | null };
}): Promise<ResolvedMerchVariant> {
  const family = getMerchFamily(input.familyId);

  const size = typeof input.options.size === "string" ? normalizeSize(input.options.size) : "";
  const color = typeof input.options.color === "string" ? normalizeOption(input.options.color) : "";

  for (const required of family.requiredOptions) {
    if (required === "size" && !size) throw new MerchResolutionError("Select a size to continue.", "merch_size_required");
    if (required === "color" && !color)
      throw new MerchResolutionError("Select a color to continue.", "merch_color_required");
  }

  if (family.options.size && size && !family.options.size.includes(size)) {
    throw new MerchResolutionError("That size isn't available for this product.", "merch_size_invalid");
  }
  if (family.options.color && color && !family.options.color.includes(color)) {
    throw new MerchResolutionError("That color isn't available for this product.", "merch_color_invalid");
  }

  // Fixed variant families (stickers/magnets/pins) resolve purely from size (curated).
  if (family.fixedVariantMap) {
    const key =
      family.requiredOptions.length === 1 && family.requiredOptions[0] === "size"
        ? size
        : `${color}__${size}`;
    const resolved = family.fixedVariantMap[key];
    if (!resolved) {
      throw new MerchResolutionError("That option combination isn't available.", "merch_variant_not_found", 404);
    }
    return {
      familyId: family.id,
      catalogProductId: family.printfulCatalogProductId,
      catalogVariantId: resolved,
      sellingRegionName: family.sellingRegionName,
      placement: family.placement,
      technique: family.technique,
      options: { size: size || undefined, color: color || undefined },
    };
  }

  // Apparel: use Printful v2 catalog variants index (color+size -> catalog_variant_id).
  const index = await getCatalogVariantIndexForMerchFamily(family.id);
  const catalogVariantId = resolveCatalogVariantIdFromIndex(index, color, size);
  if (!catalogVariantId) {
    throw new MerchResolutionError("That size/color combination isn't available right now.", "merch_variant_not_found", 404);
  }

  return {
    familyId: family.id,
    catalogProductId: family.printfulCatalogProductId,
    catalogVariantId,
    sellingRegionName: family.sellingRegionName,
    placement: family.placement,
    technique: family.technique,
    options: { size: size || undefined, color: color || undefined },
  };
}

