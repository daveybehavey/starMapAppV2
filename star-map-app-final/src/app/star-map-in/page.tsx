import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import PrimaryIntentLinksSection from "@/components/PrimaryIntentLinksSection";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import { formatLocationDisplay, seoLocations } from "@/data/seoLocations";
import { isIndexableLocationSlug } from "@/data/seoIndexing";
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
    "Browse city-specific star map pages, then jump to the clearest main route or start a preview when you already know the location.",
  alternates: { canonical: `${siteUrl}/star-map-in` },
  openGraph: {
    title: "Star Map by City | StarMapCo",
    description:
      "Browse city-specific star map pages, then jump to the clearest main route or start a preview when you already know the location.",
    url: `${siteUrl}/star-map-in`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Browse city-specific star map pages, then jump to the clearest main route or start a preview when you already know the location.",
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
          Use this hub to find the best city-specific page first, or jump straight into preview if you already know the location you want.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="star-map-in-hub"
        title="Start a location-based preview"
        description="Use the location links below if you want a city-specific page first. Otherwise enter your date and location to open the preview."
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
      <PrimaryIntentLinksSection
        heading="Primary start pages"
        intro="Use this hub to browse city intent. If you want the clearest main purchase page after previewing, start with one of these pages."
        links={[
          { href: "/personalized-star-map", label: "Personalized star map", recommended: true },
          { href: "/star-map-gift", label: "Star map gift" },
          { href: "/star-map-gallery", label: "Star map gallery" },
        ]}
      />

      <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Popular locations</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          Each page gives you location-specific wording and examples, but the same core preview and checkout flow.
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
          "Physical orders get a manual quality check before production starts",
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
