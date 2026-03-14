import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import {
  formatPrintPriceWithShipping,
  getPrintAvailabilityBadgeLabel,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getFramedProofImage, getUnframedProofImage } from "@/lib/printProofAssets";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";

type FramedProofSectionProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

export default function FramedProofSection({
  heading = "See the finished piece, not just the render",
  intro = "Design the map in preview first, then choose the delivery format that fits the moment. Framed is the premium gift route, unframed keeps the physical total lower, and the HD add-on gives you an immediate backup file after checkout.",
  sourcePrefix = "framed-proof",
}: FramedProofSectionProps) {
  const printTiers = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const availabilityBadge = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const digitalAddOnPrice = formatPrice(digitalAddOn.amountCents, digitalAddOn.currency);
  const framedProofImage = getFramedProofImage();
  const unframedProofImage = getUnframedProofImage();

  return (
    <section className="brand-light-panel content-visibility-auto mt-6 overflow-hidden rounded-3xl">
      <div className="grid gap-0 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="grid gap-3 bg-neutral-100 p-3 sm:grid-cols-2 sm:p-4">
          <div className="relative min-h-[240px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm sm:row-span-2">
            <ResilientImage
              src={framedProofImage}
              fallbackSrc="/printproof/framed-mockup.jpg"
              alt="Framed StarMapCo star map mockup"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute bottom-3 left-3 rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] font-semibold text-midnight shadow-sm">
              Framed print mockup
            </div>
          </div>
          <div className="relative min-h-[180px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
            <ResilientImage
              src={unframedProofImage}
              fallbackSrc="/printproof/unframed-mockup.jpg"
              alt="Unframed StarMapCo poster mockup"
              fill
              sizes="(max-width: 1024px) 100vw, 25vw"
              className="object-cover"
            />
            <div className="absolute bottom-3 left-3 rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] font-semibold text-midnight shadow-sm">
              Unframed poster mockup
            </div>
          </div>
          <div className="relative min-h-[180px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
            <ResilientImage
              src="/examples/example-anniversary-heirloom.webp"
              fallbackSrc="/custom-star-map-anniversary.webp"
              alt="Rendered star map from the current StarMapCo engine"
              fill
              sizes="(max-width: 1024px) 100vw, 25vw"
              className="object-cover"
            />
            <div className="absolute bottom-3 left-3 rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] font-semibold text-midnight shadow-sm">
              Current engine render
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900/90">
              <span className="brand-pill rounded-full px-3 py-1">{availabilityBadge}</span>
              <span className="rounded-full border border-black/10 bg-white/85 px-3 py-1 text-[#4f5a73]">Manual review before production</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Framed in real spaces</p>
            <h2 className="text-xl font-semibold text-midnight">{heading}</h2>
            <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="brand-light-card-accent rounded-2xl px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Recommended</p>
              <h3 className="mt-2 text-sm font-semibold text-midnight">{printTiers.poster_framed.label}</h3>
              <p className="mt-1 text-sm text-neutral-700">{framedPrice}</p>
              <p className="mt-2 text-xs text-neutral-700">Ready-to-hang gift route with the frame already handled.</p>
            </div>
            <div className="brand-light-card rounded-2xl px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Lower total</p>
              <h3 className="mt-2 text-sm font-semibold text-midnight">{printTiers.poster_unframed.label}</h3>
              <p className="mt-1 text-sm text-neutral-700">{unframedPrice}</p>
              <p className="mt-2 text-xs text-neutral-700">Best if you already know how you want to frame it yourself.</p>
            </div>
            <div className="brand-light-card rounded-2xl px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Instant backup</p>
              <h3 className="mt-2 text-sm font-semibold text-midnight">HD digital add-on</h3>
              <p className="mt-1 text-sm text-neutral-700">{digitalAddOnPrice}</p>
              <p className="mt-2 text-xs text-neutral-700">Delivered immediately after checkout, even when you order print.</p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-neutral-800">
            <li className="brand-light-card rounded-2xl px-4 py-3">{shippingDisclosure}</li>
            <li className="brand-light-card rounded-2xl px-4 py-3">
              Paid print orders are created for review first, then approved manually before production starts.
            </li>
          </ul>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-framed`)}&checkout=print&print_variant=poster_framed`}
              className="inline-flex items-center justify-center rounded-full bg-midnight px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
            >
              Preview framed print
            </Link>
            <Link
              href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-unframed`)}&checkout=print&print_variant=poster_unframed`}
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-neutral-50"
            >
              Preview unframed print
            </Link>
            <Link
              href="/star-map-gallery"
              className="inline-flex items-center justify-center rounded-full border border-amber-300/50 bg-amber-300/15 px-5 py-3 text-sm font-semibold text-amber-900 transition hover:-translate-y-[1px] hover:bg-amber-300/25"
            >
              View recent examples
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
