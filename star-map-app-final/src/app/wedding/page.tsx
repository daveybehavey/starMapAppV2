import Image from "next/image";
import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import { BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import ProductSchema from "@/components/ProductSchema";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { featuredRenderExamples } from "@/lib/galleryExamples";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import WeddingDesignExampleSection from "@/components/WeddingDesignExampleSection";
import WeddingGiftJourneySection from "@/components/WeddingGiftJourneySection";
import WeddingLandingHero from "@/components/WeddingLandingHero";
import { testimonialsByPage } from "@/data/testimonials";
import {
  buildPrintEditorCheckoutHref,
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getFramedHdGiftCtaLine } from "@/lib/moneyPageGiftCheckout";
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/wedding", label: "Wedding" },
];

export const metadata: Metadata = {
  title: "Personalized Wedding Star Map Gift | StarMapCo",
  description:
    "Create a wedding star map from your ceremony date and location. Free preview, then the framed + HD gift bundle with free shipping on $100+ orders.",
  alternates: { canonical: `${siteUrl}/wedding` },
  openGraph: {
    title: "Personalized Wedding Star Map Gift | StarMapCo",
    description:
      "Capture the exact night sky from your wedding day and place. Preview free, then order the framed + HD gift bundle with free shipping on qualifying orders.",
    url: `${siteUrl}/wedding`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const weddingFaqItems = [
  {
    question: "Can I use the ceremony location?",
    answer:
      "Yes. Use the venue city or exact coordinates to generate a wedding star map that matches your ceremony.",
  },
  {
    question: "Is this a good wedding or couples gift?",
    answer:
      "Yes. Couples, parents, and wedding parties use it for the wedding night, first anniversary, or vow renewal — it captures a shared moment under the stars.",
  },
  {
    question: "Do I need the exact wedding time?",
    answer:
      "Exact time improves precision for Moon and planet placement, but date plus location still produces a beautiful, meaningful map.",
  },
  {
    question: "How long does it take to make?",
    answer:
      "Most couples finish a preview in under five minutes. HD unlocks right after checkout; physical prints ship after your design is approved.",
  },
  {
    question: "Can I print it locally?",
    answer:
      "Yes. HD digital is built for local poster printing and DIY framing. We include sizing guidance for common frame shops.",
  },
  {
    question: "Can I order a framed wedding print directly?",
    answer:
      "Yes. After preview, checkout includes framed print, unframed print, and HD digital from the same approved design.",
  },
] as const;

export default function WeddingPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
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
      url: `${siteUrl}/editor?mode=quick&source=wedding-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=wedding-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=wedding-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];
  const featuredTestimonial = testimonialsByPage.wedding[0];
  const framedHdHref = buildPrintEditorCheckoutHref({
    source: "wedding-hero-framed-hd",
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
  const framedFaqAnswer = `${weddingFaqItems[5].answer} ${shippingDisclosure}`;
  const deliveryIntro = `Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus an instant digital file. Unframed is the lower-cost option if you already have a frame. HD-only is fastest when you need same-day delivery.`;

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:pt-12">
      <LandingViewTracker source="wedding" />

      <WeddingLandingHero
        breadcrumbs={breadcrumbs}
        primaryHref={framedHdHref}
        bundlePriceLine={bundlePriceLine}
        featuredTestimonial={featuredTestimonial}
        framedCardHref={buildPrintEditorCheckoutHref({
          source: "wedding-hero-framed-card",
          variant: "poster_framed",
          includeCardAddOn: true,
        })}
      />

      <GiftFormatLadder
        sourcePrefix="wedding-ladder"
        heading="Choose your wedding gift format"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}). Unframed lowers the total; framed + card adds a small keepsake.`}
        className="mt-10"
      />

      <WeddingDesignExampleSection previewHref={framedHdHref} />

      <PreviewStartForm
        source="wedding"
        title="Start your wedding preview"
        description="Enter the wedding date and ceremony location. We’ll open the editor on the framed + HD gift path — the recommended premium gift presentation."
        showMobileDateHelper={false}
        footerContent={
          <p className="text-center text-sm text-neutral-700">
            <Link
              href={buildPrintEditorCheckoutHref({
                source: "wedding-form-unframed",
                variant: "poster_unframed",
              })}
              className="text-midnight font-semibold underline decoration-amber-400/80 underline-offset-2 hover:text-amber-900"
            >
              Unframed print instead
            </Link>
            <span className="mx-2 text-neutral-400" aria-hidden="true">
              ·
            </span>
            <Link
              href="/editor?mode=quick&source=wedding-form-preview"
              className="text-midnight font-semibold underline decoration-amber-400/80 underline-offset-2 hover:text-amber-900"
            >
              Free preview first
            </Link>
          </p>
        }
        intentOptions={[
          {
            label: "Preview framed + HD gift",
            sourceSuffix: "framed-hd",
            checkout: "print",
            printVariant: "poster_framed",
            includeDigitalAddOn: true,
            plan: "print_framed_hd",
            tone: "recommended",
            detail: `${bundlePriceLine} — best wedding gift.`,
          },
          {
            label: "Preview framed + keepsake card",
            sourceSuffix: "framed-card",
            checkout: "print",
            printVariant: "poster_framed",
            includeCardAddOn: true,
            plan: "print_framed_card",
            tone: "default",
            detail: "Wall gift plus a 4×6 card from the same map.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-wedding-framed-hd"
        title="Ready to see your ceremony sky?"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-wedding-preview"
        secondaryPlan="preview"
      />

      <WeddingGiftJourneySection />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Why couples choose this gift</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars above you when you said “I do” cannot be recreated. Our maps plot that exact sky with
          astronomically accurate data — constellations, planets, and Moon phase included. It is a wall-ready
          way to relive the night you became a constellation of two.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Ceremony date, time, and location — venue city or coordinates",
            "Print-ready exports up to 6000×6000, no watermark after purchase",
            "Celebration-ready presets with gold accents and custom dedication lines",
            "One approved design → framed, unframed, or HD without rebuilding",
          ].map((item) => (
            <li
              key={item}
              className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-neutral-800"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <AccuracyAuthorityCard source="wedding-accuracy-card" />

      <DeliveryFormatModule
        heading="Pricing & delivery — pick one path after preview"
        intro={deliveryIntro}
        sourcePrefix="wedding-format"
      />
      <FramedProofSection sourcePrefix="wedding-proof" />
      <PhysicalProductGallerySection
        heading="What the wedding gift looks like in real rooms"
        intro="Room mockups from current StarMapCo artwork — framed, unframed, and in-home styling for ceremony-night keepsakes."
        sourcePrefix="wedding-physical-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-midnight text-lg font-semibold">Wedding map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Start with a current-engine look you like, then personalize wording, date line, and frame feel for
            your event.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {featuredRenderExamples.map((item) => (
            <figure
              key={item.src}
              className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 shadow-black/5 ring-black/[0.06]"
            >
              <div className="relative aspect-square bg-gradient-to-b from-[#0c1428] to-[#050915]">
                <Image
                  src={item.src}
                  alt={item.shortLabel}
                  width={900}
                  height={900}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-full object-contain p-3 sm:p-4"
                />
              </div>
              <figcaption className="border-t border-black/[0.04] bg-amber-50/30 px-3 py-3">
                <p className="text-midnight text-xs font-semibold">{item.shortLabel}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{item.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Framed is the premium gift route once the layout and wording feel final, while unframed and HD stay available from the same design."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "High-resolution file up to 6000x6000",
          "Designed for frame-ready printing",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Shipping, returns, and refund details linked below",
          "Help available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your wedding order includes"
        intro="This is the exact handoff from your final preview to a frame-ready HD file."
      />
      <section className="content-visibility-auto mt-6 rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-100/90 via-amber-50 to-white p-6 text-center shadow-lg shadow-amber-200/40">
        <h2 className="text-midnight text-lg font-semibold">Ready to see your wedding sky?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-800 sm:text-base">
          Build the map in minutes, share the preview with your partner or wedding party, then checkout when
          it feels right.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "wedding-bottom-framed-hd",
              variant: "poster_framed",
              includeDigitalAddOn: true,
            })}
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg transition hover:-translate-y-[1px] focus:ring-2 focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=wedding-bottom-preview"
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full border border-amber-300/80 bg-white px-5 py-3 text-sm font-semibold transition hover:bg-amber-50 focus:ring-2 focus:outline-none"
          >
            Free preview
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-6 shadow-lg shadow-amber-100/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.22em] text-amber-800 uppercase">
              Wedding planning guide
            </p>
            <h2 className="text-midnight text-lg font-semibold">
              Ceremony date, venue, and print options explained
            </h2>
            <p className="max-w-xl text-sm text-neutral-700">
              Step-by-step help for picking the right moment, heart layouts, and framed vs unframed — written
              for couples and wedding-party gift buyers.
            </p>
          </div>
          <Link
            href="/blog/custom-star-maps-for-weddings?source=wedding-page-guide"
            className="text-midnight focus:ring-gold inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white px-5 py-3 text-sm font-semibold shadow-sm transition hover:bg-amber-50 focus:ring-2 focus:outline-none"
          >
            Read the wedding guide
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related star map gifts</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Explore anniversary, birthday, and other occasion maps — or use the generator to preview any date
          and place.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star map
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star map
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
        </div>
      </section>

      <section
        className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10"
        aria-labelledby="wedding-faq"
      >
        <h2 id="wedding-faq" className="text-midnight text-lg font-semibold">
          Wedding star map FAQ
        </h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {weddingFaqItems.map((item, index) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{index === 5 ? framedFaqAnswer : item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="Wedding Star Map Gift"
        description="Personalized wedding star map showing the exact night sky from your ceremony date and location. Order a framed print, unframed poster, or instant HD digital download."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
      />
      <FaqSchema
        items={weddingFaqItems.map((item, index) =>
          index === 5 ? { question: item.question, answer: framedFaqAnswer } : item
        )}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
