import type { PrintVariant } from "@/lib/printCatalog";
import { buildPrintEditorCheckoutHref, getFramedHdBundlePriceLine } from "@/lib/printCheckoutConfig";

export type MoneyPagePreviewIntent = {
  label: string;
  sourceSuffix?: string;
  checkout?: "print" | "digital";
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  plan: string;
  tone?: "recommended" | "default" | "neutral";
  detail?: string;
};

/** Factual badge — never assert buyer popularity without a named current source. */
export const FRAMED_HD_RECOMMENDED_BADGE = "Premium gift" as const;

export function buildFramedHdCheckoutHref(source: string) {
  return buildPrintEditorCheckoutHref({
    source,
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
}

export function buildFramedCheckoutHref(source: string) {
  return buildPrintEditorCheckoutHref({
    source,
    variant: "poster_framed",
  });
}

export function buildUnframedCheckoutHref(source: string) {
  return buildPrintEditorCheckoutHref({
    source,
    variant: "poster_unframed",
  });
}

/** Short factual framing for the premium gift route (no popularity claim). */
export function getFramedHdPremiumPositioningLine(bundlePriceLine?: string) {
  const price = bundlePriceLine ?? getFramedHdBundlePriceLine();
  return `Premium framed gift route (${price}) — ready-to-hang print plus instant HD from the same design.`;
}

/** Editor-open copy that positions framed + HD without claiming buyer share. */
export function getFramedHdEditorOpenDescription(bundlePriceLine?: string) {
  const price = bundlePriceLine ?? getFramedHdBundlePriceLine();
  return `Enter the date and location. We open the editor on framed + HD (${price}) — the recommended premium gift presentation.`;
}

/** Compact CTA/helper line for paywall and money-page CTAs. */
export function getFramedHdGiftCtaLine() {
  return "Recommended presentation: framed + HD — preview free, then checkout when it looks right.";
}

/** Standard gift-money-page intents: framed + HD (recommended), unframed, preview-first. */
export function buildStandardGiftPreviewIntents(_source: string): MoneyPagePreviewIntent[] {
  const bundlePriceLine = getFramedHdBundlePriceLine();
  return [
    {
      label: "Preview framed + HD gift",
      sourceSuffix: "framed-hd",
      checkout: "print",
      printVariant: "poster_framed",
      includeDigitalAddOn: true,
      plan: "print_framed_hd",
      tone: "recommended",
      detail: `${bundlePriceLine} — premium gift route with instant HD.`,
    },
    {
      label: "Preview unframed print",
      sourceSuffix: "unframed",
      checkout: "print",
      printVariant: "poster_unframed",
      plan: "print_unframed",
      tone: "default",
      detail: "Lower-cost physical option when you already have a frame plan.",
    },
    {
      label: "Preview first, decide later",
      sourceSuffix: "preview",
      plan: "preview",
      tone: "neutral",
      detail: "Keep the editor neutral until the design feels final.",
    },
  ];
}

export function getGiftLadderIntro(options?: { occasionLabel?: string }) {
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const occasion = options?.occasionLabel?.trim();
  if (occasion) {
    return `One free preview for ${occasion.toLowerCase()} — recommended presentation is framed + HD (${bundlePriceLine}). Unframed is the lower-cost physical option; HD-only is fastest for same-day gifting.`;
  }
  return `One free preview — recommended presentation is framed + HD (${bundlePriceLine}). Unframed is the lower-cost physical option; HD-only is fastest for same-day gifting.`;
}
