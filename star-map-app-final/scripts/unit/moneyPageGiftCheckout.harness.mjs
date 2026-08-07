/** Keep in sync with src/lib/moneyPageGiftCheckout.ts factual positioning helpers. */

export const FRAMED_HD_RECOMMENDED_BADGE = "Premium gift";

export function getFramedHdPremiumPositioningLine(bundlePriceLine = "$106 framed + HD · free shipping") {
  return `Premium framed gift route (${bundlePriceLine}) — ready-to-hang print plus instant HD from the same design.`;
}

export function getFramedHdEditorOpenDescription(bundlePriceLine = "$106 framed + HD · free shipping") {
  return `Enter the date and location. We open the editor on framed + HD (${bundlePriceLine}) — the recommended premium gift presentation.`;
}

export function getFramedHdGiftCtaLine() {
  return "Recommended presentation: framed + HD — preview free, then checkout when it looks right.";
}

export function getGiftLadderIntro(options = {}, bundlePriceLine = "$106 framed + HD · free shipping") {
  const occasion = typeof options.occasionLabel === "string" ? options.occasionLabel.trim() : "";
  if (occasion) {
    return `One free preview for ${occasion.toLowerCase()} — recommended presentation is framed + HD (${bundlePriceLine}). Unframed is the lower-cost physical option; HD-only is fastest for same-day gifting.`;
  }
  return `One free preview — recommended presentation is framed + HD (${bundlePriceLine}). Unframed is the lower-cost physical option; HD-only is fastest for same-day gifting.`;
}

export function buildStandardGiftPreviewIntentDetails(bundlePriceLine = "$106 framed + HD · free shipping") {
  return [
    `${bundlePriceLine} — premium gift route with instant HD.`,
    "Lower-cost physical option when you already have a frame plan.",
    "Keep the editor neutral until the design feels final.",
  ];
}
