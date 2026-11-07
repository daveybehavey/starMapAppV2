import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import ChristmasOrderByTable from "@/components/ChristmasOrderByTable";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import OccasionLinks from "@/components/OccasionLinks";
import OccasionStorySection from "@/components/OccasionStorySection";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import ProductSchema from "@/components/ProductSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { getOccasion } from "@/data/seoOccasions";
import {
  PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS,
  PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS,
  getPrintDeliveryEstimateExampleLine,
  getPrintUrgentHdUpsellLine,
} from "@/lib/commerceFacts";
import {
  buildFramedHdCheckoutHref,
  buildStandardGiftPreviewIntents,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import {
  buildPrintEditorCheckoutHref,
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/graduation", label: "Graduation" },
];

const occasion = getOccasion("graduation")!;
const pageTitle = occasion.seoTitle ?? "Graduation Star Map Gift | Ceremony Night Sky | StarMapCo";
const pageDescription =
  occasion.seoDescription ??
  "The sky over their ceremony or campus, with name and class year. A keepsake beyond card and cash. Free preview; HD, print or framed.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: `${siteUrl}/graduation` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${siteUrl}/graduation`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const graduationFaqItems = [
  ...occasion.faqs,
  {
    question: "Is the preview really free?",
    answer:
      "Yes. You can create and view your map preview without an account or payment, and only pay if you choose a format.",
  },
  {
    question: "How long does delivery take?",
    answer: `${getPrintDeliveryEstimateExampleLine()} ${getPrintUrgentHdUpsellLine()}`,
  },
] as const;

export default function GraduationPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("graduation-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("graduation");
  const tiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
  );
  const schemaCurrency = (tiers.single.currency || "USD").toUpperCase();
  const productOffers = [
    {
      name: "HD digital download",
      price: (tiers.single.amountCents / 100).toFixed(2),
      priceCurrency: schemaCurrency,
      url: `${siteUrl}/editor?mode=quick&source=graduation-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=graduation-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=graduation-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <LandingViewTracker source="occasion-graduation" />
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          {occasion.seoH1 ?? "Graduation Star Map Gift"}
        </h1>
        <p className="text-sm text-neutral-200 sm:text-base">{occasion.intro}</p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">
            Framed print
          </span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">
            Unframed print
          </span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
            HD digital delivery
          </span>
        </div>
        <ul className="mx-auto flex max-w-sm flex-col gap-1.5 text-left text-sm text-white/85 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Free preview — no payment required
          </li>
          <li className="hidden items-center gap-1.5 text-white/35 sm:flex" aria-hidden="true">
            ·
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Secure Stripe checkout
          </li>
          <li className="hidden items-center gap-1.5 text-white/35 sm:flex" aria-hidden="true">
            ·
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Same design unlocks framed, unframed, or HD
          </li>
        </ul>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=graduation-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "graduation-hero-canvas",
              variant: "canvas_wrap",
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview canvas wrap
          </Link>
          <InstantHdHeroExtras source="graduation-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="graduation-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
        <p className="text-xs text-neutral-300 sm:text-sm">
          Made to order in {PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} · U.S. transit typically{" "}
          {PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} ·{" "}
          <Link
            href="/shipping"
            className="underline decoration-white/30 underline-offset-2 hover:text-white"
          >
            Delivery ranges by destination
          </Link>
        </p>
      </header>

      <GiftFormatLadder
        sourcePrefix="graduation-ladder"
        heading="Graduation gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "a graduation" })}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="graduation"
        title="Start your graduation preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-graduation-framed-hd"
        title="A gift that outlasts the gown"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-graduation-preview"
        secondaryPlan="preview"
      />

      <OccasionStorySection
        heading={occasion.storyHeading ?? "A graduation gift that outlasts the gown"}
        paragraphs={
          occasion.storyParagraphs ??
          (occasion.detail ? [occasion.intro, occasion.detail] : [occasion.intro])
        }
        ctaHref={
          occasion.storyCtaHref ??
          "/editor?mode=quick&source=occasion-graduation-story-preview&utm_source=site&utm_medium=landing&utm_campaign=graduation_story"
        }
        ctaLabel={occasion.storyCtaLabel ?? "Start free preview"}
        artwork={occasion.artwork}
        bullets={[
          "Ceremony date or celebration night over campus",
          "Add school name, class year, or degree in the personalization",
          "Framed for a first apartment or dorm wall",
          "HD they can print wherever the graduate lands next",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Example caption</h2>
        <p className="text-sm text-neutral-800 sm:text-base">Use a line like this on your final print:</p>
        <p className="text-midnight mt-2 rounded-2xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm font-semibold">
          Class of 2024 · Boston, MA · May 25, 2024
        </p>
        <p className="text-sm text-neutral-800 sm:text-base">{occasion.detail}</p>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the ceremony date or celebration night and the campus or venue town</li>
          <li>Add the graduate&apos;s name, school, class year, or degree line</li>
          <li>Preview the design free — no account required — and refine style or wording</li>
          <li>Choose framed print, unframed print, canvas, or HD digital from the same approved design</li>
        </ol>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-amber-700 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/how-personalized-star-map-works"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            How the map works
          </Link>
          <Link
            href="/editor?mode=quick&source=graduation-how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Open the editor
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="graduation-accuracy-card" />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Delivery timing</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{getPrintDeliveryEstimateExampleLine()}</p>
        <p className="text-sm text-neutral-800 sm:text-base">{getPrintUrgentHdUpsellLine()}</p>
        <ChristmasOrderByTable />
      </section>

      <DeliveryFormatModule
        heading="Choose how you want to keep the ceremony sky"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus the HD file. Canvas adds a premium wall option between poster and framed.`}
        sourcePrefix="graduation-format"
      />
      <FramedProofSection
        heading="See the graduation gift framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="graduation-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related gift occasions</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/first-home" className="text-amber-700 underline hover:text-amber-800">
            First home star maps
          </Link>
          <Link href="/night-we-met" className="text-amber-700 underline hover:text-amber-800">
            Night we met
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
          <Link
            href="/how-personalized-star-map-works"
            className="text-amber-700 underline hover:text-amber-800"
          >
            How a personalized star map works
          </Link>
          <Link href="/editor" className="text-amber-700 underline hover:text-amber-800">
            Open the editor
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only once the wording, date, and layout feel right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "HD digital download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths are available after preview",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your graduation order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Graduation gift confidence"
        intro="Decisions get clearer once the ceremony date, class year line, and whether you want a framed print or HD for a graduate on the move are already clear."
      />
      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Graduation star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {graduationFaqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="Graduation Star Map"
        description="Personalized graduation star map showing the exact night sky from the ceremony or campus on graduation day. Order a framed print, unframed poster, or HD digital download."
        imageUrl={`${siteUrl}/examples/example-graduation-aurora.webp`}
        offers={productOffers}
      />
      <FaqSchema items={[...graduationFaqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
