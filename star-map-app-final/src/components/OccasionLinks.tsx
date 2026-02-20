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
    <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <h2 className="text-lg font-semibold text-midnight">Popular occasions</h2>
      <p className="mt-2 text-sm text-neutral-700 sm:text-base">
        Start with the most searched gift occasions, or browse all occasion pages.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
        {occasionLinks.map((occasion) => (
          <Link
            key={occasion.slug}
            href={resolveOccasionIntentPath(occasion.slug)}
            prefetch={false}
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            {occasion.label}
          </Link>
        ))}
      </div>
      <div className="pt-3 text-sm">
        <Link href="/star-map-for" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
          See all occasions
        </Link>
        <span className="mx-2 text-neutral-400">·</span>
        <Link href="/star-map-gallery" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
          View gallery
        </Link>
        <span className="mx-2 text-neutral-400">·</span>
        <Link href="/star-map-gift-ideas" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
          Gift ideas
        </Link>
      </div>
    </section>
  );
}
