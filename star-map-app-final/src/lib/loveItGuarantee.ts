/** Customer-facing Love-It Guarantee — damaged/misprint reprint only; no change-of-mind refunds. */
export const LOVE_IT_GUARANTEE_TITLE = "Love-It Guarantee" as const;

export const LOVE_IT_GUARANTEE_LINE =
  "Love-It Guarantee: free reprint if a print arrives damaged or misprinted. No change-of-mind refunds." as const;

export const LOVE_IT_GUARANTEE_SHORT =
  "Love-It Guarantee — free reprint for damage or misprints (not change-of-mind)." as const;

export function getLoveItGuaranteeFaq(): { question: string; answer: string } {
  return {
    question: "What is the Love-It Guarantee?",
    answer:
      "If your print arrives damaged or misprinted, we will reprint it free of charge. The Love-It Guarantee does not cover change-of-mind refunds on custom made-to-order prints or unlocked digital files. Contact support@starmapco.com with photos and your order details.",
  };
}
