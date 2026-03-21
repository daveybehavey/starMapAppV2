import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
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
  { href: "/anniversary", label: "Anniversary" },
];

export const metadata: Metadata = {
  title: "Personalized Anniversary Star Map | StarMapCo",
  description:
    "Celebrate your years together with a personalized anniversary star map. Start with a free preview, then choose framed print, unframed print, or HD digital delivery from the same design.",
  alternates: { canonical: `${siteUrl}/anniversary` },
  openGraph: {
    title: "Personalized Anniversary Star Map | StarMapCo",
    description:
      "Commemorate your anniversary with the exact night sky from your milestone. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
    url: `${siteUrl}/anniversary`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function AnniversaryPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Anniversary Star Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Mark your milestone with an anniversary star map gift showing the night sky from the date and place that shaped
          your story. A keepsake that grows more meaningful each year.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
      </header>

      <PreviewStartForm
        source="anniversary"
        title="Start your anniversary preview"
        description="Enter the date and place, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best if you want the finished keepsake to arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Best if you already know your frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the anniversary design feels final.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-anniversary"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-anniversary-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why this gift matters</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Anniversaries celebrate time—days that turned into years. Our maps use astronomically accurate data to plot the exact
          sky from your milestone date and location. Constellations, planets, and Moon phase can all be included, so you can see
          the sky as it truly was when your journey together reached a new chapter.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the date, time, and location of your anniversary</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Elegant styles that feel timeless—perfect for a living room or bedroom wall</li>
          <li>Optional dedication lines for names, vows, or the milestone year</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the anniversary location (city or venue)</li>
          <li>Select the anniversary date (add time if you want to be exact)</li>
          <li>Choose a style and add your dedication line</li>
          <li>Reveal the sky, then choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          Share a preview for free. Once the wording feels right, take the framed route, the unframed route, or instant HD delivery from the same approved design.
        </p>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=anniversary-cta-framed&checkout=print&print_variant=poster_framed"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="anniversary-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose how you want to keep the anniversary map"
        intro="Most anniversary buyers decide between the finished framed route and the lower-total unframed route. HD digital stays available when you want instant delivery or local printing."
        sourcePrefix="anniversary-format"
      />
      <FramedProofSection
        heading="See how the anniversary gift looks framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="anniversary-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          The preview and HD export use the same rendering engine—what you see is what you download. Toggle constellations,
          glow, labels, and choose fonts to match your style. The same approved design can stay digital, go unframed, or arrive framed without rebuilding the map.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only once the wording, date, and layout feel right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths are available after preview",
          shippingDisclosure,
          "Physical orders stay in manual review before production starts",
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your anniversary order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Anniversary gift confidence"
        intro="Most couples decide faster once the wording, frame plan, and whether they want the finished framed route are already clear."
      />
      <TestimonialHighlights
        heading="Verified anniversary buyer feedback"
        intro="Real anniversary-buyer comments are shown here as they are collected."
        testimonials={testimonialsByPage.anniversary}
      />

      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Anniversary star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What date should I use for an anniversary star map?</h3>
            <p>
              Most couples use their wedding date or the night they first met. Any meaningful date works.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is this a good couples gift?</h3>
            <p>
              Yes. A personalized anniversary star map is a thoughtful couples gift because it captures a shared moment.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What date should I use for an anniversary star map?",
            answer: "Most couples use their wedding date or the night they first met. Any meaningful date works.",
          },
          {
            question: "Is this a good couples gift?",
            answer:
              "Yes. A personalized anniversary star map is a thoughtful couples gift because it captures a shared moment.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
