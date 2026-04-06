import type { VerifiedTestimonial } from "@/data/testimonials";
import Image from "next/image";

type TestimonialHighlightsProps = {
  heading?: string;
  intro?: string;
  testimonials: VerifiedTestimonial[];
};

export default function TestimonialHighlights({
  heading = "Verified customer feedback",
  intro = "Short notes from real buyers after they received their final map.",
  testimonials,
}: TestimonialHighlightsProps) {
  if (!testimonials.length) return null;

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((item) => (
          <figure
            key={`${item.author}|${item.context}`}
            className="overflow-hidden rounded-2xl border border-black/10 bg-white"
          >
            {item.imageSrc ? (
              <div className="relative aspect-[4/3] w-full border-b border-black/5 bg-neutral-100">
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt || `${item.author} StarMapCo customer proof`}
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                  className="object-cover"
                />
              </div>
            ) : null}
            <div className="p-4">
              <blockquote className="text-sm text-neutral-800">"{item.quote}"</blockquote>
              {item.imageNote ? <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-amber-700">{item.imageNote}</p> : null}
            </div>
            <figcaption className="px-4 pb-4 text-xs font-semibold text-midnight">
              {item.author} - {item.context}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
