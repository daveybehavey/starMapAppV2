/** Customer-facing Love-It Guarantee — damaged/misprint reprint only; no change-of-mind refunds. */
export const LOVE_IT_GUARANTEE_TITLE = "Love-It Guarantee" as const;

export const LOVE_IT_GUARANTEE_LINE =
  "Love-It Guarantee: free reprint if a print arrives damaged or misprinted. No change-of-mind refunds." as const;

export const LOVE_IT_GUARANTEE_SHORT =
  "Love-It Guarantee — free reprint for damage or misprints (not change-of-mind)." as const;

/**
 * Merch purchase-step policy line (canonical policy: PR #340, /returns).
 * Merch is NOT covered by the print Love-It line — it carries its own
 * terms: free replacement for defective/damaged/incorrect items within
 * 30 days of delivery, no change-of-mind returns, and no refunds or
 * exchanges for size on apparel. Shown at the merch checkout step in the
 * editor and under the mug row in the print dialog (the mug is a
 * made-to-order merch-style item; see the /returns merch section).
 */
export const MERCH_POLICY_LINE =
  "Merch is made to order: if an item arrives defective, damaged, or different from what you ordered, we replace it free within 30 days of delivery. No change-of-mind returns, and no refunds or exchanges for size on apparel." as const;

/** Shown under digital paywall options (not Love-It reprint copy — that is print-only). */
export const DIGITAL_CHECKOUT_SUPPORT_LINE =
  "HD download right after checkout. Questions? support@starmapco.com" as const;

export function getLoveItGuaranteeFaq(): { question: string; answer: string } {
  return {
    question: "What is the Love-It Guarantee?",
    answer:
      "If your print arrives damaged or misprinted, we will reprint it free of charge. The Love-It Guarantee does not cover change-of-mind refunds on custom made-to-order prints or unlocked digital files. Contact support@starmapco.com with photos and your order details.",
  };
}
