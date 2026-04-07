import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import QuickStartStepsSection from "@/components/QuickStartStepsSection";
import StickyCtaBar from "@/components/StickyCtaBar";
import TestimonialHighlights from "@/components/TestimonialHighlights";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { testimonialsByPage } from "@/data/testimonials";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift", label: "Star map gift" },
];

export const metadata: Metadata = {
  title: "Star Map Gift | StarMapCo",
  description:
    "Give the exact night sky from the moment that changed everything. Preview it free, then choose HD delivery or a printed gift.",
  alternates: { canonical: `${siteUrl}/star-map-gift` },
  openGraph: {
    title: "Star Map Gift | StarMapCo",
    description:
      "Give the exact night sky from the moment that changed everything. Preview it free, then choose HD delivery or a printed gift.",
    url: `${siteUrl}/star-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Give the exact night sky from the moment that changed everything. Preview it free first, then choose framed print, unframed print, or HD digital delivery.",
    images: [ogImage],
  },
};

export default function StarMapGiftPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Give the exact night sky from the moment that changed everything. Preview it free, then choose HD delivery or a printed gift.
        </p>
        <div className="hidden flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90 sm:flex">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="star-map-gift"
        title="See the gift preview"
        description="Enter the date and place to open the gift preview. Choose the final delivery route after the design feels right."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "The strongest ready-to-open gift option.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "For buyers who want the physical print at a lower total.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the design feels right.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-star-map-gift"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-star-map-gift-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <FramedProofSection sourcePrefix="gift-proof" />
      <PurchaseTrustPanel
        tone="dark"
        heading="Confidence before checkout"
        intro="Build and share your preview for free. Pay only when the wording, frame choice, and delivery route feel right."
        leftTitle="What happens after payment"
        leftPoints={[
          "Secure Stripe checkout",
          "Immediate HD unlock with no watermark",
          "One-time checkout supports framed print, unframed print, or HD digital delivery",
        ]}
        rightTitle="Support and policy"
        rightPoints={[
          "Clear returns and refund policy",
          shippingDisclosure,
          "Manual review stays in place before physical production begins",
          "Direct support at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a star map gift feels different</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Instead of a generic present, a custom star map ties your gift to a moment that can never be repeated. The stars
          were arranged that way only once.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate night sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>Choose the same approved design for framed print, unframed print, or HD digital delivery</li>
        </ul>
      </section>

      <QuickStartStepsSection
        heading="How the gift flow works"
        intro="The point is to remove early decision overload: confirm the moment first, then choose the delivery route that fits the gift."
        steps={[
          "Enter the date and location that matter most.",
          "Preview the map live and personalize the wording.",
          "Take the framed route, the unframed route, or HD digital delivery after the design is approved.",
        ]}
        note="Framed is still the strongest gift presentation. Unframed lowers the physical total. HD is the fastest path when timing matters more than shipping."
      />

      <DeliveryFormatModule
        heading="Choose the gift format after preview"
        intro="Most gift buyers decide between the ready-to-display framed route and the lower-total unframed route. HD digital stays available when you need same-day delivery or local printing."
        sourcePrefix="gift-format"
      />
      <WhatYouReceiveModule
        heading="What your gift purchase includes"
        intro="Gift buyers usually want clarity on deliverables and timing. This is the exact package you unlock."
      />
      <TestimonialHighlights
        heading="Verified gift-buyer feedback"
        intro="Real comments from gift buyers are shown here as they are collected."
        testimonials={testimonialsByPage.gift}
      />
      <PhysicalProductGallerySection
        heading="See the physical gift before you buy"
        intro="These framed and unframed mockups come from current StarMapCo artwork and current proof renders, so the physical finish is clear before checkout."
        sourcePrefix="gift-physical-proof"
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Is a star map a good couples gift?</h3>
            <p>
              Yes. A custom star map gift is one of the most meaningful couples gifts because it captures the exact sky from
              a shared moment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I add names and a date?</h3>
            <p>
              You can personalize the star map with names, a title, a date line, and a dedication before approving the
              same design for framed print, unframed print, or HD digital delivery.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I create it now and buy later?</h3>
            <p>
              Yes. You can design and preview first, then come back when you are ready to take the framed route, the
              unframed route, or HD digital delivery.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What if I need a quick gift turnaround?</h3>
            <p>
              For same-day gifting, HD digital delivery is the fastest route. If you want a shipped keepsake, start with
              the framed preview and check shipping timing before payment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I send a physical print instead of digital only?</h3>
            <p>
              Yes. You can choose framed print or unframed print in checkout after previewing your design. {shippingDisclosure}
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Is a star map a good couples gift?",
            answer:
              "Yes. A custom star map gift is one of the most meaningful couples gifts because it captures the exact sky from a shared moment.",
          },
          {
            question: "Can I add names and a date?",
            answer:
              "You can personalize the star map with names, a title, a date line, and a dedication before approving the same design for framed print, unframed print, or HD digital delivery.",
          },
          {
            question: "Can I create it now and buy later?",
            answer:
              "Yes. You can design and preview first, then come back when you are ready to take the framed route, the unframed route, or HD digital delivery.",
          },
          {
            question: "What if I need a quick gift turnaround?",
            answer:
              "For same-day gifting, HD digital delivery is the fastest route. If you want a shipped keepsake, start with the framed preview and check shipping timing before payment.",
          },
          {
            question: "Can I send a physical print instead of digital only?",
            answer: `Yes. You can choose framed print or unframed print in checkout after previewing your design. ${shippingDisclosure}`,
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
