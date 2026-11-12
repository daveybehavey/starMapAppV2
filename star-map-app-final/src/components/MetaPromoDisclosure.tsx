type MetaPromoDisclosureProps = {
  source: string | null;
  couponDropped?: boolean;
  // undefined means client storage has not been read yet; null means no promo.
  effectivePromoCode: string | null | undefined;
};

export default function MetaPromoDisclosure({ source, couponDropped, effectivePromoCode }: MetaPromoDisclosureProps) {
  if (source !== "meta_shop" || !couponDropped || effectivePromoCode !== null) return null;

  return (
    <div role="status" className="mx-auto my-4 max-w-4xl rounded-2xl border border-amber-200/60 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
      That discount code could not be applied to this item, so the price shown is the full price.
    </div>
  );
}
