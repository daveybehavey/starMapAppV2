import {
  buildPrintEditorCheckoutHref,
  formatPrintPriceWithShipping,
  getFramedHdBundlePriceLine,
} from "@/lib/printCheckoutConfig";
import { buildDigitalEditorCheckoutHref } from "@/lib/digitalGiftCheckout";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";

export type GiftFormatTierId = "digital" | "poster" | "framed_hd" | "framed_card" | "canvas";

export type GiftFormatTier = {
  id: GiftFormatTierId;
  label: string;
  priceLine: string;
  detail: string;
  recommended?: boolean;
  href: string;
  cta: string;
};

export function buildGiftFormatTiers(
  sourcePrefix: string,
  options?: { includeCanvas?: boolean; digitalRecommended?: boolean },
): GiftFormatTier[] {
  const printTiers = getPrintPricingTiers();
  const pricing = getPricingInfo();
  const digitalPrice = formatPrice(pricing.activeAmountCents, pricing.currency);
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const cardPrice = formatPrice(printTiers.card_4x6.amountCents, printTiers.card_4x6.currency);
  const canvasPrice = formatPrintPriceWithShipping(
    printTiers.canvas_wrap.amountCents,
    printTiers.canvas_wrap.currency,
  );

  const digitalRecommended = options?.digitalRecommended === true;

  const tiers: GiftFormatTier[] = [
    {
      id: "digital",
      label: "HD digital",
      priceLine: digitalPrice,
      detail: "Instant download — same-night gift or DIY printing.",
      recommended: digitalRecommended,
      href: buildDigitalEditorCheckoutHref(`${sourcePrefix}-digital`),
      cta: "Preview instant HD",
    },
    {
      id: "poster",
      label: "Unframed poster",
      priceLine: unframedPrice,
      detail: "Lower total when you already have a frame plan.",
      href: buildPrintEditorCheckoutHref({
        source: `${sourcePrefix}-unframed`,
        variant: "poster_unframed",
      }),
      cta: "Preview poster",
    },
    {
      id: "framed_hd",
      label: "Framed + HD",
      priceLine: getFramedHdBundlePriceLine(),
      detail: "Gift-ready wall art plus instant HD from the same design.",
      recommended: !digitalRecommended,
      href: buildPrintEditorCheckoutHref({
        source: `${sourcePrefix}-framed-hd`,
        variant: "poster_framed",
        includeDigitalAddOn: true,
      }),
      cta: "Preview framed + HD",
    },
    {
      id: "framed_card",
      label: "Framed + keepsake card",
      priceLine: `${formatPrintPriceWithShipping(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency)} + ${cardPrice} card`,
      detail: "Main wall gift plus a small 4×6 card from the same map.",
      href: buildPrintEditorCheckoutHref({
        source: `${sourcePrefix}-framed-card`,
        variant: "poster_framed",
        includeCardAddOn: true,
      }),
      cta: "Preview framed + card",
    },
  ];

  if (options?.includeCanvas) {
    tiers.splice(3, 0, {
      id: "canvas",
      label: "Canvas wrap",
      priceLine: canvasPrice,
      detail: "Gallery-style premium between poster and framed.",
      href: buildPrintEditorCheckoutHref({
        source: `${sourcePrefix}-canvas`,
        variant: "canvas_wrap",
      }),
      cta: "Preview canvas",
    });
  }

  return tiers;
}
