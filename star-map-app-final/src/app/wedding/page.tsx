import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PreviewStartForm from "@/components/PreviewStartForm";
import QuickStartStepsSection from "@/components/QuickStartStepsSection";
import StickyCtaBar from "@/components/StickyCtaBar";
import TestimonialHighlights from "@/components/TestimonialHighlights";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { testimonialsByPage } from "@/data/testimonials";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/wedding", label: "Wedding" },
];

export const metadata: Metadata = {
  title: "Personalized Wedding Star Map | StarMapCo",
  description:
    "Preview the exact night sky from your wedding day and place, then choose HD delivery or a printed keepsake.",
  alternates: { canonical: `${siteUrl}/wedding` },
  openGraph: {
    title: "Personalized Wedding Star Map | StarMapCo",
    description: "Preview the exact night sky from your wedding day and place, then choose HD delivery or a printed keepsake.",
    url: `${siteUrl}/wedding`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function WeddingPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Wedding Star Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Preview the exact night sky from your wedding day and place, then choose HD delivery or a printed keepsake.
        </p>
        <div className="hidden flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90 sm:flex">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="wedding"
        title="Start your wedding preview"
        description="Enter the wedding date and place to open the live preview. Choose the final delivery route after the design feels right."
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
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-wedding-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <FramedProofSection sourcePrefix="wedding-proof" />
      <PurchaseTrustPanel
        tone="dark"
        heading="Before you buy"
        intro="Preview for free first. Most wedding buyers take the framed route once the layout and wording feel final, while unframed and HD stay available from the same design."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "One-time checkout supports framed print, unframed print, or HD digital delivery",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "High-resolution file up to 6000x6000",
          "Designed for frame-ready printing",
          shippingDisclosure,
          "Physical orders get a manual quality check before production starts",
          "Help available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why couples love this gift</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars above you on the night you said “I do” are unrepeatable. Our maps use astronomically accurate data to
          plot that exact sky—constellations, planets, and Moon phase can all be included. It’s a tangible way to remember
          the moment you created a new constellation of your own.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the date, time, and location of your wedding</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Elegant presets with gold accents that feel celebration-ready</li>
          <li>Optional dedication lines to add your vows, venue, or names</li>
        </ul>
      </section>

      <QuickStartStepsSection
        heading="How the wedding flow works"
        intro="Wedding buyers usually need the same thing: confirm the date and venue first, then decide how polished the final delivery should be."
        steps={[
          "Enter the wedding location and date, then open the live preview.",
          "Adjust names, vows, and styling until the layout feels final.",
          "Choose framed print, unframed print, or HD digital delivery from the same approved design.",
        ]}
        note="Framed is still the premium keepsake route. Unframed works when you already have a frame plan. HD stays fastest for same-day delivery or local printing."
      />
      <AccuracyAuthorityCard source="wedding-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose how you want to keep or gift it"
        intro="Wedding buyers usually decide between the ready-to-display framed option and the lower-total unframed route. HD digital stays available when you need instant delivery or local printing."
        sourcePrefix="wedding-format"
      />
      <WhatYouReceiveModule
        heading="What your wedding order includes"
        intro="This is the exact handoff from your final preview to a frame-ready HD file."
      />
      <TestimonialHighlights
        heading="Verified wedding buyer feedback"
        intro="Real wedding-buyer comments are shown here as they are collected."
        testimonials={testimonialsByPage.wedding}
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Wedding star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Can I use the ceremony location?</h3>
            <p>
              Yes. Use the venue city or exact coordinates to generate a wedding star map that matches your ceremony.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is this a good couples gift?</h3>
            <p>
              Definitely. A wedding star map is one of the most meaningful couples gifts because it captures a shared
              moment under the stars.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Do I need the exact wedding time?</h3>
            <p>
              Exact time helps if you want maximum precision, but date + location still gives a beautiful and meaningful
              result.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I print it locally?</h3>
            <p>
              Yes. Most customers print locally or online and frame it themselves. We include guidance for common print
              sizes.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I order a framed wedding print directly?</h3>
            <p>
              Yes. After preview, checkout includes framed print, unframed print, and HD digital delivery. {shippingDisclosure}
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Can I use the ceremony location?",
            answer: "Yes. Use the venue city or exact coordinates to generate a wedding star map that matches your ceremony.",
          },
          {
            question: "Is this a good couples gift?",
            answer:
              "Definitely. A wedding star map is one of the most meaningful couples gifts because it captures a shared moment under the stars.",
          },
          {
            question: "Do I need the exact wedding time?",
            answer:
              "Exact time helps if you want maximum precision, but date + location still gives a beautiful and meaningful result.",
          },
          {
            question: "Can I print it locally?",
            answer:
              "Yes. Most customers print locally or online and frame it themselves. We include guidance for common print sizes.",
          },
          {
            question: "Can I order a framed wedding print directly?",
            answer: `Yes. After preview, checkout includes framed print, unframed print, and HD digital delivery. ${shippingDisclosure}`,
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
