import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { getOccasion, seoOccasions } from "@/data/seoOccasions";
import { getCanonicalOccasionPath, isIndexableOccasionSlug, resolveOccasionIntentPath } from "@/data/seoIndexing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return seoOccasions
    .filter((occasion) => isIndexableOccasionSlug(occasion.slug))
    .map((occasion) => ({ slug: occasion.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const canonicalPath = getCanonicalOccasionPath(slug);
  if (canonicalPath) {
    return {
      robots: { index: false, follow: true },
      alternates: { canonical: `${siteUrl}${canonicalPath}` },
    };
  }
  const occasion = getOccasion(slug);
  if (!occasion) return {};
  const shouldIndex = isIndexableOccasionSlug(occasion.slug);
  const description = `Create a star map for ${occasion.label.toLowerCase()}. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.`;

  return {
    title: `Star Map for ${occasion.label} | StarMapCo`,
    description,
    alternates: { canonical: `${siteUrl}/star-map-for/${occasion.slug}` },
    robots: shouldIndex ? undefined : { index: false, follow: true },
    openGraph: {
      title: `Star Map for ${occasion.label} | StarMapCo`,
      description,
      url: `${siteUrl}/star-map-for/${occasion.slug}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", description, images: [ogImage] },
  };
}

export default async function StarMapForOccasionPage({ params }: PageProps) {
  const { slug } = await params;
  const canonicalPath = getCanonicalOccasionPath(slug);
  if (canonicalPath) permanentRedirect(canonicalPath);
  const occasion = getOccasion(slug);
  if (!occasion) notFound();
  const indexableOccasions = seoOccasions.filter((item) => isIndexableOccasionSlug(item.slug));
  const occasionIndex = indexableOccasions.findIndex((item) => item.slug === occasion.slug);
  const rotatedOccasions =
    occasionIndex >= 0
      ? [...indexableOccasions.slice(occasionIndex + 1), ...indexableOccasions.slice(0, occasionIndex)]
      : indexableOccasions;
  const siblingOccasions = rotatedOccasions.slice(0, 4);
  const shippingDisclosure = getPrintShippingDisclosure();

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
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        title={`Preview a ${occasion.label.toLowerCase()} star map`}
        description="Add the date and location, then start with the framed path, the unframed path, or a neutral preview-first route."
        source={`occasion-${occasion.slug}`}
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best when the finished piece should arrive ready to hang.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you want the physical print but already know the frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the design feels right.",
          },
        ]}
      />
      <StickyCtaBar
        source={`sticky-occasion-${occasion.slug}`}
        secondaryButtonLabel="Preview framed print"
        secondaryHref={`/editor?mode=quick&source=sticky-occasion-${occasion.slug}-framed&checkout=print&print_variant=poster_framed`}
        secondaryPlan="print_framed"
      />

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
          <li>Choose framed print, unframed print, or HD digital delivery once the preview feels right</li>
        </ol>
        <div className="pt-2">
          <Link
            href={`/editor?mode=quick&source=star-map-for-${occasion.slug}-cta-framed&checkout=print&print_variant=poster_framed`}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed preview
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading={`Choose the ${occasion.label.toLowerCase()} delivery format`}
        intro={`Build the ${occasion.label.toLowerCase()} map once, then decide whether it should arrive framed, stay unframed, or remain digital for instant delivery.`}
        sourcePrefix={`occasion-${occasion.slug}-format`}
      />

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
          Browse related occasion pages and map formats:
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link href="/star-map-for" className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 hover:border-amber-400 hover:bg-amber-100">
            All occasions
          </Link>
          {siblingOccasions.map((item) => (
            <Link
              key={item.slug}
              href={resolveOccasionIntentPath(item.slug)}
              className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 hover:border-amber-400 hover:bg-amber-50"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/star-map-generator" className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 hover:border-amber-400 hover:bg-amber-50">
            Star map generator
          </Link>
          <Link href="/star-map-gift" className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 hover:border-amber-400 hover:bg-amber-50">
            Star map gift
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only when the date, text, and layout look right."
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
        heading={`What your ${occasion.label.toLowerCase()} order includes`}
        intro="This is the handoff from preview to the final keepsake."
      />

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
