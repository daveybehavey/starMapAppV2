import {
  PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS,
  getPrintDeliveryEstimateLine,
  getPrintStandardShippingOnlyLine,
  getPrintUrgentHdUpsellLine,
} from "@/lib/commerceFacts";
import { getLoveItGuaranteeFaq } from "@/lib/loveItGuarantee";

const loveItFaq = getLoveItGuaranteeFaq();

/** Used on `/support` and in FAQPage JSON-LD — keep answers aligned with linked policies. */
export const SUPPORT_FAQ_ITEMS: readonly { id: string; question: string; answer: string }[] = [
  {
    id: "hd-download",
    question: "Where is my HD download?",
    answer:
      "Use My Downloads after checkout, or the access link in your confirmation email. Digital delivery terms are described in our Terms of Service.",
  },
  {
    id: "print-timing",
    question: "When will my print ship?",
    answer: `Prints are made to order. Typical fulfillment time before shipment is ${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}, plus standard carrier transit after production. ${getPrintDeliveryEstimateLine()} ${getPrintStandardShippingOnlyLine()} ${getPrintUrgentHdUpsellLine()} See our Shipping policy for country rates; dates are estimates, not guarantees.`,
  },
  {
    id: "delivery-estimates",
    question: "How long does delivery take after my print ships?",
    answer: `${getPrintDeliveryEstimateLine()} ${getPrintStandardShippingOnlyLine()} Carrier transit is separate from production time. Need it sooner? HD digital unlocks right after payment.`,
  },
  {
    id: "love-it-guarantee",
    question: loveItFaq.question,
    answer: loveItFaq.answer,
  },
  {
    id: "damaged-print",
    question: "My print arrived damaged. What should I do?",
    answer:
      "Under our Love-It Guarantee, email us within 30 days of delivery with photos and your order details for a free reprint if the print arrived damaged or misprinted. Change-of-mind refunds are not offered on custom made-to-order prints. Eligible damage or defect cases are handled as described in our Returns & Refunds policy.",
  },
  {
    id: "refund-digital",
    question: "Can I get a refund on a digital purchase?",
    answer:
      "Custom digital items are generally non-refundable once unlocked or downloaded, with limited exceptions (for example duplicate charges or technical failures on our side). The Love-It Guarantee covers print damage/misprints, not change-of-mind digital refunds. See Returns & Refunds and Terms for details.",
  },
  {
    id: "contact",
    question: "How do I reach StarMapCo?",
    answer:
      "Use the Contact page for our email address and support hours. Including your order email speeds up print and billing issues.",
  },
] as const;
