import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";
import {
  formatPrintPriceWithShipping,
  getFramedHdBundlePriceLine,
  getPrintFreeShippingShortTag,
  getPrintProductionReviewDisclosure,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";
import { isSecondCopyEligibleVariant, type PrintVariant } from "@/lib/printCatalog";
import SecondCopyOfferNote from "@/components/SecondCopyOfferNote";

type MoneyPagePriceAtGlanceProps = {
  className?: string;
  /** When true, emphasize framed print as the default gift path (wedding). */
  weddingTone?: boolean;
  /** Hide fulfillment/shipping fine print (hero uses trust panel below). */
  compact?: boolean;
  /**
   * Lever A presentation (S55-7): the eligible physical paths this
   * summary advertises, resolved server-side together with
   * `resolveSecondCopyOfferVisibility`. Default off — no consumer is
   * enabled until its own purchase path has been reviewed; enabling a
   * consumer means passing the advertised paths (here: the unframed
   * and framed variants in the price line) plus the visibility. When
   * enabled, the offer note follows the price-summary paragraph and
   * shows even in compact mode.
   */
  secondCopyOfferPaths?: readonly PrintVariant[];
};

export default function MoneyPagePriceAtGlance({
  className = "",
  weddingTone = false,
  compact = false,
  secondCopyOfferPaths,
}: MoneyPagePriceAtGlanceProps) {
  const showSecondCopyOffer = (secondCopyOfferPaths ?? []).some((variant) =>
    isSecondCopyEligibleVariant(variant),
  );
  const printTiers = getPrintPricingTiers();
  const pricing = getPricingInfo();
  const digitalPrice = formatPrice(pricing.activeAmountCents, pricing.currency);
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed_16x16.amountCents,
    printTiers.poster_unframed_16x16.currency,
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
            <span data-digital-offer>
              <span className="font-semibold text-amber-50">{framedHdBundle}</span>
              {" · "}
            </span>
            <span data-app-only>
              framed from <span className="font-semibold text-amber-50">{framedPrice}</span>
              {" · "}
            </span>
            unframed from <span className="font-semibold text-amber-50">{unframedPrice}</span>
            <span data-digital-offer>
              {" · "}
              HD only <span className="font-semibold text-amber-50">{digitalPrice}</span>
            </span>
          </>
        ) : (
          <>
            <span data-digital-offer>
              HD from <span className="font-semibold text-amber-50">{digitalPrice}</span>
              {" · "}
            </span>
            unframed from <span className="font-semibold text-amber-50">{unframedPrice}</span>
            {" · "}
            framed from <span className="font-semibold text-amber-50">{framedPrice}</span>
          </>
        )}
      </p>
      {showSecondCopyOffer ? <SecondCopyOfferNote className="text-white/75" /> : null}
      {!compact ? (
        <p className="text-[11px] leading-relaxed text-white/75 sm:text-xs">
          Free preview first. <span data-digital-offer>HD unlocks right after checkout. </span>
          {productionDisclosure} {framedDelivery}.{" "}
          {getPrintFreeShippingShortTag() ?? shippingDisclosure}
        </p>
      ) : null}
    </div>
  );
}
