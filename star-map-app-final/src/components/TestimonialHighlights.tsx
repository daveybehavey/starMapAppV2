import type { VerifiedTestimonial } from "@/data/testimonials";

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
          <figure key={`${item.author}|${item.context}`} className="rounded-2xl border border-black/10 bg-white p-4">
            {item.isSample ? (
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                Sample testimonial
              </p>
            ) : null}
            <blockquote className="text-sm text-neutral-800">"{item.quote}"</blockquote>
            <figcaption className="mt-3 text-xs font-semibold text-midnight">
              {item.author} - {item.context}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
