import type { PrintVariant } from "@/lib/printCatalog";
import { PAYWALL_LIVE_PRINT_VARIANTS } from "@/lib/printCatalog";
import { PRINT_PROOF_IMAGE_PATHS } from "@/lib/printProofImagePaths";

export type DownloadPrintUpsellCardDefinition = {
  variant: PrintVariant;
  badge: string;
  detail: string;
  bestFor: string;
  sceneLabel: string;
  sceneClass: string;
  imageClass: string;
  imageSrc: string;
  fallbackSrc: string;
};

const DOWNLOAD_PRINT_CARD_META: Record<
  PrintVariant,
  {
    badge: string;
    detail: string;
    bestFor: string;
    sceneLabel: string;
    sceneClass: string;
    imageClass: string;
  }
> = {
  poster_framed: {
    badge: "Best gift",
    sceneLabel: "Wall-ready proof",
    detail: "Ready-to-hang presentation that already feels like the finished gift.",
    bestFor: "Best for premium gifting",
    sceneClass: "proof-wall-stage proof-wall-stage--gallery",
    imageClass: "proof-wall-image object-contain px-5 py-6 sm:px-6 sm:py-7",
  },
  poster_unframed: {
    badge: "Lower total",
    sceneLabel: "Tabletop proof",
    detail: "Professional print route if you already know how you want to frame it.",
    bestFor: "Best for lower-cost physical delivery",
    sceneClass: "proof-wall-stage proof-wall-stage--tabletop",
    imageClass: "proof-wall-image object-contain px-5 py-6 sm:px-6 sm:py-7",
  },
  canvas_wrap: {
    badge: "Gallery wrap",
    sceneLabel: "Canvas proof",
    detail: "Matte canvas on a slim frame — rich color without glass glare.",
    bestFor: "Best for cozy, modern walls",
    sceneClass: "proof-wall-stage proof-wall-stage--gallery",
    imageClass: "proof-wall-image object-contain px-5 py-6 sm:px-6 sm:py-7",
  },
  mug_11oz: {
    badge: "Daily ritual",
    sceneLabel: "Desk proof",
    detail: "Glossy mug that still shows your constellation detail up close.",
    bestFor: "Best for coffee and tea lovers",
    sceneClass: "proof-wall-stage proof-wall-stage--tabletop",
    imageClass: "proof-wall-image object-contain px-5 py-6 sm:px-6 sm:py-7",
  },
  card_4x6: {
    badge: "Heartfelt note",
    sceneLabel: "Keepsake proof",
    detail: "Folded greeting card — pair with a handwritten message.",
    bestFor: "Best for anniversaries and thank-yous",
    sceneClass: "proof-wall-stage proof-wall-stage--tabletop",
    imageClass: "proof-wall-image object-contain px-5 py-6 sm:px-6 sm:py-7",
  },
};

function proofAssets(variant: PrintVariant) {
  if (variant === "poster_unframed" || variant === "mug_11oz" || variant === "card_4x6") {
    return PRINT_PROOF_IMAGE_PATHS.unframed;
  }
  return PRINT_PROOF_IMAGE_PATHS.framed;
}

export function listDownloadPrintUpsellCards(): DownloadPrintUpsellCardDefinition[] {
  return PAYWALL_LIVE_PRINT_VARIANTS.map((variant) => {
    const imgs = proofAssets(variant);
    return {
      variant,
      ...DOWNLOAD_PRINT_CARD_META[variant],
      imageSrc: imgs.src,
      fallbackSrc: imgs.fallback,
    };
  });
}
