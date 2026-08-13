/** Keep in sync with src/lib/printOrderConfirmationEmail.ts (render + labels). */

import {
  getPrintOrderConfirmationEtaNote,
  getPrintOrderConfirmationNextSteps,
  getPrintOrderConfirmationPreheader,
} from "./commerceFacts.harness.mjs";

export function getPrintProductLabel(variant) {
  switch (variant) {
    case "poster_framed":
      return "Framed star map poster";
    case "poster_unframed":
      return "Star map poster (unframed)";
    default:
      return "Custom star map print";
  }
}

export function renderPrintOrderConfirmationEmail(data) {
  const productLabel = data.productLabel.trim() || "Custom star map print";
  const manualReview = data.manualReviewRequired !== false;
  const includesDigitalAddOn = data.includesDigitalAddOn === true;
  const subject = "Your StarMapCo print order is confirmed";
  const nextSteps = getPrintOrderConfirmationNextSteps({
    manualReviewRequired: manualReview,
    includesDigitalAddOn,
    country: data.shippingCountry,
    variant: data.printVariant,
  });
  const etaNote = getPrintOrderConfirmationEtaNote({
    includesDigitalAddOn,
    country: data.shippingCountry,
    variant: data.printVariant,
  });
  const preheader = getPrintOrderConfirmationPreheader(manualReview);
  const text = [
    `Product: ${productLabel}`,
    preheader,
    ...nextSteps,
    etaNote,
    data.successUrl,
    data.supportEmail || "support@starmapco.com",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<html><body><h1>Your print is on the way to production</h1><p>${productLabel}</p><p>${etaNote}</p><a href="${data.successUrl}">View order status</a></body></html>`;
  return { subject, html, text };
}
