import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";
import {
  formatPrintPriceWithShipping,
  getFramedHdBundlePriceLine,
  getPrintProductionReviewDisclosure,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";

type MoneyPagePriceAtGlanceProps = {
  className?: string;
  /** When true, emphasize framed print as the default gift path (wedding). */
  weddingTone?: boolean;
  /** Hide fulfillment/shipping fine print (hero uses trust panel below). */
  compact?: boolean;
};

export default function MoneyPagePriceAtGlance({
  className = "",
  weddingTone = false,
  compact = false,
}: MoneyPagePriceAtGlanceProps) {
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
  const framedHdBundle = getFramedHdBundlePriceLine();
  const shippingDisclosure = getPrintShippingDisclosure();
  const framedDelivery = formatPrintDeliveryDisclosure("poster_framed", null);
  const productionDisclosure = getPrintProductionReviewDisclosure();

  return (
    <div className={`space-y-1.5 text-center lg:text-left ${className}`.trim()}>
      <p className="text-xs text-amber-100/90 sm:text-sm">
        {weddingTone ? (
          <>
            <span className="font-semibold text-amber-50">{framedHdBundle}</span>
            {" · "}
            unframed from <span className="font-semibold text-amber-50">{unframedPrice}</span>
            {" · "}
            HD only <span className="font-semibold text-amber-50">{digitalPrice}</span>
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
      {!compact ? (
        <p className="text-[11px] leading-relaxed text-white/75 sm:text-xs">
          Free preview first. HD unlocks instantly after checkout. {productionDisclosure} {framedDelivery}.{" "}
          {shippingDisclosure}
        </p>
      ) : null}
    </div>
  );
}
