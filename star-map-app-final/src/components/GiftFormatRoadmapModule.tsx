import Link from "next/link";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

type GiftFormatRoadmapModuleProps = {
  sourcePrefix: string;
};

export default function GiftFormatRoadmapModule({ sourcePrefix }: GiftFormatRoadmapModuleProps) {
  const digitalTier = getPricingTiers().single;
  const printTiers = getPrintPricingTiers();
  const digitalPriceLabel = formatPrice(digitalTier.amountCents, digitalTier.currency);
  const framedPriceLabel = formatPrice(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency
  );
  const unframedPriceLabel = formatPrice(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency
  );

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <h2 className="text-midnight text-lg font-semibold">More gift formats (curated, not cluttered)</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          We intentionally keep checkout focused. You get the live gift formats first, and we only add new formats
          once they pass our quality and shipping checks.
        </p>
        <Link
          href="/star-map-gift-formats"
          prefetch={false}
          className="inline-flex text-xs font-semibold text-amber-700 underline hover:text-amber-800"
        >
          See the full format catalog
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-700 uppercase">Live now</p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-800">
            <li data-digital-offer>HD digital ({digitalPriceLabel})</li>
            <li>Unframed print ({unframedPriceLabel} + shipping)</li>
            <li>Framed print ({framedPriceLabel} + shipping)</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-live-digital`)}`}
              prefetch={false}
              className="rounded-full border border-emerald-300/70 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Preview digital
            </Link>
            <Link
              href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-live-framed`)}&checkout=print&print_variant=poster_framed`}
              prefetch={false}
              className="rounded-full border border-emerald-300/70 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Preview framed
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-700 uppercase">Also available</p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-800">
            <li>Canvas wrap (premium wall version)</li>
            <li>Mug (gift add-on)</li>
          </ul>
          <p className="mt-3 text-xs text-neutral-700">
            Canvas wraps and mugs are ready to order now in the shop — printed on demand and shipped to your door.
          </p>
          <Link
            href="/shop"
            prefetch={false}
            className="mt-3 inline-flex rounded-full border border-amber-300/70 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Shop canvas + mugs
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-700 uppercase">
            Bundle-only add-ons
          </p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-800">
            <li>Greeting card</li>
            <li>Small accessory items</li>
          </ul>
          <p className="mt-3 text-xs text-neutral-700">
            We keep these as add-ons only so checkout remains simple and fast.
          </p>
        </div>
      </div>
    </section>
  );
}
