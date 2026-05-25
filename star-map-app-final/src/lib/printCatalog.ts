/**
 * Single source of truth for physical Printful SKUs available at Stripe checkout.
 *
 * Governance (before promoting a SKU or price change):
 * 1. Add Stripe Price ID + public price envs in **`wrangler.toml`** / dashboard; keep COGS envs aligned.
 * 2. Run **`npm run qa:print-margin`** (and shipping scripts if rates change).
 * 3. Refresh proof images / merchant feed if storefront copy or SKUs changed (**`npm run assets:commerce-refresh`**).
 * 4. Smoke: **`npm run qa:smoke:commerce`** + production **`npm run qa:live-canary`** after deploy.
 */

export const PRINT_CATALOG = [
  {
    id: "poster_unframed",
    printfulVariantId: 6242,
    printfulVariantEnv: "PRINTFUL_VARIANT_ID_POSTER_UNFRAMED",
    /** Until dedicated rows exist in printful-shipping.json, reuse this matrix for checkout quotes */
    shippingProfile: "poster_unframed",
    includesFrame: false,
    labelFallback: "Museum-grade poster (18×18)",
    priceFallbackCents: 4900,
    priceEnv: "PRINT_UNFRAMED_PRICE_CENTS",
    publicPriceEnv: "NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS",
    labelEnv: "PRINT_UNFRAMED_LABEL",
    publicLabelEnv: "NEXT_PUBLIC_PRINT_UNFRAMED_LABEL",
    stripePriceEnv: "STRIPE_PRICE_ID_PRINT_UNFRAMED",
    cogsEnv: "PRINT_COGS_POSTER_UNFRAMED_CENTS",
    defaultCogsCents: 1300,
  },
  {
    id: "poster_framed",
    printfulVariantId: 4654,
    printfulVariantEnv: "PRINTFUL_VARIANT_ID_POSTER_FRAMED",
    shippingProfile: "poster_framed",
    includesFrame: true,
    labelFallback: "Framed print (14×14)",
    priceFallbackCents: 9900,
    priceEnv: "PRINT_FRAMED_PRICE_CENTS",
    publicPriceEnv: "NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS",
    labelEnv: "PRINT_FRAMED_LABEL",
    publicLabelEnv: "NEXT_PUBLIC_PRINT_FRAMED_LABEL",
    stripePriceEnv: "STRIPE_PRICE_ID_PRINT_FRAMED",
    cogsEnv: "PRINT_COGS_POSTER_FRAMED_CENTS",
    defaultCogsCents: 5200,
  },
  {
    id: "canvas_wrap",
    printfulVariantId: 19291,
    printfulVariantEnv: "PRINTFUL_VARIANT_ID_CANVAS_WRAP",
    shippingProfile: "poster_framed",
    includesFrame: false,
    labelFallback: "Canvas gallery wrap",
    priceFallbackCents: 5900,
    priceEnv: "PRINT_CANVAS_WRAP_PRICE_CENTS",
    publicPriceEnv: "NEXT_PUBLIC_PRINT_CANVAS_WRAP_PRICE_CENTS",
    labelEnv: "PRINT_CANVAS_WRAP_LABEL",
    publicLabelEnv: "NEXT_PUBLIC_PRINT_CANVAS_WRAP_LABEL",
    stripePriceEnv: "STRIPE_PRICE_ID_PRINT_CANVAS_WRAP",
    cogsEnv: "PRINT_COGS_CANVAS_WRAP_CENTS",
    defaultCogsCents: 2800,
  },
  {
    id: "mug_11oz",
    printfulVariantId: 9323,
    printfulVariantEnv: "PRINTFUL_VARIANT_ID_MUG_11OZ",
    shippingProfile: "poster_unframed",
    includesFrame: false,
    labelFallback: "Black glossy mug (11 oz)",
    priceFallbackCents: 3900,
    priceEnv: "PRINT_MUG_11OZ_PRICE_CENTS",
    publicPriceEnv: "NEXT_PUBLIC_PRINT_MUG_11OZ_PRICE_CENTS",
    labelEnv: "PRINT_MUG_11OZ_LABEL",
    publicLabelEnv: "NEXT_PUBLIC_PRINT_MUG_11OZ_LABEL",
    stripePriceEnv: "STRIPE_PRICE_ID_PRINT_MUG_11OZ",
    cogsEnv: "PRINT_COGS_MUG_11OZ_CENTS",
    defaultCogsCents: 1200,
  },
  {
    id: "card_4x6",
    printfulVariantId: 14457,
    printfulVariantEnv: "PRINTFUL_VARIANT_ID_CARD_4X6",
    shippingProfile: "poster_unframed",
    includesFrame: false,
    labelFallback: "Greeting card (4×6)",
    priceFallbackCents: 1900,
    priceEnv: "PRINT_CARD_4X6_PRICE_CENTS",
    publicPriceEnv: "NEXT_PUBLIC_PRINT_CARD_4X6_PRICE_CENTS",
    labelEnv: "PRINT_CARD_4X6_LABEL",
    publicLabelEnv: "NEXT_PUBLIC_PRINT_CARD_4X6_LABEL",
    stripePriceEnv: "STRIPE_PRICE_ID_PRINT_CARD_4X6",
    cogsEnv: "PRINT_COGS_CARD_4X6_CENTS",
    defaultCogsCents: 450,
  },
] as const;

export type PrintCatalogRow = (typeof PRINT_CATALOG)[number];

export type PrintVariant = PrintCatalogRow["id"];

const VARIANT_SET = new Set<string>(PRINT_CATALOG.map((row) => row.id));

export function isPrintVariant(value: unknown): value is PrintVariant {
  return typeof value === "string" && VARIANT_SET.has(value);
}

export function parsePrintVariant(raw: unknown, fallback: PrintVariant = "poster_framed"): PrintVariant {
  return isPrintVariant(raw) ? raw : fallback;
}

export function getPrintCatalogRow(id: PrintVariant): PrintCatalogRow {
  const row = PRINT_CATALOG.find((entry) => entry.id === id);
  if (!row) throw new Error(`Unknown print variant: ${id}`);
  return row;
}

/** Posters only on primary paywall until canvas / mug / card pilots pass QA */
export const PAYWALL_LIVE_PRINT_VARIANTS: readonly PrintVariant[] = [
  "poster_framed",
  "poster_unframed",
];

/** Stripe Checkout success URLs + download upsell ordering (live SKUs first) */
export const PAYWALL_PRINT_VARIANT_ORDER: readonly PrintVariant[] = [
  ...PAYWALL_LIVE_PRINT_VARIANTS,
  "canvas_wrap",
  "mug_11oz",
  "card_4x6",
];

export type PaywallPrintCheckoutRow = {
  variant: PrintVariant;
  includeDigitalAddOn: boolean;
  /** Falls back to catalog tier label when omitted */
  headline?: string;
  recommended?: boolean;
};

/** Physical SKU CTAs shown on paywall + editor mobile/desktop print panels */
export const PAYWALL_PRINT_CHECKOUT_ROWS: readonly PaywallPrintCheckoutRow[] = [
  {
    variant: "poster_framed",
    includeDigitalAddOn: true,
    headline: "Framed + HD (recommended)",
    recommended: true,
  },
  { variant: "poster_framed", includeDigitalAddOn: false, headline: "Framed print" },
  { variant: "poster_unframed", includeDigitalAddOn: false, headline: "Unframed poster" },
] as const;

export type PrintShippingProfile = "poster_unframed" | "poster_framed";

export function getPrintShippingProfile(variant: PrintVariant): PrintShippingProfile {
  return getPrintCatalogRow(variant).shippingProfile;
}
