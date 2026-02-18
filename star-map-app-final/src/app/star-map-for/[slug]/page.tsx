import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getOccasion, seoOccasions } from "@/data/seoOccasions";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return seoOccasions.map((occasion) => ({ slug: occasion.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const occasion = getOccasion(slug);
  if (!occasion) return {};

  return {
    title: `Star Map for ${occasion.label}`,
    description: `Create a star map for ${occasion.label.toLowerCase()}. Capture the exact night sky from your date and location with an instant preview.`,
    alternates: { canonical: `${siteUrl}/star-map-for/${occasion.slug}` },
    openGraph: {
      title: `Star Map for ${occasion.label} | StarMapCo`,
      description: `Create a star map for ${occasion.label.toLowerCase()}. Capture the exact night sky from your date and location with an instant preview.`,
      url: `${siteUrl}/star-map-for/${occasion.slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [ogImage] },
  };
}

export default async function StarMapForOccasionPage({ params }: PageProps) {
  const { slug } = await params;
  const occasion = getOccasion(slug);
  if (!occasion) notFound();

  const breadcrumbs = [
    { href: "/", label: "Home" },
    { href: "/star-map-for", label: "Star map for" },
    { href: `/star-map-for/${occasion.slug}`, label: occasion.label },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map for {occasion.label}</h1>
        <p className="text-sm text-white/90 sm:text-base">{occasion.intro}</p>
      </header>

      <PreviewStartForm
        title={`Preview a ${occasion.label.toLowerCase()} star map`}
        description="Add the date and location, then open the editor with your sky ready to customize."
        buttonLabel="Start the preview"
        source={`occasion-${occasion.slug}`}
      />
      <StickyCtaBar source={`sticky-occasion-${occasion.slug}`} />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a {occasion.label.toLowerCase()} star map works</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The night sky never repeats in the same way. A custom star map turns a meaningful date and place into a lasting
          keepsake.
        </p>
        {occasion.detail ? (
          <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
            {occasion.detail}
          </p>
        ) : null}
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate star positions for any date and location</li>
          <li>Instant preview before you download</li>
          <li>Multiple styles, shapes, and text options</li>
          <li>Print‑ready HD file after unlock</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Start your {occasion.label.toLowerCase()} star map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Preview the sky instantly</li>
          <li>Customize text and styles</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Preview your map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Example caption</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Use a line like this on your final print:
        </p>
        <p className="mt-2 rounded-2xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm font-semibold text-midnight">
          {occasion.exampleLine}
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Explore more ways to customize your map:
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Star map gift
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/star-map-in" className="text-amber-700 underline hover:text-amber-800">
            Star map by city
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">{occasion.label} star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {occasion.faqs.map((faq) => (
            <div key={faq.question}>
              <h3 className="font-semibold text-midnight">{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <FaqSchema items={occasion.faqs} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
