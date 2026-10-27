import Link from "next/link";
import { resolveOccasionIntentPath } from "@/data/seoIndexing";

type OccasionLink =
  | { kind: "slug"; slug: string; label: string }
  | { kind: "href"; href: string; label: string };

const occasionLinks: OccasionLink[] = [
  { kind: "slug", slug: "anniversary", label: "Anniversary" },
  { kind: "slug", slug: "wedding", label: "Wedding" },
  { kind: "slug", slug: "engagement", label: "Engagement" },
  { kind: "slug", slug: "night-we-met", label: "Night We Met" },
  { kind: "slug", slug: "birthday", label: "Birthday" },
  { kind: "href", href: "/christmas-star-map-gift", label: "Christmas" },
  { kind: "slug", slug: "valentines-day", label: "Valentine's Day" },
  { kind: "slug", slug: "mothers-day", label: "Mother's Day" },
  { kind: "slug", slug: "fathers-day", label: "Father's Day" },
];

export default function OccasionLinks() {
  return (
    <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <h2 className="text-lg font-semibold text-midnight">Popular occasions</h2>
      <p className="mt-2 text-sm text-neutral-700 sm:text-base">
        Start with these gift occasions, or browse all occasion pages.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
        {occasionLinks.map((occasion) => {
          const href =
            occasion.kind === "href" ? occasion.href : resolveOccasionIntentPath(occasion.slug);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
            >
              {occasion.label}
            </Link>
          );
        })}
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
