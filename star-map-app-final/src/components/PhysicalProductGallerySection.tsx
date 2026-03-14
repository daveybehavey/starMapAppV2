import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import { getFramedProofImage, getUnframedProofImage } from "@/lib/printProofAssets";

type PhysicalProductGallerySectionProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

export default function PhysicalProductGallerySection({
  heading = "See the physical gift options side by side",
  intro = "These proof images come from live Printful mockups created with current StarMapCo artwork, so buyers can compare the framed and unframed finish before checkout.",
  sourcePrefix = "physical-proof-gallery",
}: PhysicalProductGallerySectionProps) {
  const framedProofImage = getFramedProofImage();
  const unframedProofImage = getUnframedProofImage();

  const proofCards = [
    {
      src: framedProofImage,
      fallbackSrc: "/printproof/framed-catalog.jpg",
      alt: "Framed StarMapCo print product mockup",
      eyebrow: "Premium gift",
      title: "Framed print mockup",
      detail: "Ready-to-hang 14x14 black frame for the strongest presentation.",
    },
    {
      src: "/printproof/gallery/wedding-framed.jpg",
      fallbackSrc: framedProofImage,
      alt: "Framed StarMapCo print shown in a styled room",
      eyebrow: "In-room proof",
      title: "Framed on wall",
      detail: "Shows how the finished piece lands in a real interior.",
    },
    {
      src: unframedProofImage,
      fallbackSrc: "/printproof/unframed-catalog.jpg",
      alt: "Unframed StarMapCo poster product mockup",
      eyebrow: "Lower total",
      title: "Unframed poster mockup",
      detail: "18x18 museum-grade poster if you already have a frame plan.",
    },
    {
      src: "/printproof/gallery/graduation-unframed.jpg",
      fallbackSrc: unframedProofImage,
      alt: "Unframed StarMapCo poster shown in a styled scene",
      eyebrow: "Styled proof",
      title: "Unframed in context",
      detail: "Same artwork, simpler delivery, and lower physical total.",
    },
  ] as const;

  return (
    <section className="brand-light-panel content-visibility-auto mt-6 overflow-hidden rounded-3xl">
      <div className="space-y-5 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Physical product gallery</p>
          <h2 className="text-xl font-semibold text-midnight sm:text-2xl">{heading}</h2>
          <p className="max-w-3xl text-sm text-neutral-800 sm:text-base">{intro}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {proofCards.map((card) => (
            <article
              key={`${card.title}-${card.src}`}
              className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"
            >
              <div className="relative aspect-square overflow-hidden bg-neutral-100">
                <ResilientImage
                  src={card.src}
                  fallbackSrc={card.fallbackSrc}
                  alt={card.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  className="object-cover"
                />
                <span className="absolute bottom-3 left-3 rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-midnight shadow-sm">
                  {card.eyebrow}
                </span>
              </div>
              <div className="space-y-1 border-t border-black/5 px-4 py-3">
                <h3 className="text-sm font-semibold text-midnight">{card.title}</h3>
                <p className="text-xs leading-relaxed text-neutral-700">{card.detail}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.3fr,0.7fr]">
          <div className="brand-light-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">What this proves</p>
            <ul className="mt-2 grid gap-2 text-sm text-neutral-800 sm:grid-cols-2">
              <li>Framed is the premium, gift-ready route.</li>
              <li>Unframed stays available when cost or custom framing matters more.</li>
              <li>The artwork in print comes from the same map preview buyers approve first.</li>
              <li>Support, shipping, and damage handling stay visible before payment.</li>
            </ul>
          </div>
          <div className="brand-light-card-accent rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Next step</p>
            <p className="mt-2 text-sm text-neutral-800">
              Start with the same free preview, then decide whether this moment should stay digital, go unframed, or arrive framed.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-framed`)}&checkout=print&print_variant=poster_framed`}
                className="inline-flex rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
              >
                Preview framed
              </Link>
              <Link
                href={`/editor?mode=quick&source=${encodeURIComponent(`${sourcePrefix}-unframed`)}&checkout=print&print_variant=poster_unframed`}
                className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-neutral-50"
              >
                Preview unframed
              </Link>
              <Link
                href="/star-map-gift-formats"
                className="inline-flex rounded-full border border-amber-300/50 bg-amber-300/15 px-4 py-2 text-xs font-semibold text-amber-900 transition hover:-translate-y-[1px] hover:bg-amber-300/25"
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
