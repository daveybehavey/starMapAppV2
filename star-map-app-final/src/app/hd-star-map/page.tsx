import Link from "next/link";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import {
  buildInstantHdPreviewIntents,
  buildPrintUpsellFromDigitalHref,
  getInstantHdGiftDetail,
  getInstantHdHeroHref,
  getInstantHdLadderIntro,
  getInstantHdPriceLine,
} from "@/lib/digitalGiftCheckout";
import { getFramedHdBundlePriceLine, getPrintProductionReviewTrustPoint, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/hd-star-map", label: "HD star map" },
];

export const metadata: Metadata = {
  title: "Instant HD Star Map Download | StarMapCo",
  description:
    "Need a star map gift tonight? Preview free, then unlock an instant HD download — high-resolution, watermark-free, ready to print or share. Physical prints optional from the same design.",
  alternates: { canonical: `${siteUrl}/hd-star-map` },
  openGraph: {
    title: "Instant HD Star Map Download | StarMapCo",
    description:
      "Same-night star map gifts: free preview, instant HD unlock after checkout. Add a framed print later from the same approved design.",
    url: `${siteUrl}/hd-star-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const faqItems = [
  {
    question: "How fast do I get the HD file?",
    answer:
      "Immediately after checkout. Your watermark-free file unlocks in the app and you can download it right away — no shipping wait.",
  },
  {
    question: "Can I still order a print from the same design?",
    answer:
      "Yes. After preview, you can upgrade to framed print, unframed poster, or canvas from the same approved map without rebuilding it.",
  },
  {
    question: "Is the HD file high enough quality to print locally?",
    answer:
      "Yes. Paid exports are high resolution (up to 6000×6000) and designed for poster-quality local printing or professional print shops.",
  },
  {
    question: "Who is instant HD best for?",
    answer:
      "Last-minute gifts, long-distance recipients, international buyers who want to avoid shipping, and anyone who prefers to frame locally.",
  },
] as const;

export default function HdStarMapPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const instantPrice = getInstantHdPriceLine();
  const instantDetail = getInstantHdGiftDetail();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const instantHref = getInstantHdHeroHref("hd-star-map-hero-instant");
  const previewIntents = buildInstantHdPreviewIntents("hd-star-map");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <LandingViewTracker source="hd-star-map" />

      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Instant delivery</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Instant HD Star Map Download</h1>
        <p className="mx-auto max-w-2xl text-sm text-neutral-200 sm:text-base">
          Preview the exact night sky free, then unlock a watermark-free HD file in minutes — perfect for same-night
          gifts, long-distance surprises, and DIY framing.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" compact />
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Instant HD file</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Optional print upgrade</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Free preview first</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={instantHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Preview & unlock instant HD
          </Link>
          <Link
            href={buildPrintUpsellFromDigitalHref("hd-star-map-hero-framed-hd")}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Or framed + HD ({bundlePriceLine})
          </Link>
        </div>
        <p className="text-xs text-neutral-300 sm:text-sm">Instant HD from {instantPrice} · file unlocks right after checkout</p>
      </header>

      <GiftFormatLadder
        sourcePrefix="hd-star-map-ladder"
        heading="Instant HD or add a physical gift"
        intro={getInstantHdLadderIntro()}
        digitalRecommended
        className="mt-8"
      />

      <PreviewStartForm
        source="hd-star-map"
        title="Start your instant HD preview"
        description={`Enter the date and place. We open checkout on instant HD (${instantDetail}) after your preview looks right.`}
        intentOptions={previewIntents}
        showMobileDateHelper={false}
      />

      <StickyCtaBar
        source="sticky-hd-star-map-instant"
        title="Need the file tonight?"
        description="Preview free — unlock instant HD when the wording and sky look perfect."
        buttonLabel="Preview instant HD"
        primaryHref={instantHref}
        primaryPlan="hd_digital"
        secondaryButtonLabel="Compare print options"
        secondaryHref={buildPrintUpsellFromDigitalHref("sticky-hd-star-map-framed-hd")}
        secondaryPlan="print_framed_hd"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why instant HD works for gift buyers</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>No shipping delay — deliver the gift tonight by email or message</li>
          <li>Works worldwide when physical print shipping is not ideal</li>
          <li>Same astronomy-accurate sky as our printed products</li>
          <li>Upgrade to framed print later from the identical approved design</li>
        </ul>
      </section>

      <AccuracyAuthorityCard source="hd-star-map-accuracy" />

      <DeliveryFormatModule
        heading="Instant HD vs physical gift"
        intro={`Start with instant HD (${instantPrice}) when speed matters. Choose framed + HD (${bundlePriceLine}) when you want a shipped keepsake plus the file.`}
        sourcePrefix="hd-star-map-format"
      />

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Pay only when the date, location, and layout feel right."
        leftTitle="Instant HD checkout"
        leftPoints={[
          "Secure Stripe checkout",
          "File unlocks immediately after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Optional print path"
        rightPoints={[
          "Same design can move to framed or unframed print later",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Support at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <WhatYouReceiveModule
        heading="What your instant HD order includes"
        intro="High-resolution PNG export generated from the same preview you approved — ready to save, share, or send to a local print shop."
      />

      <RevenueTrustModule
        heading="Digital gift confidence"
        intro="Instant HD is built for buyers who need certainty on timing: preview first, pay once, download immediately."
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Instant HD star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="font-semibold text-midnight">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <FaqSchema items={[...faqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
