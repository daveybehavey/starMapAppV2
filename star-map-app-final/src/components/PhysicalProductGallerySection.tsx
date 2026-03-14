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

  const heroCards = [
    {
      src: framedProofImage,
      fallbackSrc: "/printproof/framed-catalog.jpg",
      alt: "Framed StarMapCo print product mockup",
      eyebrow: "Premium default",
      title: "Framed gift-ready print",
      detail: "Ready-to-hang 14x14 black frame for the strongest presentation and easiest gifting path.",
      bestFor: "Best for anniversaries, weddings, and premium gifting.",
      stageClass:
        "bg-[radial-gradient(circle_at_top,rgba(248,227,175,0.78),rgba(238,230,214,0.97)_48%,rgba(225,217,205,1)_100%)]",
      imageClass: "object-contain p-8 drop-shadow-[0_24px_24px_rgba(0,0,0,0.22)]",
      badgeClass: "border-amber-300/55 bg-amber-300/18 text-amber-900",
    },
    {
      src: unframedProofImage,
      fallbackSrc: "/printproof/unframed-catalog.jpg",
      alt: "Unframed StarMapCo poster product mockup",
      eyebrow: "Lower total",
      title: "Museum-grade poster",
      detail: "18x18 unframed poster if you want the physical version without paying for the frame.",
      bestFor: "Best for buyers who already know their own frame plan.",
      stageClass:
        "bg-[radial-gradient(circle_at_top,rgba(255,250,238,0.98),rgba(243,236,226,0.98)_52%,rgba(232,226,216,1)_100%)]",
      imageClass: "object-contain p-8 drop-shadow-[0_20px_20px_rgba(0,0,0,0.18)]",
      badgeClass: "border-black/10 bg-white/82 text-midnight",
    },
  ] as const;

  const supportCards = [
    {
      src: "/printproof/gallery/wedding-framed.jpg",
      fallbackSrc: framedProofImage,
      alt: "Framed StarMapCo print shown in a styled room",
      eyebrow: "In-room proof",
      title: "Framed in a real room",
      detail: "Shows the finished framed piece landing in a real interior instead of a flat mockup stage.",
      stageClass:
        "bg-[linear-gradient(180deg,rgba(25,28,35,0.03),rgba(10,14,22,0.14))]",
      imageClass: "object-cover scale-[1.02]",
      badgeClass: "border-white/25 bg-black/40 text-white",
    },
    {
      src: "/printproof/gallery/graduation-unframed.jpg",
      fallbackSrc: unframedProofImage,
      alt: "Unframed StarMapCo poster shown in a styled scene",
      eyebrow: "Styled proof",
      title: "Poster in a styled space",
      detail: "Confirms the lower-cost route still feels intentional when staged well.",
      stageClass:
        "bg-[radial-gradient(circle_at_top,rgba(255,247,222,0.45),rgba(233,227,217,0.95)_58%,rgba(223,217,209,1)_100%)]",
      imageClass: "object-cover scale-[1.02]",
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
                <div className="absolute inset-x-12 bottom-7 h-10 rounded-full bg-black/15 blur-2xl" />
                <ResilientImage
                  src={card.src}
                  fallbackSrc={card.fallbackSrc}
                  alt={card.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className={card.imageClass}
                />
                <span
                  className={`absolute top-4 left-4 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm ${card.badgeClass}`}
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
                <ResilientImage
                  src={card.src}
                  fallbackSrc={card.fallbackSrc}
                  alt={card.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className={card.imageClass}
                />
                <span
                  className={`absolute top-4 left-4 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm ${card.badgeClass}`}
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
