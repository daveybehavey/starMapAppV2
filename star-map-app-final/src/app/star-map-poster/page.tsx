import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
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
    "Design a star map poster (night sky poster) for any date and location. High-resolution digital download plus U.S. unframed and framed print checkout.",
  alternates: { canonical: `${siteUrl}/star-map-poster` },
  openGraph: {
    title: "Star Map Poster | StarMapCo",
    description:
      "Design a star map poster (night sky poster) for any date and location. High-resolution digital download plus U.S. unframed and framed print checkout.",
    url: `${siteUrl}/star-map-poster`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapPosterPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Poster</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Create a star map poster from the exact night sky of a special moment. This night sky poster is a print-ready
          download that looks beautiful in a frame.
        </p>
      </header>

      <PreviewStartForm source="star-map-poster" />
      <StickyCtaBar source="sticky-star-map-poster" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Poster-quality, print-ready detail</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Your star map poster is exported in high resolution so lines, stars, and text stay sharp when printed. Choose a
          layout and style that matches your space, then download instantly once unlocked.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate night sky based on real astronomical data</li>
          <li>High-resolution digital download for framing</li>
          <li>Clean typography and customizable text</li>
          <li>Flexible pricing: single, bundle, or subscription</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your poster in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Pick a poster style and color palette</li>
          <li>Preview the map and adjust text</li>
          <li>Unlock and download the HD file</li>
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

      <DeliveryFormatModule
        heading="Choose whether this poster stays digital or ships physically"
        intro={`Some buyers want the HD poster file for local printing. Others want the same design routed into U.S. unframed or framed checkout. The preview supports both paths. ${shippingDisclosure}`}
        sourcePrefix="poster-format"
      />

      <FramedProofSection
        heading="Poster design on screen, framed result on the wall"
        intro={`Use the poster layout to design the composition, then move into physical checkout if you want the finished piece to arrive ready to gift or display. ${shippingDisclosure}`}
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
              It starts as a high-resolution digital poster file, and after preview you can keep it digital or move into
              U.S. unframed or framed print checkout from the same design. {shippingDisclosure}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What size is the star map poster file?</h3>
            <p>
              The HD export is a 6000×6000px PNG designed for crisp prints and posters. You can print multiple sizes from
              the same file.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Is this a physical star map poster?",
            answer:
              `It starts as a high-resolution digital poster file, and after preview you can keep it digital or move into U.S. unframed or framed print checkout from the same design. ${shippingDisclosure}`,
          },
          {
            question: "What size is the star map poster file?",
            answer:
              "The HD export is a 6000×6000px PNG designed for crisp prints and posters. You can print multiple sizes from the same file.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
