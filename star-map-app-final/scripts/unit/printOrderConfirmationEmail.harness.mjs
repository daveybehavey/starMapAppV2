/** Keep in sync with src/lib/printOrderConfirmationEmail.ts (render + labels). */

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
  const subject = "Your StarMapCo print order is confirmed";
  const text = [
    `Product: ${productLabel}`,
    manualReview ? "Manual quality review before production." : "",
    data.successUrl,
    data.supportEmail || "support@starmapco.com",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<html><body><h1>Print order confirmed</h1><p>${productLabel}</p><a href="${data.successUrl}">View confirmation</a></body></html>`;
  return { subject, html, text };
}
