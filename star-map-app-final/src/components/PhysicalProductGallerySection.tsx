import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import { HOME_MOCKUPS } from "@/lib/homeMockups";

type PhysicalProductGallerySectionProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

const galleryCards = [
  {
    src: HOME_MOCKUPS.framedBedroom,
    alt: "Framed StarMapCo print above a bed in a styled bedroom",
    eyebrow: "Framed · Classic",
    title: "Ready-to-hang framed print",
    detail: "Premium framing route for buyers who want the gift to arrive finished and presentation-ready.",
  },
  {
    src: HOME_MOCKUPS.unframedPoster,
    alt: "Unframed StarMapCo poster leaning against a wall",
    eyebrow: "Unframed · Classic",
    title: "Lower-cost unframed print",
    detail: "Unframed route keeps physical delivery while leaving frame choice open for the buyer.",
  },
  {
    src: HOME_MOCKUPS.starPoster,
    alt: "Star-shaped StarMapCo poster in a styled room",
    eyebrow: "Style · Heart",
    title: "Romantic star layout",
    detail: "Softer shape direction without changing the delivery route you pick at checkout.",
  },
  {
    src: HOME_MOCKUPS.livingRoomFramed,
    alt: "Framed StarMapCo print in a living room setting",
    eyebrow: "Style · Living room",
    title: "Gift-ready wall finish",
    detail: "Shows how a finished framed map reads in a real home before you commit.",
  },
] as const;

export default function PhysicalProductGallerySection({
  heading = "See the physical gift options side by side",
  intro = "Real room mockups from current StarMapCo artwork — framed, unframed, and in-home styling — so buyers can judge the finish before checkout.",
  sourcePrefix = "physical-proof-gallery",
}: PhysicalProductGallerySectionProps) {
  return (
    <section className="brand-light-panel content-visibility-auto mt-6 overflow-hidden rounded-3xl">
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Physical product gallery</p>
          <h2 className="text-xl font-semibold text-midnight sm:text-2xl">{heading}</h2>
          <p className="max-w-3xl text-sm text-neutral-800 sm:text-base">{intro}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {galleryCards.map((card) => (
            <article key={card.title} className="group space-y-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-black/10 bg-neutral-100 shadow-[0_12px_20px_rgba(0,0,0,0.12)] transition duration-200 group-hover:-translate-y-[1px] group-hover:shadow-[0_18px_28px_rgba(0,0,0,0.16)]">
                <ResilientImage
                  src={card.src}
                  fallbackSrc={HOME_MOCKUPS.framedBedroom}
                  alt={card.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
              <div className="space-y-1 px-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">{card.eyebrow}</p>
                <h3 className="text-base font-semibold leading-tight text-midnight">{card.title}</h3>
                <p className="text-[13px] leading-relaxed text-neutral-700">{card.detail}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-4 border-t border-black/10 pt-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">What this proves</p>
            <ul className="mt-2 grid gap-2 text-sm text-neutral-800 sm:grid-cols-2">
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-700" />
                Framed is the premium, gift-ready route.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-700" />
                Unframed stays available when cost or custom framing matters more.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-700" />
                The artwork in print comes from the same map preview buyers approve first.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-700" />
                Shipping and support stay visible before payment.
              </li>
            </ul>
          </div>
          <div className="space-y-3 lg:border-l lg:border-black/10 lg:pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Next step</p>
            <p className="text-sm text-neutral-800">
              Start with free preview, then choose digital, unframed, or framed based on budget and presentation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-framed`)}&checkout=print&print_variant=poster_framed`}
                className="inline-flex rounded-md bg-midnight px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
              >
                Preview framed
              </Link>
              <Link
                href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-unframed`)}&checkout=print&print_variant=poster_unframed`}
                className="inline-flex rounded-md border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-neutral-50"
              >
                Preview unframed
              </Link>
              <Link
                href="/star-map-gift-formats"
                className="inline-flex rounded-md border border-amber-300/50 bg-amber-300/15 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:-translate-y-[1px] hover:bg-amber-300/25"
              >
                Compare formats
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
