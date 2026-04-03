import Link from "next/link";
import { resolveOccasionIntentPath } from "@/data/seoIndexing";

const occasionLinks = [
  { slug: "anniversary", label: "Anniversary" },
  { slug: "wedding", label: "Wedding" },
  { slug: "engagement", label: "Engagement" },
  { slug: "birthday", label: "Birthday" },
  { slug: "valentines-day", label: "Valentine's Day" },
  { slug: "mothers-day", label: "Mother's Day" },
  { slug: "fathers-day", label: "Father's Day" },
];

export default function OccasionLinks() {
  return (
    <section className="content-visibility-auto mt-6 rounded-2xl border border-white/12 bg-white/6 px-4 py-4 text-white/90 shadow-sm shadow-black/20 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-100">Popular occasions</h2>
          <p className="mt-1 text-xs text-neutral-300">Switch to another high-intent moment without leaving the main flow.</p>
        </div>
        <Link href="/star-map-for" prefetch={false} className="text-xs font-semibold text-amber-200 underline hover:text-amber-100">
          See all occasions
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-amber-100 sm:text-sm">
        {occasionLinks.map((occasion) => (
          <Link
            key={occasion.slug}
            href={resolveOccasionIntentPath(occasion.slug)}
            prefetch={false}
            className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 transition hover:border-amber-300/50 hover:bg-white/12"
          >
            {occasion.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
