import Image from "next/image";
import Link from "next/link";

export type OccasionArtworkItem = {
  src: string;
  alt: string;
};

type OccasionStorySectionProps = {
  heading: string;
  paragraphs: string[];
  ctaHref: string;
  ctaLabel?: string;
  artwork?: OccasionArtworkItem[];
  /** Kept under the story when provided (existing accuracy bullets). */
  bullets?: string[];
};

export default function OccasionStorySection({
  heading,
  paragraphs,
  ctaHref,
  ctaLabel = "Create your free preview",
  artwork,
  bullets,
}: OccasionStorySectionProps) {
  return (
    <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <h2 className="text-midnight text-xl font-semibold">{heading}</h2>
      {artwork && artwork.length > 0 ? (
        <div
          className={`grid gap-3 ${
            artwork.length === 1
              ? "sm:grid-cols-1"
              : artwork.length === 2 || artwork.length === 4
                ? "sm:grid-cols-2"
                : "sm:grid-cols-3"
          }`}
        >
          {artwork.map((item) => (
            <figure
              key={item.src}
              className="overflow-hidden rounded-2xl bg-neutral-100 shadow-md ring-1 shadow-black/5 ring-black/[0.06]"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
            </figure>
          ))}
        </div>
      ) : null}
      {paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)} className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          {paragraph}
        </p>
      ))}
      <p className="pt-1">
        <Link
          href={ctaHref}
          className="text-amber-800 font-semibold underline decoration-amber-400/80 underline-offset-2 hover:text-amber-950"
        >
          {ctaLabel}
        </Link>
      </p>
      {bullets && bullets.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
