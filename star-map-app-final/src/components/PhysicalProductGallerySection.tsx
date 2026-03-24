import Link from "next/link";
import type { CSSProperties } from "react";
import ResilientImage from "@/components/ResilientImage";
import { getFramedProofImage, getUnframedProofImage } from "@/lib/printProofAssets";

type PhysicalProductGallerySectionProps = {
  heading?: string;
  intro?: string;
  sourcePrefix?: string;
};

export default function PhysicalProductGallerySection({
  heading = "See the physical gift options side by side",
  intro = "These styled product proofs mix current and alternate StarMapCo map styles so buyers can compare framed and unframed finishes in realistic contexts before checkout.",
  sourcePrefix = "physical-proof-gallery",
}: PhysicalProductGallerySectionProps) {
  const framedProofImage = getFramedProofImage();
  const unframedProofImage = getUnframedProofImage();
  const primaryUnframedImage =
    unframedProofImage === framedProofImage ? "/printproof/gallery/graduation-unframed.jpg" : unframedProofImage;

  const galleryCards = [
    {
      src: framedProofImage,
      fallbackSrc: "/printproof/gallery/wedding-framed.jpg",
      alt: "Framed StarMapCo print shown hanging in a styled room",
      eyebrow: "Framed · Classic",
      title: "Ready-to-hang framed print",
      detail: "Premium framing route for buyers who want the gift to arrive finished and presentation-ready.",
      stageClass: "gallery-wall-stage gallery-wall-stage--warm",
      stageScrimClass:
        "bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.26),rgba(255,255,255,0)_62%)]",
      artWrapClass:
        "absolute inset-[11%] z-10 overflow-hidden border border-black/12 bg-white shadow-[0_14px_22px_rgba(0,0,0,0.2)]",
      imageClass: "object-contain scale-[1.08]",
      eyebrowClass: "text-amber-800",
      artWrapStyle: undefined as CSSProperties | undefined,
    },
    {
      src: primaryUnframedImage,
      fallbackSrc: "/printproof/gallery/wedding-unframed.jpg",
      alt: "Unframed StarMapCo poster shown in a styled setting",
      eyebrow: "Unframed · Classic",
      title: "Lower-cost unframed print",
      detail: "Unframed route keeps physical delivery while leaving frame choice open for the buyer.",
      stageClass: "gallery-wall-stage gallery-wall-stage--neutral",
      stageScrimClass:
        "bg-[radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.24),rgba(255,255,255,0)_58%)]",
      artWrapClass:
        "absolute inset-[11%] z-10 overflow-hidden border border-black/10 bg-white shadow-[0_14px_22px_rgba(0,0,0,0.2)]",
      imageClass: "object-contain scale-[1.07]",
      eyebrowClass: "text-slate-700",
      artWrapStyle: undefined as CSSProperties | undefined,
    },
    {
      src: "/examples/example-wedding-aurora-heart.webp",
      fallbackSrc: "/examples/example-anniversary-heirloom.webp",
      alt: "Heart-style StarMapCo example map",
      eyebrow: "Style · Heart",
      title: "Romantic heart layout",
      detail: "Heart-shaped layout gives a softer style direction without changing the delivery route.",
      stageClass: "gallery-wall-stage gallery-wall-stage--warm-alt",
      stageScrimClass:
        "bg-[radial-gradient(circle_at_22%_76%,rgba(255,255,255,0.2),rgba(255,255,255,0)_56%)]",
      artWrapClass:
        "absolute inset-[11%] z-10 overflow-hidden border border-black/10 bg-white shadow-[0_14px_22px_rgba(0,0,0,0.2)]",
      imageClass: "object-cover",
      eyebrowClass: "text-amber-800",
      artWrapStyle: undefined as CSSProperties | undefined,
    },
    {
      src: "/examples/example-birthday-noir-full.webp",
      fallbackSrc: "/examples/example-birthday-noir.webp",
      alt: "Noir-style StarMapCo map shown in-room",
      eyebrow: "Style · Noir",
      title: "Darker full-map variant",
      detail: "Noir palette gives a stronger contrast option while keeping the full square map visible.",
      stageClass: "gallery-wall-stage gallery-wall-stage--neutral-alt",
      stageScrimClass:
        "bg-[radial-gradient(circle_at_74%_72%,rgba(255,255,255,0.22),rgba(255,255,255,0)_58%)]",
      artWrapClass:
        "absolute inset-[11%] z-10 overflow-hidden border border-black/12 bg-[#0d1737] shadow-[0_14px_22px_rgba(0,0,0,0.24)]",
      imageClass: "object-contain scale-[1.03]",
      eyebrowClass: "text-slate-700",
      artWrapStyle: undefined as CSSProperties | undefined,
    },
  ] as const;

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
            <article
              key={`${card.title}-${card.src}`}
              className="group space-y-2"
            >
              <div
                className={`relative aspect-[4/5] overflow-hidden border border-black/10 bg-[#081227]/10 shadow-[0_12px_20px_rgba(0,0,0,0.18)] transition duration-200 group-hover:-translate-y-[1px] group-hover:shadow-[0_18px_28px_rgba(0,0,0,0.22)] ${card.stageClass}`}
              >
                <div className={`pointer-events-none absolute inset-0 z-[5] ${card.stageScrimClass}`} />
                <div className={card.artWrapClass} style={card.artWrapStyle}>
                  <ResilientImage
                    src={card.src}
                    fallbackSrc={card.fallbackSrc}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                    className={card.imageClass}
                  />
                </div>
              </div>
              <div className="space-y-1 px-1">
                <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${card.eyebrowClass}`}>{card.eyebrow}</p>
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
