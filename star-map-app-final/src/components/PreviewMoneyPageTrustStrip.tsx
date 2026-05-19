import { formatPrintPriceWithShipping } from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";

/**
 * Compact, factual pricing + preview trust line for high-intent money pages.
 * Uses public env pricing only — no fabricated testimonials or ratings.
 */
export default function PreviewMoneyPageTrustStrip() {
  const { activeAmountCents, currency } = getPricingInfo();
  const hdFrom = formatPrice(activeAmountCents, currency);
  const tiers = getPrintPricingTiers();
  const framedFrom = formatPrintPriceWithShipping(
    tiers.poster_framed.amountCents,
    tiers.poster_framed.currency,
  );
  const unframedFrom = formatPrintPriceWithShipping(
    tiers.poster_unframed.amountCents,
    tiers.poster_unframed.currency,
  );

  const items = [
    "Free preview — customize before you pay",
    `HD digital from ${hdFrom}`,
    `Unframed print from ${unframedFrom}`,
    `Framed print from ${framedFrom}`,
    "Secure checkout via Stripe",
  ];

  return (
    <ul
      className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-amber-100/95 sm:text-xs"
      aria-label="Preview and pricing highlights"
    >
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 backdrop-blur-sm"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
