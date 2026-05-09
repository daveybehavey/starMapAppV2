/**
 * Merch catalog: "product families" that resolve to Printful v2 catalog_variant_id via options.
 *
 * Best-practice goals:
 * - Keep UI scalable (no 500-variant button lists)
 * - Make server-side validation explicit
 * - Support progressive rollout with feature flags
 */

export type MerchFamilyId =
  | "sticker_kisscut"
  | "magnet_diecut"
  | "pins_set"
  | "tee_unisex_bc3001"
  | "hoodie_unisex_g18500";

export type MerchOptionKey = "size" | "color";

export type MerchFamily = {
  id: MerchFamilyId;
  label: string;
  /** Printful v2 catalog product id */
  printfulCatalogProductId: number;
  /**
   * Selling region name used by Printful v2 endpoints.
   * We start with worldwide; can be made dynamic later.
   */
  sellingRegionName: "worldwide";
  /** Placements we support when creating Printful orders. */
  placement: "default" | "front";
  technique: "digital" | "dtg";
  /** Curated option keys required for resolver. */
  requiredOptions: MerchOptionKey[];
  /** Curated option values (drives UI pickers + validation). */
  options: {
    size?: readonly string[];
    color?: readonly string[];
  };
  /**
   * When the family has a small fixed variant set, we can hardcode the catalog_variant_id map.
   * Key format: `${size}` or `${color}__${size}` depending on requiredOptions.
   */
  fixedVariantMap?: Record<string, number>;
  /** Feature flag env key (public) to enable family in UI. */
  enabledPublicEnv: string;
  /** Stripe price id env key (server) if configured; empty -> fallback price_data. */
  stripePriceEnv: string;
  /** Price fallback cents used when Stripe price id missing. */
  priceFallbackCents: number;
  /** COGS env key (server) used for margin guardrails. */
  cogsEnv: string;
  /** Default COGS cents when env missing (safe, conservative). */
  defaultCogsCents: number;
  /** Server + client env keys for display price/label if you want them configurable. */
  publicPriceEnv: string;
  publicLabelEnv: string;
  labelFallback: string;
};

export const MERCH_FAMILIES: readonly MerchFamily[] = [
  {
    id: "sticker_kisscut",
    label: "Kiss-cut stickers",
    labelFallback: "Kiss-cut stickers",
    publicLabelEnv: "NEXT_PUBLIC_MERCH_STICKERS_LABEL",
    enabledPublicEnv: "NEXT_PUBLIC_MERCH_STICKERS_ENABLED",
    printfulCatalogProductId: 358,
    sellingRegionName: "worldwide",
    placement: "default",
    technique: "digital",
    requiredOptions: ["size"],
    options: { size: ["3×3", "4×4", "5.5×5.5", "15×3.75"] },
    // Live Printful v2 catalog_variant_id samples (2026-05): product 358
    fixedVariantMap: {
      "3×3": 10163,
      "4×4": 10164,
      "5.5×5.5": 10165,
      "15×3.75": 16362,
    },
    stripePriceEnv: "STRIPE_PRICE_ID_MERCH_STICKERS",
    priceFallbackCents: 900,
    cogsEnv: "MERCH_COGS_STICKERS_CENTS",
    defaultCogsCents: 300,
    publicPriceEnv: "NEXT_PUBLIC_MERCH_STICKERS_PRICE_CENTS",
  },
  {
    id: "magnet_diecut",
    label: "Die-cut magnets",
    labelFallback: "Die-cut magnets",
    publicLabelEnv: "NEXT_PUBLIC_MERCH_MAGNETS_LABEL",
    enabledPublicEnv: "NEXT_PUBLIC_MERCH_MAGNETS_ENABLED",
    printfulCatalogProductId: 656,
    sellingRegionName: "worldwide",
    placement: "default",
    technique: "digital",
    requiredOptions: ["size"],
    options: { size: ["3×3", "4×4", "6×6"] },
    // Live Printful v2 catalog_variant_id samples (2026-05): product 656
    fixedVariantMap: { "3×3": 16366, "4×4": 16367, "6×6": 16465 },
    stripePriceEnv: "STRIPE_PRICE_ID_MERCH_MAGNETS",
    priceFallbackCents: 1400,
    cogsEnv: "MERCH_COGS_MAGNETS_CENTS",
    defaultCogsCents: 500,
    publicPriceEnv: "NEXT_PUBLIC_MERCH_MAGNETS_PRICE_CENTS",
  },
  {
    id: "pins_set",
    label: "Pin buttons",
    labelFallback: "Set of pin buttons",
    publicLabelEnv: "NEXT_PUBLIC_MERCH_PINS_LABEL",
    enabledPublicEnv: "NEXT_PUBLIC_MERCH_PINS_ENABLED",
    printfulCatalogProductId: 660,
    sellingRegionName: "worldwide",
    placement: "front",
    technique: "digital",
    requiredOptions: ["size"],
    options: { size: ["1.25\"", "2.25\""] },
    // Live Printful v2 catalog_variant_id samples (2026-05): product 660
    fixedVariantMap: { "1.25\"": 16411, "2.25\"": 16412 },
    stripePriceEnv: "STRIPE_PRICE_ID_MERCH_PINS",
    priceFallbackCents: 1400,
    cogsEnv: "MERCH_COGS_PINS_CENTS",
    defaultCogsCents: 600,
    publicPriceEnv: "NEXT_PUBLIC_MERCH_PINS_PRICE_CENTS",
  },
  {
    id: "tee_unisex_bc3001",
    label: "Unisex staple tee",
    labelFallback: "Unisex staple tee",
    publicLabelEnv: "NEXT_PUBLIC_MERCH_TEE_LABEL",
    enabledPublicEnv: "NEXT_PUBLIC_MERCH_TEE_ENABLED",
    printfulCatalogProductId: 71,
    sellingRegionName: "worldwide",
    placement: "front",
    technique: "dtg",
    requiredOptions: ["size", "color"],
    options: {
      // Curated: keep it tight to avoid massive variant matrices in UI.
      size: ["S", "M", "L", "XL", "2XL", "3XL"],
      color: ["Black", "Navy", "White", "Athletic Heather"],
    },
    stripePriceEnv: "STRIPE_PRICE_ID_MERCH_TEE",
    priceFallbackCents: 2900,
    cogsEnv: "MERCH_COGS_TEE_CENTS",
    defaultCogsCents: 1200,
    publicPriceEnv: "NEXT_PUBLIC_MERCH_TEE_PRICE_CENTS",
  },
  {
    id: "hoodie_unisex_g18500",
    label: "Unisex hoodie",
    labelFallback: "Unisex hoodie",
    publicLabelEnv: "NEXT_PUBLIC_MERCH_HOODIE_LABEL",
    enabledPublicEnv: "NEXT_PUBLIC_MERCH_HOODIE_ENABLED",
    printfulCatalogProductId: 146,
    sellingRegionName: "worldwide",
    placement: "front",
    technique: "dtg",
    requiredOptions: ["size", "color"],
    options: {
      size: ["S", "M", "L", "XL", "2XL", "3XL"],
      color: ["Black", "Navy", "Sport Grey"],
    },
    stripePriceEnv: "STRIPE_PRICE_ID_MERCH_HOODIE",
    priceFallbackCents: 4900,
    cogsEnv: "MERCH_COGS_HOODIE_CENTS",
    defaultCogsCents: 2200,
    publicPriceEnv: "NEXT_PUBLIC_MERCH_HOODIE_PRICE_CENTS",
  },
] as const;

const FAMILY_SET = new Set<string>(MERCH_FAMILIES.map((f) => f.id));

export function isMerchFamilyId(value: unknown): value is MerchFamilyId {
  return typeof value === "string" && FAMILY_SET.has(value);
}

export function getMerchFamily(id: MerchFamilyId): MerchFamily {
  const found = MERCH_FAMILIES.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown merch family: ${id}`);
  return found;
}

/** Beta gate + per-family public toggles (shop, editor, post-purchase links). */
export function isMerchPublicBetaEnabled(): boolean {
  return /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_MERCH_BETA_ENABLED || "").trim());
}

export function listMerchFamiliesEnabledForPublicUi(): MerchFamily[] {
  if (!isMerchPublicBetaEnabled()) return [];
  return MERCH_FAMILIES.filter((family) =>
    /^(1|true|yes)$/i.test((process.env[family.enabledPublicEnv] || "").trim()),
  );
}

export function getMerchPublicDisplayLabel(family: MerchFamily): string {
  const raw = process.env[family.publicLabelEnv]?.trim();
  return raw || family.labelFallback;
}

export function getMerchPublicDisplayPriceCents(family: MerchFamily): number {
  const raw = process.env[family.publicPriceEnv]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return family.priceFallbackCents;
}

/** First enabled family for lightweight CTAs (download/success). Returns null if merch UI is off. */
export function getDefaultMerchEditorHref(source: string): string | null {
  const families = listMerchFamiliesEnabledForPublicUi();
  const first = families[0];
  if (!first) return null;
  const src = encodeURIComponent(source);
  const fam = encodeURIComponent(first.id);
  return `/editor?mode=quick&source=${src}&merch_family=${fam}`;
}

export type MerchSelection = {
  family: MerchFamilyId;
  options: {
    size?: string;
    color?: string;
  };
};

