import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
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
    "Explore custom star maps by city. Create a star map for your location with HD plus unframed and framed print options.",
  alternates: { canonical: `${siteUrl}/star-map-in` },
  openGraph: {
    title: "Star Map by City | StarMapCo",
    description:
      "Explore custom star maps by city. Create a star map for your location with HD plus unframed and framed print options.",
    url: `${siteUrl}/star-map-in`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Explore custom star maps by city. Create a star map for your location with HD plus unframed and framed print options.",
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
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital keepsake</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
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
          Enter your date and location, preview the exact sky, and then choose HD, unframed print, or framed print when ready.
        </p>
        <div className="pt-3">
          <Link
            href="/editor?mode=quick&source=star-map-in-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Preview your star map
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the format after preview"
        intro="Use the same map preview to decide between instant HD, unframed print, or the finished framed version once the location details look right."
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
          "Physical orders stay in manual review before production starts",
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
