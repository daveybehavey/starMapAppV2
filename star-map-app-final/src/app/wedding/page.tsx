import Image from "next/image";
import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import TestimonialHighlights from "@/components/TestimonialHighlights";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { testimonialsByPage } from "@/data/testimonials";
import { featuredRenderExamples, galleryExamples } from "@/lib/galleryExamples";
import { formatPrintPriceWithShipping, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingInfo, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const heroExample = galleryExamples.find((item) => item.id === "wedding-aurora") ?? galleryExamples[0];
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/wedding", label: "Wedding" },
];

export const metadata: Metadata = {
  title: "Personalized Wedding Star Map Gift | StarMapCo",
  description:
    "Create a wedding star map from your ceremony date and location. Free preview, then framed print, unframed print, or HD digital — a meaningful couples gift.",
  alternates: { canonical: `${siteUrl}/wedding` },
  openGraph: {
    title: "Personalized Wedding Star Map Gift | StarMapCo",
    description:
      "Capture the exact night sky from your wedding day and place. Free preview, then framed print, unframed print, or HD digital delivery.",
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
  const printTiers = getPrintPricingTiers();
  const pricing = getPricingInfo();
  const digitalPrice = formatPrice(pricing.activeAmountCents, pricing.currency);
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const framedFaqAnswer = `${weddingFaqItems[5].answer} ${shippingDisclosure}`;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:pt-12">
      <LandingViewTracker source="wedding" />

      <header className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10">
        <div className="space-y-4 text-center lg:text-left">
          <Breadcrumbs items={breadcrumbs} className="flex justify-center lg:justify-start" />
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Wedding gift · StarMapCo</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            The night sky from your wedding — framed for the wall
          </h1>
          <p className="text-sm leading-relaxed text-white/90 sm:text-base">
            Enter your ceremony date and place to preview the exact sky overhead. Most couples choose a gift-ready framed
            print; unframed and instant HD stay on the same design.
          </p>
          <ul className="mx-auto flex max-w-md flex-col gap-2 text-left text-sm text-amber-50/95 sm:text-base lg:mx-0">
            <li className="flex gap-2">
              <span className="mt-0.5 text-amber-300" aria-hidden="true">
                ✓
              </span>
              <span>Free live preview — no account required</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-amber-300" aria-hidden="true">
                ✓
              </span>
              <span>Astronomically accurate for your date, time, and location</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-amber-300" aria-hidden="true">
                ✓
              </span>
              <span>
                HD from {digitalPrice} · unframed from {unframedPrice} · framed from {framedPrice}
              </span>
            </li>
          </ul>
          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <Link
              href="/editor?mode=quick&source=wedding-hero-framed&checkout=print&print_variant=poster_framed"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-transparent"
            >
              Preview framed wedding print
            </Link>
            <Link
              href="/editor?mode=quick&source=wedding-hero-preview"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              Start free preview
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90 lg:justify-start">
            <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
            <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital</span>
          </div>
        </div>

        <figure className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl shadow-black/30 lg:max-w-none">
          <div className="relative aspect-square">
            <Image
              src={heroExample.src}
              alt={heroExample.alt}
              width={900}
              height={900}
              priority
              sizes="(max-width: 1024px) 100vw, 420px"
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="border-t border-white/10 bg-midnight/80 px-4 py-3 text-center text-xs text-amber-100/90 sm:text-sm">
            {heroExample.caption} · {heroExample.title}
          </figcaption>
        </figure>
      </header>

      <PreviewStartForm
        source="wedding"
        title="Start your wedding preview"
        description="Enter the wedding date and place, then open the editor on the framed path, unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best when the keepsake should arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best for couples who already know their frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until you approve the design.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-wedding"
        title="Still deciding? Preview the wedding sky free"
        description="Takes minutes — same design for framed, unframed, or HD."
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-wedding-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

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
        intro={`Most wedding buyers choose framed (${framedPrice}) for a ready-to-hang gift. Unframed (${unframedPrice}) lowers the total if you already have a frame. HD (${digitalPrice}) is fastest when you need same-day delivery.`}
        sourcePrefix="wedding-format"
      />
      <FramedProofSection sourcePrefix="wedding-proof" />
      <AccuracyAuthorityCard source="wedding-accuracy-card" />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-midnight">Wedding map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Start with a current-engine look you like, then personalize wording, date line, and frame feel for your event.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {featuredRenderExamples.map((item) => (
            <div key={item.src} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              <div className="relative aspect-square proof-wall-panel">
                <div className="proof-wall-stage proof-wall-stage--gallery h-full w-full">
                  <Image
                    src={item.src}
                    alt={item.shortLabel}
                    width={900}
                    height={900}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="h-full w-full object-contain px-4 py-5 proof-wall-image"
                  />
                </div>
              </div>
              <div className="border-t border-black/5 px-3 py-2">
                <p className="text-xs font-semibold text-midnight">{item.shortLabel}</p>
                <p className="text-[11px] text-neutral-600">{item.caption}</p>
              </div>
            </div>
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
          "Physical orders stay in manual review before production starts",
          "Help available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your wedding order includes"
        intro="This is the exact handoff from your final preview to a frame-ready HD file."
      />
      <TestimonialHighlights
        heading="Sample couple stories"
        intro="Illustrative examples until we publish permissioned customer quotes."
        testimonials={testimonialsByPage.wedding}
      />

      <section className="content-visibility-auto mt-6 rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-100/90 via-amber-50 to-white p-6 text-center shadow-lg shadow-amber-200/40">
        <h2 className="text-lg font-semibold text-midnight">Ready to see your wedding sky?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-800 sm:text-base">
          Build the map in minutes, share the preview with your partner or wedding party, then checkout when it feels right.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/editor?mode=quick&source=wedding-bottom-framed&checkout=print&print_variant=poster_framed"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-gold"
          >
            Preview framed print
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
