import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import TestimonialHighlights from "@/components/TestimonialHighlights";
import { testimonialsByPage } from "@/data/testimonials";
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
    "Give a night sky map gift for anniversaries, birthdays, weddings, or memorials. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
  alternates: { canonical: `${siteUrl}/night-sky-map-gift` },
  openGraph: {
    title: "Night Sky Map Gift | StarMapCo",
    description:
      "Give a night sky map gift for anniversaries, birthdays, weddings, or memorials. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
    url: `${siteUrl}/night-sky-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function NightSkyMapGiftPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Night Sky Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          A night sky map gift captures the exact stars from a meaningful date and place. Start with a free preview, then
          choose the framed gift route, the lower-total unframed route, or HD digital delivery.
        </p>
      </header>

      <PreviewStartForm
        source="night-sky-map-gift"
        title="Start the night-sky gift preview"
        description="Enter the date and place, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed gift",
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
        secondaryButtonLabel="Preview framed gift"
        secondaryHref="/editor?mode=quick&source=sticky-night-sky-map-gift-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
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

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a gift in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Choose the date and location that matter most</li>
          <li>Pick a style and add names or a dedication</li>
          <li>Preview the map instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=night-sky-map-gift-cta-framed&checkout=print&print_variant=poster_framed"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the format after you preview the night sky"
        intro="Night sky gift buyers usually decide between the presentation-ready framed route and the lower-total unframed route. HD digital stays available for same-day delivery."
        sourcePrefix="night-sky-gift-format"
      />

      <FramedProofSection
        heading="Framed proof matters for gift buyers"
        intro="The preview proves the design. This framed photo proves the physical result. Use both before you decide how the gift should be delivered."
        sourcePrefix="night-sky-gift-proof"
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

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">More gift inspiration</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Looking for more ideas? Explore star map gift guides and examples.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Star map gift
          </Link>
          <Link href="/star-map-gift-ideas" className="text-amber-700 underline hover:text-amber-800">
            Star map gift ideas
          </Link>
          <Link href="/star-map-gallery" className="text-amber-700 underline hover:text-amber-800">
            Star map gallery
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Night sky map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">How fast do I receive a night sky map gift?</h3>
            <p>
              You can preview your night sky map instantly. HD digital delivery is fastest for same-day gifting, while framed
              and unframed print routes show shipping before payment.
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
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
