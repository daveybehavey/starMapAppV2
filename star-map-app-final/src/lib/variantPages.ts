/**
 * Merchant Center variant landing pages — offer resolver.
 *
 * One page per (print variant x market) at
 * `/products/star-map/<slug>/<market>` exists to be the `link` target of
 * the Phase B Merchant Center feeds: it opens with the exact variant
 * selected, its price in the raw HTML, and one matching Product/Offer
 * in JSON-LD.
 *
 * PRICE PARITY RULE (the whole point of this module): amounts are NEVER
 * stored here or in the manifest. USD resolves through
 * `getPrintPricingTiers()` and CAD through `getPrintCadPriceCents()` in
 * `src/lib/pricing.ts` — the exact functions the checkout route uses —
 * so the page price and the checkout price are the same number by
 * construction, not by maintenance. If a price literal ever appears in
 * this file or the manifest, the build is wrong.
 *
 * The manifest + routing contract lives in
 * `src/lib/variantPageManifest.ts` (dependency-free so the sitemap
 * builder can load it under the unit tests' plain resolve hook) and is
 * re-exported here so the page and tests have a single import surface.
 */
import type { Metadata } from "next";
import type { PrintVariant } from "@/lib/printCatalog";
import { buildPrintEditorCheckoutHref } from "@/lib/printCheckoutConfig";
import { formatPrice, getPrintCadPriceCents, getPrintPricingTiers } from "@/lib/pricing";
import {
  VARIANT_PAGE_MANIFEST,
  getVariantPageRow,
  isVariantMarket,
  type VariantCurrency,
  type VariantMarket,
} from "./variantPageManifest";

export {
  VARIANT_PAGE_EXCLUDED_VARIANTS,
  VARIANT_PAGE_MANIFEST,
  VARIANT_PAGE_MARKETS,
  buildVariantPagePath,
  getVariantPageRow,
  isVariantMarket,
  listVariantPagePaths,
  parseVariantPageParams,
} from "./variantPageManifest";
export type {
  VariantCurrency,
  VariantMarket,
  VariantPageManifestRow,
  VariantPageParams,
} from "./variantPageManifest";

function variantPageSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/$/, "");
}

export interface ResolvedVariantOffer {
  slug: string;
  market: VariantMarket;
  variant: PrintVariant;
  feedId: string;
  itemGroupId?: string;
  title: string;
  /** Checkout's own tier label for the variant (env/fallback chain). */
  label: string;
  description: string;
  sizeLabel: string;
  amountCents: number;
  currency: VariantCurrency;
  /** Unambiguous display price, e.g. "$49.00 USD" (formatPrice). */
  formattedPrice: string;
  /** Local public asset path (for next/image). */
  imagePath: string;
  additionalImagePath?: string;
  /** Absolute image URL (schema / OpenGraph / feed image_link). */
  imageUrl: string;
  additionalImageUrl?: string;
  shippingLabel: string;
  googleProductCategory: string;
  /** Route path for this page, e.g. /products/star-map/framed-14x14/usd. */
  path: string;
  /** Absolute self-canonical URL for this page. */
  canonicalUrl: string;
  /** Editor hand-off with this variant preselected; carries no price. */
  editorHref: string;
}

/**
 * Resolve the one offer a variant page displays. Amounts come from
 * checkout's own helpers — USD via `getPrintPricingTiers()`, CAD via
 * `getPrintCadPriceCents()` — never from this module. Returns null for
 * unknown/excluded slugs or unknown markets.
 */
export function resolveVariantOffer(
  variantSlug: string,
  market: VariantMarket
): ResolvedVariantOffer | null {
  const row = getVariantPageRow(variantSlug);
  if (!row || !isVariantMarket(market)) return null;

  const tier = getPrintPricingTiers()[row.variant];
  const currency: VariantCurrency = market === "cad" ? "CAD" : "USD";
  const amountCents =
    market === "cad" ? getPrintCadPriceCents(row.variant) : tier.amountCents;

  const siteUrl = variantPageSiteUrl();
  const path = `/products/star-map/${row.slug}/${market}`;

  return {
    slug: row.slug,
    market,
    variant: row.variant,
    feedId: row.feedId,
    itemGroupId: row.itemGroupId,
    title: row.title,
    label: tier.label,
    description: row.description,
    sizeLabel: row.sizeLabel,
    amountCents,
    currency,
    formattedPrice: formatPrice(amountCents, currency),
    imagePath: row.imagePath,
    additionalImagePath: row.additionalImagePath,
    imageUrl: `${siteUrl}${row.imagePath}`,
    additionalImageUrl: row.additionalImagePath
      ? `${siteUrl}${row.additionalImagePath}`
      : undefined,
    shippingLabel: row.shippingLabel,
    googleProductCategory: row.googleProductCategory,
    path,
    canonicalUrl: `${siteUrl}${path}`,
    editorHref: buildPrintEditorCheckoutHref({
      source: "variant-page",
      variant: row.variant,
    }),
  };
}

/** Metadata for a variant page; canonical is always the page's own URL. */
export function buildVariantPageMetadata(offer: ResolvedVariantOffer): Metadata {
  const title = `${offer.title} | StarMapCo`;
  return {
    title,
    description: offer.description,
    alternates: { canonical: offer.canonicalUrl },
    openGraph: {
      title,
      description: offer.description,
      url: offer.canonicalUrl,
      images: [{ url: offer.imageUrl }],
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [offer.imageUrl] },
  };
}

/**
 * Product JSON-LD for a variant page: exactly ONE Offer — the selected
 * variant in the page's market — with sku/price/currency/url taken from
 * the resolver output (never literals). No gtin/mpn: none exist
 * (identifier_exists=no in the feed).
 */
export function buildVariantProductSchema(offer: ResolvedVariantOffer) {
  const now = new Date();
  const priceValidUntil = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${offer.canonicalUrl}#product`,
    sku: offer.feedId,
    name: offer.title,
    description: offer.description,
    brand: { "@type": "Brand", name: "StarMapCo" },
    image: [offer.imageUrl],
    category: offer.googleProductCategory,
    offers: {
      "@type": "Offer",
      url: offer.canonicalUrl,
      price: (offer.amountCents / 100).toFixed(2),
      priceCurrency: offer.currency,
      priceValidUntil,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

/** Sanity export for tests: the catalog ids the manifest covers. */
export function listManifestVariants(): PrintVariant[] {
  return VARIANT_PAGE_MANIFEST.map((row) => row.variant);
}
