import { isValidMapId } from "@/lib/mapId";
import {
  getMerchPublicDisplayLabel,
  getMerchPublicDisplayPriceCents,
  listMerchFamiliesEnabledForPublicUi,
  type MerchFamilyId,
} from "@/lib/merchCatalog";
import { PAYWALL_PRINT_CHECKOUT_ROWS } from "@/lib/printCatalog";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

export type MapCommerceProductKind = "digital_hd" | "print" | "merch" | "edit";

export type MapCommerceOffer = {
  id: string;
  kind: MapCommerceProductKind;
  label: string;
  detail: string;
  priceLine: string;
  href: string;
  badge?: string;
  recommended?: boolean;
};

const PRINT_CHECKOUT_ENABLED = /^(1|true|yes)$/i.test(
  (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
);

export function isMapCommercePrintEnabled(): boolean {
  return PRINT_CHECKOUT_ENABLED;
}

export function buildMapEditorHref(mapId: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({
    map_id: mapId,
    mode: "quick",
    source: "map-hub",
    ...params,
  });
  return `/editor?${search.toString()}`;
}

function printOfferPriceLine(variant: (typeof PAYWALL_PRINT_CHECKOUT_ROWS)[number]["variant"]): string {
  const tiers = getPrintPricingTiers();
  const tier = tiers[variant];
  return formatPrice(tier.amountCents, tier.currency);
}

function listPrintOffers(mapId: string): MapCommerceOffer[] {
  if (!PRINT_CHECKOUT_ENABLED) return [];

  const picks = PAYWALL_PRINT_CHECKOUT_ROWS.filter(
    (row) =>
      (row.recommended && row.includeDigitalAddOn) ||
      (row.variant === "poster_unframed" && !row.includeDigitalAddOn && !row.includeCardAddOn) ||
      Boolean(row.includeCardAddOn)
  );

  return picks.map((row) => {
    const params: Record<string, string> = {
      checkout: "print",
      print_variant: row.variant,
    };
    if (row.includeDigitalAddOn) params.include_digital_addon = "1";
    if (row.includeCardAddOn) params.include_card_addon = "1";

    return {
      id: `print-${row.variant}${row.includeDigitalAddOn ? "-hd" : ""}${row.includeCardAddOn ? "-card" : ""}`,
      kind: "print",
      label: row.headline ?? getPrintPricingTiers()[row.variant].label,
      detail: row.includeDigitalAddOn
        ? "Framed wall gift plus instant HD download."
        : row.includeCardAddOn
          ? "Framed print with a matching keepsake card."
          : "Museum-grade poster — frame it yourself.",
      priceLine: printOfferPriceLine(row.variant),
      href: buildMapEditorHref(mapId, params),
      badge: row.recommended ? "Premium gift" : row.includeCardAddOn ? "Bundle" : undefined,
      recommended: Boolean(row.recommended),
    };
  });
}

function listMerchOffers(mapId: string): MapCommerceOffer[] {
  return listMerchFamiliesEnabledForPublicUi().map((family) => ({
    id: `merch-${family.id}`,
    kind: "merch",
    label: getMerchPublicDisplayLabel(family),
    detail: "Same star map on a small physical keepsake.",
    priceLine: formatPrice(getMerchPublicDisplayPriceCents(family), "usd"),
    href: buildMapEditorHref(mapId, { merch_family: family.id as MerchFamilyId }),
  }));
}

/** Curated shop offers for a saved map (share page + post-purchase upsell). */
export function listMapCommerceOffers(mapId: string): MapCommerceOffer[] {
  if (!isValidMapId(mapId)) return [];

  const tiers = getPricingTiers();
  const hd = tiers.single;

  const offers: MapCommerceOffer[] = [
    {
      id: "digital-hd",
      kind: "digital_hd",
      label: "HD digital download",
      detail: "Instant high-resolution file for sharing or printing at home.",
      priceLine: formatPrice(hd.amountCents, hd.currency),
      href: buildMapEditorHref(mapId, { checkout: "hd" }),
      badge: "Instant",
    },
    ...listPrintOffers(mapId),
    ...listMerchOffers(mapId),
    {
      id: "edit-design",
      kind: "edit",
      label: "Edit this design",
      detail: "Tweak the message, style, or format before you order.",
      priceLine: "Free preview",
      href: buildMapEditorHref(mapId),
    },
  ];

  return offers;
}
