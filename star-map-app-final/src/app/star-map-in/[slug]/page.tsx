import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { formatLocationDisplay, seoLocations } from "@/data/seoLocations";
import { isIndexableLocationSlug } from "@/data/seoIndexing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
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
  const description = `Create a custom star map in ${display}. Start with a free preview, then choose framed print, unframed print, or HD digital delivery from the same design.`;

  return {
    title: `Star Map in ${display} | StarMapCo`,
    description,
    alternates: { canonical: `${siteUrl}/star-map-in/${location.slug}` },
    robots: shouldIndex ? undefined : { index: false, follow: true },
    openGraph: {
      title: `Star Map in ${display} | StarMapCo`,
      description,
      url: `${siteUrl}/star-map-in/${location.slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", description, images: [ogImage] },
  };
}

export default async function StarMapLocationPage({ params }: PageProps) {
  const { slug } = await params;
  const location = getLocation(slug);
  if (!location) notFound();
  if (!isIndexableLocationSlug(location.slug)) notFound();

  const display = formatLocationDisplay(location);
  const indexableLocations = seoLocations.filter((item) => isIndexableLocationSlug(item.slug));
  const sameCountry = indexableLocations.filter(
    (item) => item.slug !== location.slug && item.country && item.country === location.country
  );
  const sameRegion = indexableLocations.filter(
    (item) =>
      item.slug !== location.slug &&
      item.region &&
      location.region &&
      item.region === location.region &&
      !sameCountry.some((candidate) => candidate.slug === item.slug)
  );
  const otherLocations = indexableLocations.filter(
    (item) =>
      item.slug !== location.slug &&
      !sameCountry.some((candidate) => candidate.slug === item.slug) &&
      !sameRegion.some((candidate) => candidate.slug === item.slug)
  );
  const relatedLocations = [...sameRegion, ...sameCountry, ...otherLocations].slice(0, 4);
  const exampleLine = `${display} · June 12, 2024`;
  const shippingDisclosure = getPrintShippingDisclosure();
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
          then choose framed print, unframed print, or HD digital delivery from the same design.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        title={`Preview a ${display} star map`}
        description="Add your date and location, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
        source={`city-${location.slug}`}
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best if you want the finished map to arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you already know the frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the city, text, and layout look right.",
          },
        ]}
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
          <li>Continue into framed print, unframed print, or HD digital delivery once the preview looks right</li>
        </ol>
        <div className="pt-2">
          <Link
            href={`/editor?mode=quick&source=star-map-in-${location.slug}-cta-framed&checkout=print&print_variant=poster_framed`}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed preview
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading={`Choose how you want to keep the ${display} map`}
        intro={`Use the same preview to decide between the finished framed route, the lower-total unframed route, or HD digital delivery for ${display}.`}
        sourcePrefix={`location-${location.slug}-format`}
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Example caption</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Use a location line like this on your final print:
        </p>
        <p className="mt-2 rounded-2xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm font-semibold text-midnight">
          {exampleLine}
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related locations</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Browse nearby and popular cities:
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/star-map-in"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            All locations
          </Link>
          {relatedLocations.map((item) => (
            <Link
              key={item.slug}
              href={`/star-map-in/${item.slug}`}
              className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
            >
              {formatLocationDisplay(item)}
            </Link>
          ))}
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only when the location line, date, and layout look right."
        leftTitle="Checkout and access"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD unlock after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Unframed and framed print paths are available after preview",
          shippingDisclosure,
          "Physical orders stay in manual review before production starts",
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading={`What your ${display} order includes`}
        intro="This is the handoff from preview to the final keepsake."
      />

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
