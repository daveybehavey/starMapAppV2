import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import GiftFormatCtaLink from "@/components/GiftFormatCtaLink";
import GiftFormatsTelemetry from "@/components/GiftFormatsTelemetry";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import ResilientImage from "@/components/ResilientImage";
import StickyCtaBar from "@/components/StickyCtaBar";
import { formatPrice, getPricingTiers, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import { getPrintPhysicalOrderSummaryLine } from "@/lib/commerceFacts";
import {
  formatPrintPriceWithShipping,
  getPrintAllowedCountries,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { FRAMED_HD_RECOMMENDED_BADGE } from "@/lib/moneyPageGiftCheckout";
import FramedProofSection from "@/components/FramedProofSection";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import { PRINT_NEUTRAL_SHIPPING_CARD_NOTE } from "@/lib/printfulShipping";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift-formats", label: "Gift formats" },
];

export const metadata: Metadata = {
  title: "Star Map Gift Formats | StarMapCo",
  description: "Compare StarMapCo gift formats in one place: HD digital, framed print, and unframed poster.",
  alternates: { canonical: `${siteUrl}/star-map-gift-formats` },
  openGraph: {
    title: "Star Map Gift Formats | StarMapCo",
    description:
      "Compare StarMapCo gift formats in one place: HD digital, framed print, and unframed poster.",
    url: `${siteUrl}/star-map-gift-formats`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGiftFormatsPage() {
  const pricing = getPricingTiers();
  const printPricing = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const printCountryCount = getPrintAllowedCountries().length;
  const shippingDisclosure = getPrintShippingDisclosure();
  const proofImages = {
    framed: HOME_MOCKUPS.framedBedroom,
    unframed: HOME_MOCKUPS.unframedPoster,
  };

  const liveFormats = [
    {
      title: "HD digital download",
      badge: "Instant",
      price: formatPrice(pricing.single.amountCents, pricing.single.currency),
      detail: "Built for same-day gifting and local print shops.",
      href: "/editor?mode=quick&source=gift-formats-digital",
      imageSrc: HOME_MOCKUPS.digitalHd,
      fallbackSrc: HOME_MOCKUPS.digitalHd,
      bulletA: "Up to 6000x6000 PNG",
      bulletB: "Immediate access after payment",
      source: "gift-formats-digital-cta",
      orderType: "digital" as const,
      plan: "single" as const,
      printVariant: undefined,
      index: 0,
    },
    {
      title: `${printPricing.poster_framed.label}`,
      badge: FRAMED_HD_RECOMMENDED_BADGE,
      price: formatPrintPriceWithShipping(
        printPricing.poster_framed.amountCents,
        printPricing.poster_framed.currency
      ),
      detail: `Premium ready-to-hang gift path. ${PRINT_NEUTRAL_SHIPPING_CARD_NOTE}`,
      href: "/editor?mode=quick&source=gift-formats-framed&checkout=print&print_variant=poster_framed",
      imageSrc: proofImages.framed,
      fallbackSrc: HOME_MOCKUPS.framedBedroom,
      bulletA: "Ready-to-hang framed delivery",
      bulletB: "Premium ready-to-hang presentation",
      source: "gift-formats-framed-cta",
      orderType: "print" as const,
      plan: "single" as const,
      printVariant: "poster_framed" as const,
      index: 1,
    },
    {
      title: `${printPricing.poster_unframed.label}`,
      badge: "Lower physical cost",
      price: formatPrintPriceWithShipping(
        printPricing.poster_unframed.amountCents,
        printPricing.poster_unframed.currency
      ),
      detail: `Professional poster print path. ${PRINT_NEUTRAL_SHIPPING_CARD_NOTE}`,
      href: "/editor?mode=quick&source=gift-formats-unframed&checkout=print&print_variant=poster_unframed",
      imageSrc: proofImages.unframed,
      fallbackSrc: HOME_MOCKUPS.unframedPoster,
      bulletA: "Museum-grade poster stock",
      bulletB: "Lower-cost physical option",
      source: "gift-formats-unframed-cta",
      orderType: "print" as const,
      plan: "single" as const,
      printVariant: "poster_unframed" as const,
      index: 2,
    },
  ] as const;

  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-12 sm:pt-14">
      <GiftFormatsTelemetry source="gift-formats-page" />
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star map gift formats</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Start with one preview, then choose your delivery format. This page focuses on the live checkout
          options.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
      </header>

      <PreviewStartForm source="star-map-gift-formats" />
      <StickyCtaBar
        source="sticky-gift-formats"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-gift-formats-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <PhysicalProductGallerySection
        heading="See the live physical formats first"
        intro="Room mockups from current StarMapCo artwork — framed, unframed, and in-home styling — so buyers can judge the finish before checkout."
        sourcePrefix="gift-formats-physical-proof"
      />

      <FramedProofSection sourcePrefix="gift-formats-proof" />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Live checkout formats</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          We keep live options focused on formats that perform well for quality, delivery, and support.{" "}
          {shippingDisclosure}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {liveFormats.map((item) => (
            <article key={item.title} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-black/10 bg-neutral-100">
                <ResilientImage
                  src={item.imageSrc}
                  fallbackSrc={item.fallbackSrc}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <p className="inline-flex rounded-full border border-amber-300/60 bg-amber-100/80 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.12em] text-amber-800 uppercase">
                {item.badge}
              </p>
              <h3 className="text-midnight mt-2 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm font-semibold text-amber-700">{item.price}</p>
              <p className="mt-2 text-xs text-neutral-700">{item.detail}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-700">
                <li>{item.bulletA}</li>
                <li>{item.bulletB}</li>
              </ul>
              <GiftFormatCtaLink
                href={item.href}
                className="bg-midnight hover:bg-midnight/90 mt-4 inline-flex rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-white"
                source={item.source}
                plan={item.plan}
                orderType={item.orderType}
                printVariant={item.printVariant}
                listId="gift_formats_live_options"
                listName="Gift formats live options"
                index={item.index}
              >
                Preview this format
              </GiftFormatCtaLink>
            </article>
          ))}
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">How we decide what launches</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Quality standard: no weak print quality or fragile packaging.</li>
          <li>Margin gate: every SKU must clear profitability targets across top shipping countries.</li>
          <li>Support risk: we avoid formats that create avoidable returns and support load.</li>
          <li>Checkout focus: too many options hurt conversions, so we keep primary checkout clean.</li>
        </ul>
        <p className="text-xs text-neutral-700">
          Current print coverage: {printCountryCount} shipping countries. Current print + HD add-on price:{" "}
          {formatPrice(digitalAddOn.amountCents, digitalAddOn.currency)}.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link
            href="/star-map-gift"
            prefetch={false}
            className="text-amber-700 underline hover:text-amber-800"
          >
            Back to star map gift page
          </Link>
          <Link href="/shipping" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
            View shipping policy
          </Link>
          <Link
            href="/how-to-print-star-map"
            prefetch={false}
            className="text-amber-700 underline hover:text-amber-800"
          >
            View print guide
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Gift formats FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="text-midnight font-semibold">Can I choose format before designing?</h3>
            <p>
              Yes, but the recommended flow is preview first, then choose digital, framed, or unframed
              checkout.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Will you add more products?</h3>
            <p>Yes. New products are added in pilots after quality and margin checks pass.</p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Can I buy digital and print together?</h3>
            <p>Yes. Print checkout can include the HD digital add-on so you have both immediately.</p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Where can I request a new product format?</h3>
            <p>
              Email support@starmapco.com with your request and country so we can prioritize pilot demand.
            </p>
          </div>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you choose a format"
        intro="Preview for free first. Pick digital, framed, or unframed only once the design feels right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths available after preview",
          shippingDisclosure,
          getPrintPhysicalOrderSummaryLine(),
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your gift format order includes"
        intro="Same approved map can stay digital, ship unframed, or arrive framed."
      />

      <FaqSchema
        items={[
          {
            question: "Can I choose format before designing?",
            answer:
              "Yes, but the recommended flow is preview first, then choose digital, framed, or unframed checkout.",
          },
          {
            question: "Will you add more products?",
            answer: "Yes. New products are added in pilots after quality and margin checks pass.",
          },
          {
            question: "Can I buy digital and print together?",
            answer: "Yes. Print checkout can include the HD digital add-on so you have both immediately.",
          },
          {
            question: "Where can I request a new product format?",
            answer:
              "Email support@starmapco.com with your request and country so we can prioritize pilot demand.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
