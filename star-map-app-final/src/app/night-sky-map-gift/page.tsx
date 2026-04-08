import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PrimaryIntentLinksSection from "@/components/PrimaryIntentLinksSection";
import ProductSchema from "@/components/ProductSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
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
  { href: "/night-sky-map-gift", label: "Night sky map gift" },
];

export const metadata: Metadata = {
  title: "Night Sky Map Gift | StarMapCo",
  description:
    "Preview a night sky map gift from any meaningful date and place, then continue to the strongest gift route or choose HD and print once the design feels right.",
  alternates: { canonical: `${siteUrl}/night-sky-map-gift` },
  openGraph: {
    title: "Night Sky Map Gift | StarMapCo",
    description:
      "Preview a night sky map gift from any meaningful date and place, then continue to the strongest gift route or choose HD and print once the design feels right.",
    url: `${siteUrl}/night-sky-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function NightSkyMapGiftPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Night Sky Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Preview a night sky map gift from any meaningful date and place, then move into the clearest gift route once the design feels right.
        </p>
        <div className="hidden flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90 sm:flex">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="night-sky-map-gift"
        title="Start the night-sky gift preview"
        description="Enter the date and place to open the live preview. Choose the final delivery route after the design feels right."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best when the final gift should arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you want the physical print with a lower total.",
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
        source="sticky-night-sky-map-gift"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-night-sky-map-gift-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <PrimaryIntentLinksSection
        heading="Primary gift pages"
        intro="Use this page for night-sky-gift phrasing. If you want the clearest main gift page after previewing, start with one of these pages."
        links={[
          { href: "/star-map-gift", label: "Star map gift", recommended: true },
          { href: "/anniversary", label: "Anniversary star map" },
          { href: "/wedding", label: "Wedding star map" },
        ]}
      />
      <FramedProofSection sourcePrefix="night-sky-gift-proof" />
      <PurchaseTrustPanel
        tone="dark"
        heading="Before you buy"
        intro="Preview for free first. Gift buyers usually take the framed route once the wording and layout feel right, while unframed and HD stay available from the same approved design."
        leftTitle="Checkout and delivery"
        leftPoints={[
          "Secure Stripe checkout",
          "One-time checkout for framed print, unframed print, or HD digital delivery",
          "Instant HD file unlock after successful payment",
        ]}
        rightTitle="Print quality and support"
        rightPoints={[
          "Astronomy-based sky generation from your exact date and place",
          shippingDisclosure,
          "Physical orders get a manual quality check before production starts",
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why night sky maps make unforgettable gifts</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars on a specific night never repeat in the same way. A custom night sky map turns that moment into a gift
          that feels thoughtful and unique.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>One approved design can stay digital, go unframed, or arrive framed</li>
        </ul>
      </section>

      <QuickStartStepsSection
        heading="How the night-sky gift flow works"
        intro="The cleanest path is to confirm the moment first, then choose how polished or fast the final delivery should be."
        steps={[
          "Enter the date and place that matter, then open the live preview.",
          "Adjust the wording, names, and styling until the design feels final.",
          "Choose framed print, unframed print, or HD digital delivery from the same approved design.",
        ]}
        note="Framed stays the premium gift route. Unframed keeps the physical total lower. HD is the fastest route when timing matters more than shipping."
      />
      <AccuracyAuthorityCard source="night-sky-gift-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose the format after you preview the night sky"
        intro="Night sky gift buyers usually decide between the presentation-ready framed route and the lower-total unframed route. HD digital stays available for same-day delivery."
        sourcePrefix="night-sky-gift-format"
      />
      <WhatYouReceiveModule
        heading="What your night-sky gift order includes"
        intro="This is the exact handoff from preview to the finished keepsake."
      />
      <PhysicalProductGallerySection
        heading="Compare the framed and unframed physical finish"
        intro="Use these real proof assets to judge the premium framed route against the lower-cost unframed poster before you leave the page."
        sourcePrefix="night-sky-gift-physical-proof"
      />
      <TestimonialHighlights
        heading="Verified night-sky gift feedback"
        intro="Real night-sky gift buyer comments are shown here as they are collected."
        testimonials={testimonialsByPage.nightSkyGift}
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Night sky map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">How fast do I receive a night sky map gift?</h3>
            <p>
              You can preview your night sky map instantly. HD digital delivery is fastest for same-day gifting, while framed
              and unframed print routes show shipping before payment. {shippingDisclosure}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What makes this a personalized gift?</h3>
            <p>
              Every map is generated from the exact date and location you choose, plus custom text like names and a message.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "How fast do I receive a night sky map gift?",
            answer:
              "You can preview your night sky map instantly. HD digital delivery is fastest for same-day gifting, while framed and unframed print routes show shipping before payment.",
          },
          {
            question: "What makes this a personalized gift?",
            answer:
              "Every map is generated from the exact date and location you choose, plus custom text like names and a message.",
          },
        ]}
      />
      <ProductSchema
        name="Night Sky Map Gift"
        description="Preview a personalized night sky map gift from any meaningful date and place, then choose HD digital delivery or a framed or unframed print once the design feels right."
        path="/night-sky-map-gift"
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
