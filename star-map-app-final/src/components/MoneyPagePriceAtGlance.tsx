import { PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS } from "@/lib/commerceFacts";
import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";
import { formatPrintPriceWithShipping, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";

type MoneyPagePriceAtGlanceProps = {
  className?: string;
  /** When true, emphasize framed print as the default gift path (wedding). */
  weddingTone?: boolean;
};

export default function MoneyPagePriceAtGlance({ className = "", weddingTone = false }: MoneyPagePriceAtGlanceProps) {
  const printTiers = getPrintPricingTiers();
  const pricing = getPricingInfo();
  const digitalPrice = formatPrice(pricing.activeAmountCents, pricing.currency);
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const shippingDisclosure = getPrintShippingDisclosure();
  const framedDelivery = formatPrintDeliveryDisclosure("poster_framed", "US");

  return (
    <div className={`space-y-1.5 text-center lg:text-left ${className}`.trim()}>
      <p className="text-xs text-amber-100/90 sm:text-sm">
        {weddingTone ? (
          <>
            Framed from <span className="font-semibold text-amber-50">{framedPrice}</span>
            {" · "}
            unframed from <span className="font-semibold text-amber-50">{unframedPrice}</span>
            {" · "}
            HD from <span className="font-semibold text-amber-50">{digitalPrice}</span>
          </>
        ) : (
          <>
            HD from <span className="font-semibold text-amber-50">{digitalPrice}</span>
            {" · "}
            unframed from <span className="font-semibold text-amber-50">{unframedPrice}</span>
            {" · "}
            framed from <span className="font-semibold text-amber-50">{framedPrice}</span>
          </>
        )}
      </p>
      <p className="text-[11px] leading-relaxed text-white/75 sm:text-xs">
        Free preview first. HD unlocks instantly after checkout. Physical prints are reviewed, then produced in{" "}
        {PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}
        {framedDelivery ? ` — ${framedDelivery.toLowerCase()}` : ""}. {shippingDisclosure}
      </p>
    </div>
  );
}
