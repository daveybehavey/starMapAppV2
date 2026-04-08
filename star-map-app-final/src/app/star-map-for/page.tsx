import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import PrimaryIntentLinksSection from "@/components/PrimaryIntentLinksSection";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import { seoOccasions } from "@/data/seoOccasions";
import { isIndexableOccasionSlug, resolveOccasionIntentPath } from "@/data/seoIndexing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-for", label: "Star map for" },
];
const featuredOccasionSlugs = [
  "anniversary",
  "wedding",
  "engagement",
  "birthday",
  "valentines-day",
  "mothers-day",
  "fathers-day",
];
const featuredOccasions = seoOccasions.filter((occasion) => featuredOccasionSlugs.includes(occasion.slug));
const indexableOccasions = seoOccasions.filter((occasion) => isIndexableOccasionSlug(occasion.slug));

export const metadata: Metadata = {
  title: "Star Map for Occasions | StarMapCo",
  description:
    "Browse occasion-based star map pages for weddings, anniversaries, proposals, graduations, and more, then jump to the clearest main route for the gift or preview path you want.",
  alternates: { canonical: `${siteUrl}/star-map-for` },
  openGraph: {
    title: "Star Map for Occasions | StarMapCo",
    description:
      "Browse occasion-based star map pages for weddings, anniversaries, proposals, graduations, and more, then jump to the clearest main route for the gift or preview path you want.",
    url: `${siteUrl}/star-map-for`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Browse occasion-based star map pages for weddings, anniversaries, proposals, graduations, and more, then jump to the clearest main route for the gift or preview path you want.",
    images: [ogImage],
  },
};

export default function StarMapForOccasionsPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map for Every Occasion</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Browse the strongest occasion pages first, then jump into the preview flow that best matches the moment.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="star-map-for"
        title="Start your occasion preview"
        description="Use the occasion links below if you want a more specific route. Otherwise enter the date and location to start a neutral preview."
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
      <PrimaryIntentLinksSection
        heading="Primary buying pages"
        intro="Use this hub to browse occasion intent. If you want the clearest main purchase page after previewing, start with one of these pages."
        links={[
          { href: "/star-map-gift", label: "Star map gift", recommended: true },
          { href: "/anniversary", label: "Anniversary star map" },
          { href: "/wedding", label: "Wedding star map" },
          { href: "/personalized-star-map", label: "Personalized star map" },
        ]}
      />

      <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Popular occasions</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          These are the most searched gift occasions. Start here if you want the fastest path into the editor.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          {featuredOccasions.map((occasion) => (
            <Link
              key={occasion.slug}
              href={resolveOccasionIntentPath(occasion.slug)}
              className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
            >
              {occasion.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Choose your occasion</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          Start with the highest-intent pages, each with a direct path into the editor.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          {indexableOccasions.map((occasion) => (
            <Link
              key={occasion.slug}
              href={resolveOccasionIntentPath(occasion.slug)}
              className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
            >
              {occasion.label}
            </Link>
          ))}
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the format after preview"
        intro="Most buyers choose between gift-ready framed print and the lower-total unframed route. HD digital stays available when instant delivery matters more than shipping."
        sourcePrefix="star-map-for-hub"
      />

      <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Explore by city</h2>
        <p className="mt-2 text-sm text-neutral-700 sm:text-base">
          Want the page tailored to your location? Browse star maps by city.
        </p>
        <div className="pt-3">
          <Link
            href="/star-map-in"
            className="inline-flex items-center justify-center rounded-full border border-amber-200/70 bg-white/80 px-5 py-3 text-sm font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map by city
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only after the date, location, and text feel right."
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
