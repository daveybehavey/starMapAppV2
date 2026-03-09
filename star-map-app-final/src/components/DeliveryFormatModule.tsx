import Link from "next/link";
import { getPrintPricingTiers } from "@/lib/pricing";
import { formatPrintPriceWithShipping, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

type DeliveryFormatModuleProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

export default function DeliveryFormatModule({
  heading = "Choose the delivery format that fits the moment",
  intro = "You only build the map once. After preview, you can decide whether this should be an instant digital file, an unframed print, or a framed gift.",
  sourcePrefix = "delivery-format",
}: DeliveryFormatModuleProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const printTiers = getPrintPricingTiers();
  const printLabels = {
    unframed: formatPrintPriceWithShipping(printTiers.poster_unframed.amountCents, printTiers.poster_unframed.currency),
    framed: formatPrintPriceWithShipping(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency),
  };
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className={`grid gap-3 ${printCheckoutEnabled ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
        <article className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-midnight">Instant HD download</p>
          <p className="mt-1 text-xs text-neutral-700">Best for same-day gifting, local printing, or testing different frame shops.</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
            <li>Unlocks immediately after payment</li>
            <li>Up to 6000×6000 PNG, no watermark</li>
            <li>Works well for local poster printing and DIY framing</li>
          </ul>
          <Link
            href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-digital`)}`}
            className="mt-4 inline-flex rounded-full border border-black/10 bg-midnight px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
          >
            Preview then buy digital
          </Link>
        </article>

        {printCheckoutEnabled ? (
          <article className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 shadow-sm">
            <p className="text-sm font-semibold text-midnight">{printTiers.poster_unframed.label}</p>
            <p className="mt-1 text-xs text-neutral-700">Best if you already know the exact frame or want the lower-cost physical option.</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
              <li>Museum-quality poster stock</li>
              <li>{shippingDisclosure}</li>
              <li>Starts at {printLabels.unframed}</li>
            </ul>
            <Link
              href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-print-unframed`)}&checkout=print&print_variant=poster_unframed`}
              className="mt-4 inline-flex rounded-full border border-amber-300/70 bg-amber-300/20 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:-translate-y-[1px] hover:bg-amber-300/30"
            >
              Preview then buy unframed
            </Link>
          </article>
        ) : null}

        {printCheckoutEnabled ? (
          <article className="rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-100 to-amber-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-midnight">{printTiers.poster_framed.label}</p>
              <span className="rounded-full border border-amber-300/80 bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                Recommended
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-700">Best for gifting. Buyers choose this when they want the finished piece to arrive ready to display.</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
              <li>Gift-ready framed presentation</li>
              <li>{shippingDisclosure}</li>
              <li>Starts at {printLabels.framed}</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-print-framed`)}&checkout=print&print_variant=poster_framed`}
                className="inline-flex rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
              >
                Preview then buy framed
              </Link>
              <Link
                href="/how-to-print-star-map"
                className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-neutral-50"
              >
                See print guide
              </Link>
            </div>
          </article>
        ) : null}
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <p className="text-sm font-semibold text-midnight">Buying note</p>
        <p className="mt-1 text-xs text-neutral-700 sm:text-sm">
          Start with the preview. You can decide on digital, unframed, or framed delivery after you see the final
          design, and physical orders show shipping before payment.
        </p>
      </div>
    </section>
  );
}
