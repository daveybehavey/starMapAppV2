/** Keep in sync with src/lib/commerceFacts.ts (pure copy helpers). */

export const PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS = "2–5 business days";
export const PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS = "4–6 business days";

export function isPrintfulAutoConfirmEnabledHarness(env = process.env) {
  const raw = (env.PRINTFUL_AUTO_CONFIRM ?? env.NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM ?? "true").trim();
  return /^(1|true|yes)$/i.test(raw);
}

export function getPrintUsTotalDeliveryEstimateLine() {
  return `Typical U.S. delivery is about ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production plus ${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} standard carrier transit (often roughly 1–2 weeks total; not a guaranteed arrival date).`;
}

export function getPrintStandardShippingOnlyLine() {
  return "Standard shipping is the only print shipping option we offer today — express is not available for these poster and framed products.";
}

export function getPrintUrgentHdUpsellLine(instantPriceLabel) {
  if (instantPriceLabel?.trim()) {
    return `Need it sooner? HD digital (${instantPriceLabel.trim()}) unlocks right after payment — no production or shipping wait.`;
  }
  return "Need it sooner? HD digital unlocks right after payment — no production or shipping wait.";
}

export function getPaywallPrintBullets() {
  return [
    "Printed and shipped to your door — framed or unframed",
    `Made to order — ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production, then standard shipping`,
    "Secure checkout — card, Apple Pay, Google Pay",
    "HD digital file available to add at checkout",
  ];
}

export function getPaywallDigitalBullets() {
  return [
    "6,000 px high resolution — poster-quality print",
    "No watermark on your downloaded file",
    "Secure checkout — card, Apple Pay, Google Pay",
    "Instant download after payment",
  ];
}

export function getPrintFulfillmentProgressSteps(env = process.env) {
  if (isPrintfulAutoConfirmEnabledHarness(env)) {
    return [
      "Payment received",
      "Print order submitted to our production partner",
      `Production (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}, made to order)`,
      `Standard shipping with tracking after production (${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} typical U.S. transit)`,
    ];
  }
  return [
    "Payment received",
    "Print order submitted for quality review",
    "Production after approval",
    "Standard shipping with tracking when your order ships",
  ];
}

export function getPrintPhysicalOrderSummaryLine() {
  return `Physical prints are made to order (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} typical production, then ${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} standard carrier transit). Express shipping is not offered for these products.`;
}

export function getPrintProductionBadgeLabel(env = process.env) {
  return isPrintfulAutoConfirmEnabledHarness(env)
    ? `Made to order · ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production`
    : "Manual review before production";
}

export function getPrintFramedHdBundleTimingLine() {
  return "HD today, framed print when it arrives — use the digital file immediately while your print is produced and shipped.";
}

export function getPrintFramedHdBundleShortLine() {
  return "Instant HD after payment; the framed print follows standard production and shipping.";
}

export function getPrintOrderConfirmationNextSteps(input) {
  const steps = input.manualReviewRequired
    ? [
        "Your print file is sent to our production partner.",
        "Manual quality review before production begins.",
        "After approval, your map is printed, packed, and shipped with standard shipping.",
        "You'll receive a separate email with tracking when it ships.",
      ]
    : [
        "Your print is submitted to our production partner.",
        `Production is made to order (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} typical).`,
        `Standard shipping follows production (${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} typical U.S. carrier transit).`,
        "You'll receive a separate email with tracking when it ships.",
      ];

  if (input.includesDigitalAddOn) {
    return ["Your HD digital file is available right away from your order status page.", ...steps];
  }
  return steps;
}

export function getPrintOrderConfirmationEtaNote(input = {}) {
  const parts = [
    `Made to order — typical production time is ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} before shipment.`,
    getPrintUsTotalDeliveryEstimateLine(),
    getPrintStandardShippingOnlyLine(),
  ];
  if (input.includesDigitalAddOn) {
    parts.push(getPrintFramedHdBundleShortLine());
  } else {
    parts.push(getPrintUrgentHdUpsellLine());
  }
  return parts.join(" ");
}

export function getPrintOrderConfirmationPreheader(manualReviewRequired) {
  return manualReviewRequired
    ? "Payment received — we're reviewing your print before production. Tracking email coming soon."
    : "Payment received — your custom star map print is in production. Tracking email coming soon.";
}
