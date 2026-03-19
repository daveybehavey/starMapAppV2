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
  intro = "These styled product proofs use current StarMapCo artwork so buyers can compare the framed and unframed finish in realistic contexts before checkout.",
  sourcePrefix = "physical-proof-gallery",
}: PhysicalProductGallerySectionProps) {
  const framedProofImage = getFramedProofImage();
  const unframedProofImage = getUnframedProofImage();

  const heroCards = [
    {
      src: framedProofImage,
      fallbackSrc: "/printproof/gallery/wedding-framed.jpg",
      alt: "Framed StarMapCo print shown hanging in a styled room",
      eyebrow: "Premium default",
      title: "Framed on the wall",
      detail: "Shows the ready-to-hang route in a clean wall-stage preview so buyers can judge finish and scale quickly.",
      bestFor: "Best for anniversaries, weddings, and premium gifting.",
      stageClass: "gallery-wall-stage gallery-wall-stage--warm",
      imageClass: "object-contain p-3 sm:p-4",
      badgeClass: "border-white/25 bg-black/40 text-white",
    },
    {
      src: unframedProofImage,
      fallbackSrc: "/printproof/gallery/wedding-unframed.jpg",
      alt: "Unframed StarMapCo poster shown in a styled setting",
      eyebrow: "Lower total",
      title: "Unframed on a neutral wall stage",
      detail: "Shows the physical print route without frame cost, while still keeping a clean in-room presentation feel.",
      bestFor: "Best for buyers who already know their own frame plan.",
      stageClass: "gallery-wall-stage gallery-wall-stage--neutral",
      imageClass: "object-contain p-3 sm:p-4",
      badgeClass: "border-black/10 bg-white/82 text-midnight",
    },
  ] as const;

  const supportCards = [
    {
      src: framedProofImage,
      fallbackSrc: "/printproof/gallery/birthday-framed.jpg",
      alt: "Framed StarMapCo print shown in a second styled interior",
      eyebrow: "In-room proof",
      title: "Second framed room view",
      detail: "Adds a second framed reference with the same wall-stage treatment for a cleaner side-by-side comparison.",
      stageClass: "gallery-wall-stage gallery-wall-stage--warm",
      imageClass: "object-contain p-3 sm:p-4",
      badgeClass: "border-white/25 bg-black/40 text-white",
    },
    {
      src: unframedProofImage,
      fallbackSrc: "/printproof/gallery/graduation-unframed.jpg",
      alt: "Unframed StarMapCo poster shown in another styled scene",
      eyebrow: "Styled proof",
      title: "Second unframed context view",
      detail: "Confirms the lower-cost route still feels deliberate with a neutral, minimal wall context.",
      stageClass: "gallery-wall-stage gallery-wall-stage--neutral",
      imageClass: "object-contain p-3 sm:p-4",
      badgeClass: "border-black/10 bg-white/82 text-midnight",
    },
  ] as const;

  return (
    <section className="brand-light-panel content-visibility-auto mt-6 overflow-hidden rounded-3xl">
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Physical product gallery</p>
          <h2 className="text-xl font-semibold text-midnight sm:text-2xl">{heading}</h2>
          <p className="max-w-3xl text-sm text-neutral-800 sm:text-base">{intro}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {heroCards.map((card) => (
            <article
              key={`${card.title}-${card.src}`}
              className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.10)]"
            >
              <div className={`relative aspect-[5/4] overflow-hidden ${card.stageClass}`}>
                <div className="absolute inset-5 z-10 overflow-hidden rounded-[14px] border border-white/40 bg-transparent shadow-[0_16px_26px_rgba(0,0,0,0.18)]">
                  <ResilientImage
                    src={card.src}
                    fallbackSrc={card.fallbackSrc}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className={card.imageClass}
                  />
                </div>
                <span
                  className={`absolute top-4 left-4 z-20 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm ${card.badgeClass}`}
                >
                  {card.eyebrow}
                </span>
              </div>
              <div className="space-y-2 border-t border-black/5 px-5 py-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-midnight">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-neutral-700">{card.detail}</p>
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">{card.bestFor}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {supportCards.map((card) => (
            <article
              key={`${card.title}-${card.src}`}
              className="overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_14px_28px_rgba(0,0,0,0.08)]"
            >
              <div className={`relative aspect-[16/10] overflow-hidden ${card.stageClass}`}>
                <div className="absolute inset-4 z-10 overflow-hidden rounded-[12px] border border-white/40 bg-transparent shadow-[0_14px_24px_rgba(0,0,0,0.16)]">
                  <ResilientImage
                    src={card.src}
                    fallbackSrc={card.fallbackSrc}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className={card.imageClass}
                  />
                </div>
                <span
                  className={`absolute top-4 left-4 z-20 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm ${card.badgeClass}`}
                >
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

        <div className="grid gap-3 lg:grid-cols-[1.25fr,0.75fr]">
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
