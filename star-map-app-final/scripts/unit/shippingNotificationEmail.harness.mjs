/** Keep in sync with src/lib/shippingNotificationEmail.ts */

export const SHIPPING_REVIEW_LINKS = {
  google: {
    href: "https://g.page/r/CVMm_3hOFgRTEAI/review",
    label: "Review us on Google",
  },
  trustpilot: {
    href: "https://www.trustpilot.com/review/starmapco.com",
    label: "Review us on Trustpilot",
  },
};

export const SHIPPING_REVIEW_INVITE =
  "If your map arrived safely and you're happy with it, a short review helps other gift-givers find us.";

export function renderShippingReviewTextBlock() {
  return [
    SHIPPING_REVIEW_INVITE,
    "",
    `${SHIPPING_REVIEW_LINKS.google.label}: ${SHIPPING_REVIEW_LINKS.google.href}`,
    `${SHIPPING_REVIEW_LINKS.trustpilot.label}: ${SHIPPING_REVIEW_LINKS.trustpilot.href}`,
  ].join("\n");
}

export function renderShippingReviewHtmlBlock() {
  const google = SHIPPING_REVIEW_LINKS.google;
  const trustpilot = SHIPPING_REVIEW_LINKS.trustpilot;
  return [
    `<p>${SHIPPING_REVIEW_INVITE}</p>`,
    `<a href="${google.href}">${google.label}</a>`,
    `<a href="${trustpilot.href}">${trustpilot.label}</a>`,
  ].join("\n");
}

/** Simplified mirror of renderShippingNotificationEmail for unit assertions. */
export function renderShippingNotificationEmail(data) {
  const trackingNumber = data.trackingNumber || "9400111899223344556677";
  const subject = "Your StarMapCo order is on its way — tracking inside";
  const reviewText = renderShippingReviewTextBlock();
  const reviewHtml = renderShippingReviewHtmlBlock();
  const text = [
    `Tracking number: ${trackingNumber}`,
    "Track package: https://example.com/track",
    "",
    reviewText,
    "",
    "— The StarMapCo team",
  ].join("\n");
  const html = `<html><body><h1>Shipped</h1><p>Tracking ${trackingNumber}</p>${reviewHtml}<p>Thanks for choosing StarMapCo</p></body></html>`;
  return { subject, html, text };
}
