import Image from "next/image";
import Link from "next/link";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

type FramedProofSectionProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

export default function FramedProofSection({
  heading = "See the finished piece, not just the render",
  intro = "Use the preview to design the map, then compare the physical options. Framed is the premium gift route, unframed keeps the total lower, and the HD add-on gives you a backup file immediately after checkout.",
  sourcePrefix = "framed-proof",
}: FramedProofSectionProps) {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <section className="content-visibility-auto mt-6 overflow-hidden rounded-3xl border border-black/5 bg-white/90 shadow-xl shadow-black/10">
      <div className="grid gap-0 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="relative min-h-[260px] bg-neutral-100">
          <Image
            src="/blog/anniversary/framed-star-map.jpg"
            alt="Framed StarMapCo print displayed on a wall"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Framed in real spaces</p>
            <h2 className="text-xl font-semibold text-midnight">{heading}</h2>
            <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
          </div>

          <ul className="space-y-2 text-sm text-neutral-800">
            <li className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3">
              Framed is best when you want the gift to arrive ready to display.
            </li>
            <li className="rounded-2xl border border-black/10 bg-white px-4 py-3">
              Unframed is the lower-cost physical option if you already have a frame plan.
            </li>
            <li className="rounded-2xl border border-black/10 bg-white px-4 py-3">
              The HD add-on gives you an immediate digital backup after checkout.
            </li>
            <li className="rounded-2xl border border-black/10 bg-white px-4 py-3">{shippingDisclosure}</li>
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
