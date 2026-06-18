import { formatPrice, getPricingInfo } from "@/lib/pricing";
import { getFramedHdBundlePriceLine } from "@/lib/printCheckoutConfig";
import type { MoneyPagePreviewIntent } from "@/lib/moneyPageGiftCheckout";
import { buildPrintEditorCheckoutHref } from "@/lib/printCheckoutConfig";

/** Editor entry with HD paywall auto-open after reveal. */
export function buildDigitalEditorCheckoutHref(source: string, mode = "quick"): string {
  const params = new URLSearchParams({
    mode,
    source,
    checkout: "digital",
  });
  return `/editor?${params.toString()}`;
}

export function getInstantHdPriceLine(): string {
  const pricing = getPricingInfo();
  return formatPrice(pricing.activeAmountCents, pricing.currency);
}

export function getInstantHdGiftDetail(): string {
  return `${getInstantHdPriceLine()} — unlocks immediately after checkout. No shipping wait.`;
}

/** HD-first preview intents (last-minute / international / DIY print). */
export function buildInstantHdPreviewIntents(_source: string): MoneyPagePreviewIntent[] {
  const instantDetail = getInstantHdGiftDetail();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  return [
    {
      label: "Preview instant HD gift",
      sourceSuffix: "instant-hd",
      checkout: "digital",
      plan: "hd_digital",
      tone: "recommended",
      detail: instantDetail,
    },
    {
      label: "Preview framed + HD gift",
      sourceSuffix: "framed-hd",
      checkout: "print",
      printVariant: "poster_framed",
      includeDigitalAddOn: true,
      plan: "print_framed_hd",
      tone: "default",
      detail: `${bundlePriceLine} — wall art plus instant file.`,
    },
    {
      label: "Preview first, decide later",
      sourceSuffix: "preview",
      plan: "preview",
      tone: "neutral",
      detail: "Open the editor without locking in a delivery path yet.",
    },
  ];
}

export function getInstantHdHeroHref(source: string): string {
  return buildDigitalEditorCheckoutHref(source);
}

export function getInstantHdLadderIntro(): string {
  const instantPrice = getInstantHdPriceLine();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  return `Need it tonight? Start with instant HD (${instantPrice}). Want a physical gift too? Framed + HD (${bundlePriceLine}) adds a shipped print from the same design.`;
}

/** Cross-link from print pages when buyer may prefer digital. */
export function buildPrintUpsellFromDigitalHref(source: string) {
  return buildPrintEditorCheckoutHref({
    source,
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
}
