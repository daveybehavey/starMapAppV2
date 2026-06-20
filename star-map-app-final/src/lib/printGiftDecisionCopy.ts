import type { AspectRatio } from "@/lib/types";
import type { PrintVariant } from "@/lib/printCatalog";
import { getPrintFramedHdBundleTimingLine } from "@/lib/commerceFacts";
import { getPrintProductionReviewDisclosure } from "@/lib/printCheckoutConfig";
import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";

export function describeAspectRatioLabel(aspectRatio: AspectRatio): string {
  switch (aspectRatio) {
    case "3:4":
      return "3:4 portrait";
    case "2:3":
      return "2:3 portrait";
    case "4:5":
      return "4:5 portrait";
    default:
      return "square";
  }
}

export function getPosterAspectMismatchMessage(aspectRatio: AspectRatio): string {
  if (aspectRatio === "square") return "";
  return `Poster prints are square (18×18 unframed, 14×14 framed). Your map is ${describeAspectRatioLabel(
    aspectRatio,
  )} — switch to Square in Advanced before checkout to avoid letterboxing on the print.`;
}

export function getPrintSizingLine(variant: PrintVariant = "poster_framed"): string {
  switch (variant) {
    case "poster_framed":
      return "Framed: 14×14 in finished size, ready to hang.";
    case "poster_unframed":
      return "Unframed poster: 18×18 in — plan your own frame.";
    case "canvas_wrap":
      return "Canvas gallery wrap: edge-to-edge print, gallery-style mount.";
    case "mug_11oz":
      return "11 oz mug — wrap print on glossy black ceramic.";
    default:
      return "Physical size is fixed per SKU — preview your map before checkout.";
  }
}

export function getPrintProductionEtaLine(): string {
  return getPrintProductionReviewDisclosure();
}

export function getPrintDeliveryEtaLine(
  printShippingCountry: string | null | undefined,
  variant: PrintVariant = "poster_framed",
): string | null {
  if (!printShippingCountry) return null;
  return formatPrintDeliveryDisclosure(variant, printShippingCountry);
}

export const PRINT_GIFT_TIER_STEPS = [
  {
    id: "digital",
    label: "HD digital",
    detail: "Instant download — best for same-night gifting or DIY printing.",
  },
  {
    id: "poster",
    label: "Unframed poster",
    detail: "Lower total — you supply the frame (18×18).",
  },
  {
    id: "framed_hd",
    label: "Framed + HD",
    detail: `Most popular — gift-ready wall art plus instant HD file. ${getPrintFramedHdBundleTimingLine()}`,
  },
  {
    id: "framed_card",
    label: "Framed + keepsake card",
    detail: "Main gift on the wall plus a small 4×6 card from the same map.",
  },
] as const;
