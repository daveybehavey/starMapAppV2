import Link from "next/link";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import { seoOccasions } from "@/data/seoOccasions";
import { isIndexableOccasionSlug, resolveOccasionIntentPath } from "@/data/seoIndexing";
import {
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  buildFramedHdCheckoutHref,
  buildStandardGiftPreviewIntents,
  getFramedHdEditorOpenDescription,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-for", label: "Star map for" },
];
const featuredOccasionSlugs = [
  "new-baby",
  "engagement",
  "proposal",
  "graduation",
  "memorial",
  "mothers-day",
  "valentines-day",
];
const featuredOccasions = seoOccasions.filter((occasion) => featuredOccasionSlugs.includes(occasion.slug));
const indexableOccasions = seoOccasions.filter((occasion) => isIndexableOccasionSlug(occasion.slug));

export const metadata: Metadata = {
  title: "Custom Star Map Gifts by Occasion | StarMapCo",
  description:
    "Personalized star map gifts for engagement, proposal, new baby, memorial, graduation, and more. Free preview — framed + HD digital, poster, or instant HD download.",
  alternates: { canonical: `${siteUrl}/star-map-for` },
  openGraph: {
    title: "Custom Star Map Gifts by Occasion | StarMapCo",
    description:
      "Personalized star map gifts for engagement, proposal, new baby, memorial, graduation, and more. Free preview — framed + HD digital, poster, or instant HD download.",
    url: `${siteUrl}/star-map-for`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Personalized star map gifts for engagement, proposal, new baby, memorial, graduation, and more. Free preview — framed + HD digital, poster, or instant HD download.",
    images: [ogImage],
  },
};

export default function StarMapForOccasionsPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("star-map-for-hub-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("star-map-for-hub");

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Star Map Gifts by Occasion</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Personalized star map gifts for engagement, proposal, new baby, memorial, graduation, and more — capture the
          exact night sky from your date and location.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/star-map-for/engagement"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Engagement gifts
          </Link>
          <Link
            href="/star-map-for/proposal"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Proposal gifts
          </Link>
          <Link
            href="/star-map-for/new-baby"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            New baby
          </Link>
          <Link
            href="/hd-star-map"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-neutral-200 underline decoration-white/30 underline-offset-2 transition hover:text-white"
          >
            Instant HD
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

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

      <GiftFormatLadder
        sourcePrefix="star-map-for-hub-ladder"
        heading="Pick your gift format"
        intro={getGiftLadderIntro()}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="star-map-for"
        title="Start your occasion preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />

      <DeliveryFormatModule
        heading="Choose the format after preview"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}). Pick an occasion page above for tailored copy, or start here.`}
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
          productionReviewTrustPoint,
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
