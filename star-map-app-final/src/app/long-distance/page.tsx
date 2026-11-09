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
  { href: "/long-distance", label: "Long Distance" },
];

const pageTitle = "Long Distance Star Map Gift — Shared Night Sky | StarMapCo";
const pageDescription =
  "Celebrate long-distance love with a custom star map from your shared date and place. Free preview, then HD digital (download right after checkout) or framed print shipped to them.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: `${siteUrl}/long-distance` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${siteUrl}/long-distance`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const longDistanceFaqItems = [
  {
    question: "Is this good for long‑distance couples?",
    answer: "Yes. A shared sky moment makes a meaningful, personal gift.",
  },
  {
    question: "Can I add a custom message?",
    answer: "You can add a dedication line and custom text.",
  },
  {
    question: "Can I include two locations?",
    answer:
      "Each map is computed from one date and one place — one sky per map. For two cities, order a pair of maps with the same date and time, one sky per city. Add both city names in the dedication line on each design.",
  },
  {
    question: "Which gift format fits a long-distance gift best?",
    answer:
      "Recommended presentation is framed print + HD digital for a wall-ready gift plus an HD file. HD digital alone works when you need a same-night or long-distance gift — the file unlocks right after payment.",
  },
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

export default function LongDistancePage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("long-distance-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("long-distance");
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
      url: `${siteUrl}/editor?mode=quick&source=long-distance-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=long-distance-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=long-distance-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <LandingViewTracker source="occasion-long-distance" />
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Long Distance Star Map Gift</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Celebrate long‑distance love with a star map that marks a shared date and sky. Preview free, no
          account, then choose framed print, poster, or HD digital — and ship a print to them while you keep
          the matching HD file.
        </p>
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
            href="/editor?mode=quick&source=long-distance-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "long-distance-hero-canvas",
              variant: "canvas_wrap",
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview canvas wrap
          </Link>
          <InstantHdHeroExtras source="long-distance-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="long-distance-hero-instant" showButton={false} />
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
        sourcePrefix="long-distance-ladder"
        heading="Long-distance gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "a long-distance gift" })}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="long-distance"
        title="Start your long-distance preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-long-distance-framed-hd"
        title="Keep the same night, even from two cities"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-long-distance-preview"
        secondaryPlan="preview"
      />

      <OccasionStorySection
        heading="Celebrate long-distance love under a shared sky"
        paragraphs={[
          "Celebrate long‑distance love with a star map that marks a shared date and sky. Miles apart does not mean the moment has to feel distant — the map shows the exact sky from the date and place you choose, so both of you can look at the same keepsake.",
          "Choose the date you became long‑distance, the last time you were together, or a reunion. Add both city names in the dedication line. A line like Always Together · Seattle, WA · February 14, 2024 keeps both places present without pretending one map can hold two skies.",
          "HD digital unlocks right after payment when you want the gift on their screen the day you send it. A framed print ships to their door when you want the wall-ready version. Preview free with no account, then choose framed print, unframed print, canvas, or HD digital from the same approved design.",
          "Make a moment into a keepsake. Start with the free preview, refine the dedication, and only decide on a format once the wording feels right. Want the night you met instead? Continue on the night-we-met occasion page.",
        ]}
        ctaHref="/editor?mode=quick&source=occasion-long-distance-story-preview&utm_source=site&utm_medium=landing&utm_campaign=long-distance_story"
        ctaLabel="Start free preview"
        artwork={[
          {
            src: "/examples/example-anniversary-heirloom.webp",
            alt: "Long-distance star map example in Heirloom style",
          },
          {
            src: "/home-mockups/gallery-framed-light-wood.png",
            alt: "Framed star map gift for a long-distance couple",
          },
          {
            src: "/home-mockups/offer-framed-print.webp",
            alt: "Framed long-distance star map print mockup",
            aspect: "16:9",
          },
        ]}
        bullets={[
          "Shared date and place — the sky from a moment that belongs to both of you",
          "Add both city names in the dedication line",
          "Pair of maps for two cities: same date/time, one sky per city",
          "Framed + HD, poster, canvas, or HD digital from the same design",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">The same night, two cities</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Each StarMapCo design is computed from one date and one place — one sky per map. The two-cities
          idea is a pair of maps: the same date and time, with a different sky for each city&apos;s latitude
          and longitude. Never one map showing two skies.
        </p>
        <p className="text-sm text-neutral-800 sm:text-base">
          Create one preview for their city and one for yours. Add both city names in the dedication line on
          each design so the pair reads as a shared gift. For why the skies differ, see{" "}
          <Link href="/how-accurate-are-star-maps" className="font-semibold text-amber-800 underline">
            how accurate star maps are
          </Link>
          . Choosing wall size? Use the{" "}
          <Link href="/star-map-size-guide" className="font-semibold text-amber-800 underline">
            star map size guide
          </Link>
          .
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the shared date and the place that matches the sky you want on that map</li>
          <li>Add both city names in the dedication line, plus a short message if you want one</li>
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
            href="/editor?mode=quick&source=long-distance-how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Open the editor
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="long-distance-accuracy-card" />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Delivery timing</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{getPrintDeliveryEstimateExampleLine()}</p>
        <p className="text-sm text-neutral-800 sm:text-base">{getPrintUrgentHdUpsellLine()}</p>
        <ChristmasOrderByTable />
      </section>

      <DeliveryFormatModule
        heading="Choose how you want to keep the shared sky"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus the HD file. Canvas adds a premium wall option between poster and framed.`}
        sourcePrefix="long-distance-format"
      />
      <FramedProofSection
        heading="See the long-distance gift framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="long-distance-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related gift occasions</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
          <Link href="/night-we-met" className="text-amber-700 underline hover:text-amber-800">
            Night we met
          </Link>
          <Link href="/how-accurate-are-star-maps" className="text-amber-700 underline hover:text-amber-800">
            How accurate are star maps?
          </Link>
          <Link href="/star-map-size-guide" className="text-amber-700 underline hover:text-amber-800">
            Star map size guide
          </Link>
          <Link
            href="/how-personalized-star-map-works"
            className="text-amber-700 underline hover:text-amber-800"
          >
            How a personalized star map works
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
        heading="What your long-distance order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Long-distance gift confidence"
        intro="Decisions get clearer once the shared date, dedication, and whether you want a print shipped to them are already clear."
      />
      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Long-distance star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {longDistanceFaqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="Long Distance Star Map"
        description="Personalized long-distance star map showing the exact night sky from a shared date and place. Order a framed print, unframed poster, or HD digital download."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
        offerLandingUrl={`${siteUrl}/long-distance`}
      />
      <FaqSchema items={[...longDistanceFaqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
