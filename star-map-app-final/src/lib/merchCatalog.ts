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
  /** Native CAD book amount (T-FLEET-103; fixed at the 1.40 reference rate — see pricing.ts). */
  priceCadFallbackCents: number;
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
    priceCadFallbackCents: 1300,
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
    priceCadFallbackCents: 2000,
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
    priceCadFallbackCents: 2000,
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
    priceCadFallbackCents: 4100,
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
    priceCadFallbackCents: 6900,
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

/**
 * Public env access for merch — LITERAL KEYS ONLY (read before adding reads).
 *
 * Next.js inlines only literal `process.env.NEXT_PUBLIC_*` member expressions
 * into client bundles. A computed read (a bracket lookup with a variable
 * key) is not inlined: in the browser it resolves against an effectively empty env object
 * and silently yields undefined, while the server still sees the real value.
 * That asymmetry shipped merch unpurchasable in Oct 2026 — /shop cards
 * rendered server-side from real flags while the browser editor resolved
 * zero enabled families and ignored the merch_family URL param entirely.
 *
 * Every NEXT_PUBLIC_* merch value is therefore read through the literal maps
 * below — one literal member expression per key, keyed by family id. The
 * per-family `enabledPublicEnv` / `publicLabelEnv` / `publicPriceEnv` fields
 * above stay as documentation of which key configures each family; a unit
 * pin asserts the maps cover exactly those keys.
 *
 * Server-only values are deliberately NOT in these maps: Stripe price ids
 * (getMerchStripePriceId) and COGS (lib/merchMargin.ts) are read only in API
 * routes where process.env is the real runtime env, so computed reads are
 * correct there.
 */
const MERCH_BETA_PUBLIC_ENV: string | undefined = process.env.NEXT_PUBLIC_MERCH_BETA_ENABLED;

const MERCH_FAMILY_ENABLED_PUBLIC_ENV: Record<MerchFamilyId, string | undefined> = {
  sticker_kisscut: process.env.NEXT_PUBLIC_MERCH_STICKERS_ENABLED,
  magnet_diecut: process.env.NEXT_PUBLIC_MERCH_MAGNETS_ENABLED,
  pins_set: process.env.NEXT_PUBLIC_MERCH_PINS_ENABLED,
  tee_unisex_bc3001: process.env.NEXT_PUBLIC_MERCH_TEE_ENABLED,
  hoodie_unisex_g18500: process.env.NEXT_PUBLIC_MERCH_HOODIE_ENABLED,
};

const MERCH_FAMILY_LABEL_PUBLIC_ENV: Record<MerchFamilyId, string | undefined> = {
  sticker_kisscut: process.env.NEXT_PUBLIC_MERCH_STICKERS_LABEL,
  magnet_diecut: process.env.NEXT_PUBLIC_MERCH_MAGNETS_LABEL,
  pins_set: process.env.NEXT_PUBLIC_MERCH_PINS_LABEL,
  tee_unisex_bc3001: process.env.NEXT_PUBLIC_MERCH_TEE_LABEL,
  hoodie_unisex_g18500: process.env.NEXT_PUBLIC_MERCH_HOODIE_LABEL,
};

const MERCH_FAMILY_PRICE_PUBLIC_ENV: Record<MerchFamilyId, string | undefined> = {
  sticker_kisscut: process.env.NEXT_PUBLIC_MERCH_STICKERS_PRICE_CENTS,
  magnet_diecut: process.env.NEXT_PUBLIC_MERCH_MAGNETS_PRICE_CENTS,
  pins_set: process.env.NEXT_PUBLIC_MERCH_PINS_PRICE_CENTS,
  tee_unisex_bc3001: process.env.NEXT_PUBLIC_MERCH_TEE_PRICE_CENTS,
  hoodie_unisex_g18500: process.env.NEXT_PUBLIC_MERCH_HOODIE_PRICE_CENTS,
};

/** Beta gate + per-family public toggles (shop, editor, post-purchase links). */
export function isMerchPublicBetaEnabled(): boolean {
  return /^(1|true|yes)$/i.test((MERCH_BETA_PUBLIC_ENV || "").trim());
}

export function listMerchFamiliesEnabledForPublicUi(): MerchFamily[] {
  if (!isMerchPublicBetaEnabled()) return [];
  return MERCH_FAMILIES.filter((family) => isMerchFamilyEnvEnabled(family.id));
}

function isMerchFamilyEnvEnabled(familyId: MerchFamilyId): boolean {
  return /^(1|true|yes)$/i.test((MERCH_FAMILY_ENABLED_PUBLIC_ENV[familyId] || "").trim());
}

/** Server checkout gate — must match public UI flags. */
export function isMerchFamilyEnabledForCheckout(familyId: MerchFamilyId): boolean {
  if (!isMerchPublicBetaEnabled()) return false;
  return isMerchFamilyEnvEnabled(familyId);
}

export function getMerchStripePriceId(family: MerchFamily): string | undefined {
  // Server-only (checkout route): process.env is the real runtime env here,
  // so the computed read is correct and this key must never move client-side.
  const raw = process.env[family.stripePriceEnv]?.trim();
  return raw || undefined;
}

export function getMerchCheckoutPriceCents(family: MerchFamily): number {
  return getMerchPublicDisplayPriceCents(family);
}

/** Native CAD book amount for a merch family (T-FLEET-103; fixed — see pricing.ts). */
export function getMerchCadCheckoutPriceCents(family: MerchFamily): number {
  return family.priceCadFallbackCents;
}

export function getMerchPublicDisplayLabel(family: MerchFamily): string {
  const raw = MERCH_FAMILY_LABEL_PUBLIC_ENV[family.id]?.trim();
  return raw || family.labelFallback;
}

export function getMerchPublicDisplayPriceCents(family: MerchFamily): number {
  const raw = MERCH_FAMILY_PRICE_PUBLIC_ENV[family.id]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return family.priceFallbackCents;
}

/** Shop anchor when the merch-beta section is rendered; null when merch UI is off. */
export function getMerchShopSectionHref(): string | null {
  if (!listMerchFamiliesEnabledForPublicUi().length) return null;
  return "/shop#merch-addons";
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

