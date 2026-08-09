/**
 * Canonical customer-facing commerce copy. Update only when operations/legal
 * approve a change, then align Merchant Center / checkout copy as needed.
 */
import { isPrintfulAutoConfirmEnabled } from "@/lib/printCheckoutConfig";

export const PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS = "2–5 business days" as const;

/** Typical U.S. standard carrier transit after Printful ships (from Printful rate data). */
export const PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS = "4–6 business days" as const;

export function getPrintProductionTimelineLine(): string {
  return `Made to order — typical production time is ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} before shipment.`;
}

/** End-to-end U.S. estimate for physical prints (production + standard transit). */
export function getPrintUsTotalDeliveryEstimateLine(): string {
  return `Typical U.S. delivery is about ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production plus ${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} standard carrier transit (often roughly 1–2 weeks total; not a guaranteed arrival date).`;
}

export function getPrintStandardShippingOnlyLine(): string {
  return "Standard shipping is the only print shipping option we offer today — express is not available for these poster and framed products.";
}

export function getPrintUrgentHdUpsellLine(instantPriceLabel?: string): string {
  if (instantPriceLabel?.trim()) {
    return `Need it sooner? HD digital (${instantPriceLabel.trim()}) unlocks right after payment — no production or shipping wait.`;
  }
  return "Need it sooner? HD digital unlocks right after payment — no production or shipping wait.";
}

export function getPaywallPrintBullets(): string[] {
  return [
    "Printed and shipped to your door — framed or unframed",
    `Made to order — ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production, then standard shipping`,
    "Secure checkout — card, Apple Pay, Google Pay",
    "HD digital file available to add at checkout",
  ];
}

export function getPaywallDigitalBullets(): string[] {
  return [
    "6,000 px high resolution — poster-quality print",
    "No watermark on your downloaded file",
    "Secure checkout — card, Apple Pay, Google Pay",
    "Instant download after payment",
  ];
}

export function getPrintFulfillmentProgressSteps(): readonly string[] {
  if (isPrintfulAutoConfirmEnabled()) {
    return [
      "Payment received",
      "Print order submitted to our production partner",
      `Production (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}, made to order)`,
      `Standard shipping with tracking after production (${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} typical U.S. transit)`,
    ] as const;
  }
  return [
    "Payment received",
    "Print order submitted for quality review",
    "Production after approval",
    "Standard shipping with tracking when your order ships",
  ] as const;
}

export function getPrintOrderIncludesDigitalNote(): string {
  if (isPrintfulAutoConfirmEnabled()) {
    return `Physical prints are made to order (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} typical production). Your HD digital file, if included, stays available right away.`;
  }
  return "Physical orders stay in manual review before production starts, but your digital file stays available right away.";
}

export function getPrintDeliveryTimingFaqAnswer(shippingDisclosure: string): string {
  return `${shippingDisclosure} ${getPrintUsTotalDeliveryEstimateLine()} ${getPrintStandardShippingOnlyLine()} ${getPrintUrgentHdUpsellLine()}`;
}

/** Compact trust-panel / policy summary for physical print orders. */
export function getPrintPhysicalOrderSummaryLine(): string {
  return `Physical prints are made to order (${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} typical production, then ${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} standard carrier transit). Express shipping is not offered for these products.`;
}

export function getPrintProductionBadgeLabel(): string {
  return isPrintfulAutoConfirmEnabled()
    ? `Made to order · ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} production`
    : "Manual review before production";
}

export function getPrintFramedHdBundleTimingLine(): string {
  return "HD today, framed print when it arrives — use the digital file immediately while your print is produced and shipped.";
}

export function getPrintFramedHdBundleShortLine(): string {
  return "Instant HD after payment; the framed print follows standard production and shipping.";
}

export function getPrintOrderConfirmationNextSteps(input: {
  manualReviewRequired: boolean;
  includesDigitalAddOn?: boolean;
}): string[] {
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
    return [
      "Your HD digital file is available right away from your order status page.",
      ...steps,
    ];
  }

  return steps;
}

export function getPrintOrderConfirmationEtaNote(input: {
  includesDigitalAddOn?: boolean;
}): string {
  const parts = [
    getPrintProductionTimelineLine(),
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

export function getPrintOrderConfirmationPreheader(manualReviewRequired: boolean): string {
  return manualReviewRequired
    ? "Payment received — we're reviewing your print before production. Tracking email coming soon."
    : "Payment received — your custom star map print is in production. Tracking email coming soon.";
}
