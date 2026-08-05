import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import ProductSchema from "@/components/ProductSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import {
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  buildFramedHdCheckoutHref,
  buildStandardGiftPreviewIntents,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/night-sky-map-gift", label: "Night sky map gift" },
];

export const metadata: Metadata = {
  title: "Night Sky Map Gift — Personalized for Any Date & Occasion | StarMapCo",
  description:
    "Give a personalized night sky map gift for anniversaries, birthdays, weddings, or memorials. Preview the exact stars from their date for free, then choose framed print or HD digital.",
  alternates: { canonical: `${siteUrl}/night-sky-map-gift` },
  openGraph: {
    title: "Night Sky Map Gift — Personalized for Any Date & Occasion | StarMapCo",
    description:
      "Give a personalized night sky map gift for anniversaries, birthdays, weddings, or memorials. Preview the exact stars from their date for free, then choose framed print or HD digital.",
    url: `${siteUrl}/night-sky-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function NightSkyMapGiftPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("night-sky-map-gift-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("night-sky-map-gift");
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
      url: `${siteUrl}/editor?mode=quick&source=night-sky-gift-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=night-sky-gift-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=night-sky-gift-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Night Sky Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          A night sky map gift captures the exact stars from a meaningful date and place — perfect for
          anniversaries, weddings, birthdays, and milestones. Preview the real sky for free, then choose a{" "}
          <strong className="font-semibold text-amber-100">framed print</strong>, unframed poster, or instant
          HD digital.
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
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=night-sky-map-gift-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <InstantHdHeroExtras source="night-sky-map-gift-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="night-sky-map-gift-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
      </header>

      <GiftFormatLadder
        sourcePrefix="night-sky-gift-ladder"
        heading="Night sky gift formats"
        intro={getGiftLadderIntro()}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="night-sky-map-gift"
        title="Start the night-sky gift preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-night-sky-map-gift-framed-hd"
        title="Ready to preview their night sky?"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-night-sky-map-gift-preview"
        secondaryPlan="preview"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Why night sky maps make unforgettable gifts</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars on a specific night never repeat in the same way. A custom night sky map turns that moment
          into a gift that feels thoughtful and unique.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>One approved design can stay digital, go unframed, or arrive framed</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Create a gift in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Choose the date and location that matter most</li>
          <li>Pick a style and add names or a dedication</li>
          <li>Preview the map instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=night-sky-map-gift-cta-framed&checkout=print&print_variant=poster_framed"
            className="text-midnight focus:ring-gold inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <AccuracyAuthorityCard source="night-sky-gift-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose the format after you preview the night sky"
        intro="Choose between the presentation-ready framed route and the lower-cost unframed route. HD digital stays available for same-day delivery."
        sourcePrefix="night-sky-gift-format"
      />

      <FramedProofSection
        heading="Framed proof matters for gift buyers"
        intro="The preview proves the design. This framed photo proves the physical result. Use both before you decide how the gift should be delivered."
        sourcePrefix="night-sky-gift-proof"
      />
      <PhysicalProductGallerySection
        heading="Compare the framed and unframed physical finish"
        intro="Compare Printful mockups for the framed and unframed routes before you leave the page—same artwork pipeline as production."
        sourcePrefix="night-sky-gift-physical-proof"
      />
      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Pay when the night-sky layout, wording, and delivery route feel right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD unlock after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths after preview",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Shipping, returns, and refund details linked below",
        ]}
        guideLabel="Print and frame guide"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">More gift inspiration</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Looking for more ideas? Explore star map gift guides and examples.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
          <Link href="/custom-night-sky-map" className="text-amber-700 underline hover:text-amber-800">
            Custom night sky map
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Star map gift
          </Link>
          <Link href="/star-map-gift-ideas" className="text-amber-700 underline hover:text-amber-800">
            Star map gift ideas
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Night sky map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="text-midnight font-semibold">What is a night sky map gift?</h3>
            <p>
              A night sky map gift is a custom star map showing the exact positions of stars and
              constellations on a specific date and location — such as an anniversary, wedding, or birthday.
              It is printed or delivered digitally and personalized with names, a date, and a message.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">How fast do I receive a night sky map gift?</h3>
            <p>
              The HD digital download is available instantly after payment — ideal for last-minute gifting.
              Framed and unframed print routes show exact shipping timelines before you pay. All routes start
              with a free preview.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">What makes this a personalized gift?</h3>
            <p>
              Every map is generated from the exact date, time, and location you provide, using real
              astronomical data. The star positions are accurate to that specific moment — not a generic
              illustration. You also add custom text like names, a date, and a short message.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Is a night sky map a good anniversary gift?</h3>
            <p>
              Yes — an anniversary star map captures the exact sky from your shared date and place. Enter your
              anniversary date and the location where you were together to generate that night. The framed
              print route arrives ready to hang.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Can I get a night sky map gift same-day?</h3>
            <p>
              Yes. The HD digital download is delivered instantly after payment and can be printed at home or
              at a local print shop on the same day.
            </p>
          </div>
        </div>
      </section>
      <ProductSchema
        name="Night Sky Map Gift"
        description="Personalized night sky map gift showing the exact stars from any meaningful date and location. Perfect for anniversaries, weddings, birthdays, and milestones. Choose framed print, unframed poster, or instant HD digital."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
      />
      <FaqSchema
        items={[
          {
            question: "What is a night sky map gift?",
            answer:
              "A night sky map gift is a custom star map showing the exact positions of stars and constellations on a specific date and location — such as an anniversary, wedding, or birthday. It is printed or delivered digitally and personalized with names, a date, and a message.",
          },
          {
            question: "How fast do I receive a night sky map gift?",
            answer:
              "The HD digital download is available instantly after payment — ideal for last-minute gifting. Framed and unframed print routes show exact shipping timelines before you pay. All routes start with a free preview.",
          },
          {
            question: "What makes this a personalized gift?",
            answer:
              "Every map is generated from the exact date, time, and location you provide, using real astronomical data. The star positions are accurate to that specific moment — not a generic illustration. You also add custom text like names, a date, and a short message.",
          },
          {
            question: "Is a night sky map a good anniversary gift?",
            answer:
              "Yes — an anniversary star map captures the exact sky from your shared date and place. Enter your anniversary date and the location where you were together to generate that night. The framed print route arrives ready to hang.",
          },
          {
            question: "Can I get a night sky map gift same-day?",
            answer:
              "Yes. The HD digital download is delivered instantly after payment and can be printed at home or at a local print shop on the same day.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
