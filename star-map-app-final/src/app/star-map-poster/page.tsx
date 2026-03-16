import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getBusinessProfile } from "@/lib/businessProfile";
import { getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-poster", label: "Star map poster" },
];

export const metadata: Metadata = {
  title: "Star Map Poster | StarMapCo",
  description:
    "Create a made-to-order custom star map poster from any date and location. Choose unframed or framed wall art checkout after preview.",
  alternates: { canonical: `${siteUrl}/star-map-poster` },
  openGraph: {
    title: "Star Map Poster | StarMapCo",
    description:
      "Create a made-to-order custom star map poster from any date and location. Choose unframed or framed wall art checkout after preview.",
    url: `${siteUrl}/star-map-poster`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapPosterPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const profile = getBusinessProfile();
  const printTiers = getPrintPricingTiers();
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "Custom Star Map Poster",
        description:
          "Made-to-order custom star map wall art created from your chosen date and location, available as an unframed poster or framed print after preview.",
        brand: { "@type": "Brand", name: "StarMapCo" },
        image: [`${siteUrl}/printproof/unframed-mockup.jpg`, `${siteUrl}/printproof/framed-mockup.jpg`],
        category: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
        offers: [
          {
            "@type": "Offer",
            name: "Custom Star Map Poster (Unframed)",
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/editor?mode=quick&source=poster-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            "@type": "Offer",
            name: "Custom Star Map Framed Print",
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/editor?mode=quick&source=poster-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Poster</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Create a custom star map poster from the exact night sky of a special moment. Preview the design first, then
          choose a made-to-order unframed poster or ready-to-hang framed print.
        </p>
      </header>

      <PreviewStartForm
        source="star-map-poster"
        title="Start your poster preview"
        description="Enter the date and location, then choose whether to open the editor with the framed path, the unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best for gifting or ready-to-hang wall art.",
          },
          {
            label: "Preview unframed poster",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Lower total if you already have a frame plan.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Open the editor without preselecting a checkout path.",
          },
        ]}
      />
      <StickyCtaBar source="sticky-star-map-poster" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Made-to-order wall art from your approved design</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Your star map is rendered from the exact date, time, and location you enter, then routed into a poster or
          framed print after you approve the preview. Shipping appears before payment for physical orders.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate night sky based on real astronomical data</li>
          <li>Museum-grade unframed poster or ready-to-hang framed print</li>
          <li>Preview before purchase so the artwork is approved first</li>
          <li>Shipping is added at checkout before payment is finalized</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your poster in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Pick a poster style and color palette</li>
          <li>Preview the map and adjust text</li>
          <li>Choose unframed or framed print checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=star-map-poster-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Design your star map poster
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="This is a custom physical product, so the important things should be clear before payment: what you are ordering, when shipping appears, how support works, and what happens if there is a print issue."
        leftTitle="What you are ordering"
        leftPoints={[
          "A made-to-order custom star map created from your approved preview.",
          `Choose unframed poster or framed print in checkout.`,
          `Support is handled directly by ${profile.name} at ${profile.email}.`,
        ]}
        rightTitle="What happens after checkout"
        rightPoints={[
          shippingDisclosure,
          "Physical orders are reviewed before production while manual approval mode is enabled.",
          "If a print arrives damaged or defective, contact support within 7 days with photos and order details.",
        ]}
      />

      <DeliveryFormatModule
        heading="Choose the physical format after preview"
        intro={`Preview the artwork first, then decide whether this moment should arrive as an unframed poster or a ready-to-hang framed print. ${shippingDisclosure}`}
        sourcePrefix="poster-format"
      />

      <FramedProofSection
        heading="Poster design on screen, framed result on the wall"
        intro={`Use the poster layout to approve the composition, then move into physical checkout if you want the finished piece to arrive ready to gift or display. ${shippingDisclosure}`}
        sourcePrefix="poster-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">More ways to explore</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Start from curated hubs or jump to adjacent intent pages.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/star-map-for"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Occasion hub
          </Link>
          <Link
            href="/star-map-in"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Location hub
          </Link>
          <Link
            href="/star-map-generator"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map generator
          </Link>
          <Link
            href="/star-map-gallery"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map gallery
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map poster FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Is this a physical star map poster?</h3>
            <p>
              Yes. After preview, you can choose an unframed poster or framed print from the same approved design.
              {` ${shippingDisclosure}`}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Do I see shipping before paying?</h3>
            <p>
              Yes. Physical checkout shows the shipping charge before payment is finalized, and orders are reviewed
              before production begins while manual approval mode is enabled.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Is this a physical star map poster?",
            answer:
              `Yes. After preview, you can choose an unframed poster or framed print from the same approved design. ${shippingDisclosure}`,
          },
          {
            question: "Do I see shipping before paying?",
            answer:
              "Yes. Physical checkout shows the shipping charge before payment is finalized, and orders are reviewed before production begins while manual approval mode is enabled.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </main>
  );
}
