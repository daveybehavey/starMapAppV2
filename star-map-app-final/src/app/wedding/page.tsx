import Image from "next/image";
import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import { BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { featuredRenderExamples } from "@/lib/galleryExamples";
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
    "Create a wedding star map from your ceremony date and location. Free preview, then our popular framed + HD gift bundle with free shipping on $100+ orders.",
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
  const featuredTestimonial = testimonialsByPage.wedding[0];
  const framedHdHref = buildPrintEditorCheckoutHref({
    source: "wedding-hero-framed-hd",
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
  const framedFaqAnswer = `${weddingFaqItems[5].answer} ${shippingDisclosure}`;
  const deliveryIntro = `Most wedding buyers choose framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus an instant digital file. Unframed lowers the total if you already have a frame. HD-only is fastest when you need same-day delivery.`;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:pt-12">
      <LandingViewTracker source="wedding" />

      <WeddingLandingHero
        breadcrumbs={breadcrumbs}
        primaryHref={framedHdHref}
        bundlePriceLine={bundlePriceLine}
        featuredTestimonial={featuredTestimonial}
      />

      <WeddingDesignExampleSection previewHref={framedHdHref} />

      <PreviewStartForm
        source="wedding"
        title="Start your wedding preview"
        description="Enter the wedding date and ceremony location. We’ll open the editor on the framed + HD gift path — the option most couples choose."
        showMobileDateHelper={false}
        footerContent={
          <p className="text-center text-sm text-neutral-700">
            <Link
              href={buildPrintEditorCheckoutHref({
                source: "wedding-form-unframed",
                variant: "poster_unframed",
              })}
              className="font-semibold text-midnight underline decoration-amber-400/80 underline-offset-2 hover:text-amber-900"
            >
              Unframed print instead
            </Link>
            <span className="mx-2 text-neutral-400" aria-hidden="true">
              ·
            </span>
            <Link
              href="/editor?mode=quick&source=wedding-form-preview"
              className="font-semibold text-midnight underline decoration-amber-400/80 underline-offset-2 hover:text-amber-900"
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
        ]}
      />
      <StickyCtaBar
        source="sticky-wedding-framed-hd"
        title="Ready to see your ceremony sky?"
        description="Most gift-givers choose framed + HD — preview free, then checkout when it looks right."
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-wedding-preview"
        secondaryPlan="preview"
      />

      <WeddingGiftJourneySection />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why couples choose this gift</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars above you when you said “I do” cannot be recreated. Our maps plot that exact sky with astronomically
          accurate data — constellations, planets, and Moon phase included. It is a wall-ready way to relive the night you
          became a constellation of two.
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
          <h2 className="text-lg font-semibold text-midnight">Wedding map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Start with a current-engine look you like, then personalize wording, date line, and frame feel for your event.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {featuredRenderExamples.map((item) => (
            <figure
              key={item.src}
              className="overflow-hidden rounded-2xl bg-white shadow-md shadow-black/5 ring-1 ring-black/[0.06]"
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
                <p className="text-xs font-semibold text-midnight">{item.shortLabel}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{item.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Most wedding buyers take the framed route once the layout and wording feel final, while unframed and HD stay available from the same design."
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
        <h2 className="text-lg font-semibold text-midnight">Ready to see your wedding sky?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-800 sm:text-base">
          Build the map in minutes, share the preview with your partner or wedding party, then checkout when it feels right.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "wedding-bottom-framed-hd",
              variant: "poster_framed",
              includeDigitalAddOn: true,
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-gold"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=wedding-bottom-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-300/80 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            Free preview
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-6 shadow-lg shadow-amber-100/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Wedding planning guide</p>
            <h2 className="text-lg font-semibold text-midnight">Ceremony date, venue, and print options explained</h2>
            <p className="max-w-xl text-sm text-neutral-700">
              Step-by-step help for picking the right moment, heart layouts, and framed vs unframed — written for couples
              and wedding-party gift buyers.
            </p>
          </div>
          <Link
            href="/blog/custom-star-maps-for-weddings?source=wedding-page-guide"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white px-5 py-3 text-sm font-semibold text-midnight shadow-sm transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            Read the wedding guide
          </Link>
        </div>
      </section>

      <section
        className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10"
        aria-labelledby="wedding-faq"
      >
        <h2 id="wedding-faq" className="text-lg font-semibold text-midnight">
          Wedding star map FAQ
        </h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {weddingFaqItems.map((item, index) => (
            <div key={item.question}>
              <h3 className="font-semibold text-midnight">{item.question}</h3>
              <p>{index === 5 ? framedFaqAnswer : item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSchema
        items={weddingFaqItems.map((item, index) =>
          index === 5 ? { question: item.question, answer: framedFaqAnswer } : item,
        )}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
