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
      detail: `${bundlePriceLine} — most gift buyers choose this path.`,
    },
    {
      label: "Preview unframed print",
      sourceSuffix: "unframed",
      checkout: "print",
      printVariant: "poster_unframed",
      plan: "print_unframed",
      tone: "default",
      detail: "Lower total when you already have a frame plan.",
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
    return `One free preview for ${occasion.toLowerCase()} — most gift buyers choose framed + HD (${bundlePriceLine}). Unframed lowers the total; HD-only is fastest for same-day gifting.`;
  }
  return `One free preview — most gift buyers choose framed + HD (${bundlePriceLine}). Unframed lowers the total; HD-only is fastest for same-day gifting.`;
}
