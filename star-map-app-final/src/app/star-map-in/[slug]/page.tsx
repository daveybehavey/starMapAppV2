import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { formatLocationDisplay, seoLocations } from "@/data/seoLocations";
import { isIndexableLocationSlug } from "@/data/seoIndexing";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

type PageProps = {
  params: Promise<{ slug: string }>;
};

const getLocation = (slug: string) => seoLocations.find((item) => item.slug === slug);

export function generateStaticParams() {
  return seoLocations
    .filter((location) => isIndexableLocationSlug(location.slug))
    .map((location) => ({ slug: location.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location) return {};
  const display = formatLocationDisplay(location);
  const shouldIndex = isIndexableLocationSlug(location.slug);

  return {
    title: `Star Map in ${display}`,
    description: `Create a custom star map in ${display}. Capture the exact night sky from your date and location with an instant preview.`,
    alternates: { canonical: `${siteUrl}/star-map-in/${location.slug}` },
    robots: shouldIndex ? undefined : { index: false, follow: true },
    openGraph: {
      title: `Star Map in ${display} | StarMapCo`,
      description: `Create a custom star map in ${display}. Capture the exact night sky from your date and location with an instant preview.`,
      url: `${siteUrl}/star-map-in/${location.slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [ogImage] },
  };
}

export default async function StarMapLocationPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location) notFound();

  const display = formatLocationDisplay(location);
  const exampleLine = `${display} · June 12, 2024`;
  const breadcrumbs = [
    { href: "/", label: "Home" },
    { href: "/star-map-in", label: "Star map in" },
    { href: `/star-map-in/${location.slug}`, label: display },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map in {display}</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Create a custom star map for {display} and capture the exact night sky from your date and location. Preview instantly,
          then download a print‑ready file.
        </p>
      </header>

      <PreviewStartForm
        title={`Preview a ${display} star map`}
        description="Add your date and location to open the editor with your sky ready to customize."
        buttonLabel="Start the preview"
        source={`city-${location.slug}`}
      />
      <StickyCtaBar source={`sticky-city-${location.slug}`} />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">A star map that matches your moment in {display}</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          The night sky changes throughout the year. Your map is calculated from real astronomical data so the stars and
          constellations match your exact date and location in {display}.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate to your date, time, and location</li>
          <li>Instant preview so you can refine the details</li>
          <li>Multiple styles, shapes, and text layouts</li>
          <li>Print‑ready HD download after unlock</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Start your {display} star map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Preview the sky instantly</li>
          <li>Customize text, styles, and shapes</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href={`/editor?mode=quick&source=star-map-in-${location.slug}-cta`}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Preview your map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Example caption</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Use a location line like this on your final print:
        </p>
        <p className="mt-2 rounded-2xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm font-semibold text-midnight">
          {exampleLine}
        </p>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map in {display} FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-700 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Can I create a star map for {display}?</h3>
            <p>
              Yes. Enter any date and time, and the map will render the accurate night sky for {display}.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is the {display} star map print‑ready?</h3>
            <p>
              The HD export is a high‑resolution PNG designed for printing and framing.
            </p>
          </div>
        </div>
      </section>

      <FaqSchema
        items={[
          {
            question: `Can I create a star map for ${display}?`,
            answer: `Yes. Enter any date and time, and the map will render the accurate night sky for ${display}.`,
          },
          {
            question: `Is the ${display} star map print‑ready?`,
            answer: "The HD export is a high‑resolution PNG designed for printing and framing.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
