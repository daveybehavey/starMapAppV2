/**
 * Merchant Center variant landing pages — manifest + routing contract.
 *
 * This module is deliberately dependency-free (its only import is a
 * type) so it can be loaded from `buildSitemapEntries.ts`, whose unit
 * tests use a resolve hook that cannot follow the app's "@/" alias.
 * The price-resolving half of the feature lives in
 * `src/lib/variantPages.ts`, which re-exports everything here.
 *
 * The manifest carries identity and presentation facts only (slug,
 * size, image, feed ids, labels) — never prices. Amounts resolve
 * through checkout's own helpers in `src/lib/pricing.ts`; see
 * variantPages.ts for the parity rule.
 *
 * The keepsake card (`card_4x6`) is deliberately excluded: checkout only
 * ever sells it as an add-on to a framed order, so a standalone landing
 * page would advertise a product that cannot be bought. Its slug is not
 * in the manifest and the route 404s it like any unknown slug.
 */
import type { PrintVariant } from "./printCatalog";

export type VariantMarket = "usd" | "cad";
export type VariantCurrency = "USD" | "CAD";

export const VARIANT_PAGE_MARKETS: readonly VariantMarket[] = ["usd", "cad"];

export interface VariantPageManifestRow {
  slug: string;
  variant: PrintVariant;
  /** Merchant Center item id for this variant (market feeds share it). */
  feedId: string;
  /** Merchant Center item_group_id, where the feed groups sizes. */
  itemGroupId?: string;
  /** Feed title for the row; also the page H1 / schema name. */
  title: string;
  /** Feed description for the row; also the schema/meta description. */
  description: string;
  sizeLabel: string;
  /** Public asset path for the main product image (feed image_link). */
  imagePath: string;
  /** Public asset path for the lifestyle/additional image, when one exists. */
  additionalImagePath?: string;
  /** Merchant Center shipping_label for the row. */
  shippingLabel: string;
  /** Google product category id used by the feed (and the schema). */
  googleProductCategory: string;
}

export const VARIANT_PAGE_MANIFEST: readonly VariantPageManifestRow[] = [
  {
    slug: "poster-18x18",
    variant: "poster_unframed",
    feedId: "smc-poster-18x18",
    itemGroupId: "smc-poster",
    title: "Personalized Star Map - Poster - 18 x 18 in - Unframed",
    description:
      "Personalized star map of the night sky over a chosen place on a chosen date, printed to order as an unframed poster, 18 x 18 inches. The buyer creates the map in the online editor (date, location and their own text) and approves the preview before printing. Museum-grade poster stock. Made to order; production typically takes 2 to 5 business days before shipping.",
    sizeLabel: "18 x 18 in",
    imagePath: "/printproof/unframed-mockup.jpg",
    shippingLabel: "smc_poster",
    googleProductCategory: "500044",
  },
  {
    slug: "poster-16x16",
    variant: "poster_unframed_16x16",
    feedId: "smc-poster-16x16",
    itemGroupId: "smc-poster",
    title: "Personalized Star Map - Poster - 16 x 16 in - Unframed",
    description:
      "Personalized star map of the night sky over a chosen place on a chosen date, printed to order as an unframed poster, 16 x 16 inches. The buyer creates the map in the online editor (date, location and their own text) and approves the preview before printing. Museum-grade poster stock. Made to order; production typically takes 2 to 5 business days before shipping.",
    sizeLabel: "16 x 16 in",
    // No distinct 16x16 product asset exists yet; both poster sizes share
    // the 18x18 proof image (known gap, tracked with the feed work).
    imagePath: "/printproof/unframed-mockup.jpg",
    shippingLabel: "smc_poster",
    googleProductCategory: "500044",
  },
  {
    slug: "framed-14x14",
    variant: "poster_framed",
    feedId: "smc-framed-14x14",
    title: "Personalized Star Map - Framed Print - 14 x 14 in",
    description:
      "Personalized star map of the night sky over a chosen place on a chosen date, printed to order and supplied framed and ready to hang, 14 x 14 inches. The buyer creates the map in the online editor (date, location and their own text) and approves the preview before printing. Made to order; production typically takes 2 to 5 business days before shipping.",
    sizeLabel: "14 x 14 in",
    imagePath: "/printproof/framed-mockup.jpg",
    additionalImagePath: "/home-mockups/offer-framed-print.png",
    shippingLabel: "smc_framed",
    googleProductCategory: "500044",
  },
  {
    slug: "canvas-14x14",
    variant: "canvas_wrap",
    feedId: "smc-canvas-14x14",
    title: "Personalized Star Map - Canvas Gallery Wrap - 14 x 14 in",
    description:
      "Personalized star map of the night sky over a chosen place on a chosen date, printed to order as a gallery-wrap canvas stretched over a wooden frame, 14 x 14 inches. The buyer creates the map in the online editor (date, location and their own text) and approves the preview before printing. Made to order; production typically takes 2 to 5 business days before shipping.",
    sizeLabel: "14 x 14 in",
    imagePath: "/printproof/canvas-printful.jpg",
    shippingLabel: "smc_canvas",
    googleProductCategory: "500044",
  },
  {
    slug: "mug-11oz",
    variant: "mug_11oz",
    feedId: "smc-mug",
    title: "Personalized Star Map - Black Glossy Mug - 11 oz",
    description:
      "Personalized star map of the night sky over a chosen place on a chosen date, printed to order on a black glossy 11 oz mug. The buyer creates the map in the online editor (date, location and their own text) and approves the preview before printing. Made to order; production typically takes 2 to 5 business days before shipping.",
    sizeLabel: "11 oz",
    imagePath: "/printproof/gift-raw/mug/mug-printful.jpg",
    additionalImagePath: "/printproof/gift-raw/mug/mug-mockup.jpg",
    shippingLabel: "smc_mug",
    googleProductCategory: "2169",
  },
];

/**
 * Catalog rows deliberately given NO landing page. Every PRINT_CATALOG
 * row must appear either in the manifest or here (test T2 enforces it),
 * so adding a catalog variant forces an explicit page/no-page decision.
 */
export const VARIANT_PAGE_EXCLUDED_VARIANTS: readonly PrintVariant[] = ["card_4x6"];

const ROW_BY_SLUG = new Map(VARIANT_PAGE_MANIFEST.map((row) => [row.slug, row]));

export function getVariantPageRow(slug: string): VariantPageManifestRow | undefined {
  return ROW_BY_SLUG.get(slug);
}

export function isVariantMarket(value: unknown): value is VariantMarket {
  return value === "usd" || value === "cad";
}

export interface VariantPageParams {
  slug: string;
  market: VariantMarket;
  row: VariantPageManifestRow;
}

/**
 * Route param validation — the single place the page (and test T3) ask
 * "is this a real variant page?". Exact lowercase matches only: unknown
 * variants, unknown markets, and excluded slugs (e.g. `card-4x6`, any
 * spelling) all resolve to null and the route answers 404.
 */
export function parseVariantPageParams(
  variantRaw: unknown,
  marketRaw: unknown
): VariantPageParams | null {
  if (typeof variantRaw !== "string" || !isVariantMarket(marketRaw)) return null;
  const row = ROW_BY_SLUG.get(variantRaw);
  if (!row) return null;
  return { slug: row.slug, market: marketRaw, row };
}

export function buildVariantPagePath(slug: string, market: VariantMarket): string {
  return `/products/star-map/${slug}/${market}`;
}

/** All landing-page paths (manifest x markets) — the sitemap source list. */
export function listVariantPagePaths(): string[] {
  return VARIANT_PAGE_MANIFEST.flatMap((row) =>
    VARIANT_PAGE_MARKETS.map((market) => buildVariantPagePath(row.slug, market))
  );
}
