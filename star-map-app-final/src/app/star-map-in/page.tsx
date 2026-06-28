import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import { formatLocationDisplay, seoLocations } from "@/data/seoLocations";
import { isIndexableLocationSlug } from "@/data/seoIndexing";
import { getPrintPhysicalOrderSummaryLine } from "@/lib/commerceFacts";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-in", label: "Star map in" },
];

export const metadata: Metadata = {
  title: "Star Map by City | StarMapCo",
  description:
    "Explore custom star maps by city. Start with a free preview, then choose framed print, unframed print, or HD digital delivery for your location.",
  alternates: { canonical: `${siteUrl}/star-map-in` },
  openGraph: {
    title: "Star Map by City | StarMapCo",
    description:
      "Explore custom star maps by city. Start with a free preview, then choose framed print, unframed print, or HD digital delivery for your location.",
    url: `${siteUrl}/star-map-in`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Explore custom star maps by city. Start with a free preview, then choose framed print, unframed print, or HD digital delivery for your location.",
    images: [ogImage],
  },
};

export default function StarMapByCityPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const indexableLocations = seoLocations.filter((location) => isIndexableLocationSlug(location.slug));

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map by City</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Pick your city to create a custom star map of the exact night sky from a meaningful date and location.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Popular locations</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          Each page includes tailored examples, FAQs, and a direct path into the editor.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          {indexableLocations.map((location) => (
            <Link
              key={location.slug}
              href={`/star-map-in/${location.slug}`}
              className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
            >
              {formatLocationDisplay(location)}
            </Link>
          ))}
        </div>
      </section>

      <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Start your map in minutes</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          Enter your date and location, preview the exact sky, and then choose framed print, unframed print, or HD digital delivery when ready.
        </p>
        <div className="pt-3">
          <Link
            href="/editor?mode=quick&source=star-map-in-cta-framed&checkout=print&print_variant=poster_framed"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <PreviewStartForm
        source="star-map-in-hub"
        title="Start a location-based preview"
        description="Enter your date and location, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
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

      <DeliveryFormatModule
        heading="Choose the format after preview"
        intro="Use the same map preview to decide between the finished framed route, the lower-total unframed route, or HD digital delivery once the location details look right."
        sourcePrefix="star-map-in-hub"
      />

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only after the city, date, and final text feel right."
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
          getPrintPhysicalOrderSummaryLine(),
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
