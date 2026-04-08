import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import PrimaryIntentLinksSection from "@/components/PrimaryIntentLinksSection";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-generator", label: "Star map generator" },
];

export const metadata: Metadata = {
  title: "Star Map Generator | StarMapCo",
  description:
    "Use the StarMapCo generator to preview the exact sky from any date and place, test styles, and move into digital or print checkout when ready.",
  alternates: { canonical: `${siteUrl}/star-map-generator` },
  openGraph: {
    title: "Star Map Generator | StarMapCo",
    description:
      "Use the StarMapCo generator to preview the exact sky from any date and place, test styles, and move into digital or print checkout when ready.",
    url: `${siteUrl}/star-map-generator`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGeneratorPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Generator</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Use the generator to preview the exact sky, test styles, and move into digital or print checkout when the design feels right.
        </p>
      </header>

      <PreviewStartForm
        source="star-map-generator"
        title="Start your generator preview"
        description="Enter the date and location to open the preview. Choose the final delivery route after the design feels right."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Best if you want the finished piece to arrive ready to display.",
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
        source="sticky-star-map-generator"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-star-map-generator-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <PrimaryIntentLinksSection
        heading="Primary start pages"
        intro="Use the generator when you want the tool first. If you want the stronger primary route after previewing, start with one of these pages."
        links={[
          { href: "/personalized-star-map", label: "Personalized star map", recommended: true },
          { href: "/star-map-gift", label: "Star map gift" },
          { href: "/star-map-gallery", label: "Star map gallery" },
        ]}
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Generate a map that is actually accurate</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          This is not a stock illustration. The map is calculated from real astronomical data so the constellations and star
          positions match your date and location.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the minute and precise location</li>
          <li>Instant preview so you can refine details</li>
          <li>Multiple styles and layout options</li>
          <li>The same approved design can stay digital or move into framed or unframed print</li>
        </ul>
      </section>
      <AccuracyAuthorityCard source="generator-accuracy-card" />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">How to use the star map generator</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location that matter to you</li>
          <li>Choose a style, shape, and text layout</li>
          <li>Preview the sky instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=star-map-generator-cta-framed&checkout=print&print_variant=poster_framed"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Popular use cases</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Star map generators are commonly used for anniversaries, weddings, births, and memorials. Add a title, names, and a
          short dedication to make it personal.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/personalized-star-map"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Personalized star map
          </Link>
          <Link
            href="/star-map-gift"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map gift
          </Link>
          <Link
            href="/anniversary"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Anniversary star map
          </Link>
          <Link
            href="/wedding"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Wedding star map
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose digital, unframed print, or framed print after preview"
        intro={`The generator starts the same way for every buyer: build the exact sky first, then decide whether this should become a framed gift, a lower-total unframed print, or HD digital delivery. ${shippingDisclosure}`}
        sourcePrefix="generator-format"
      />

      <FramedProofSection
        heading="The same generated map can become a framed gift"
        intro={`This is the part most generator pages skip. After preview, the same design can move into framed checkout, unframed checkout, or HD digital delivery without rebuilding the map. ${shippingDisclosure}`}
        sourcePrefix="generator-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Need inspiration?</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Browse real examples or explore curated gift ideas before you build your own.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/star-map-gallery"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Star map gallery
          </Link>
          <Link
            href="/star-map-gift"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map gift
          </Link>
          <Link
            href="/blog"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Blog
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map generator FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">How accurate is the star map generator?</h3>
            <p>
              The star map generator uses real astronomical data, so star positions and constellations match your chosen
              date, time, and location.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I create a star map for any date and location?</h3>
            <p>
              Yes. Enter any date, time, and place worldwide to create a custom night sky map you can preview before
              choosing framed print, unframed print, or HD digital delivery.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "How accurate is the star map generator?",
            answer:
              "The star map generator uses real astronomical data, so star positions and constellations match your chosen date, time, and location.",
          },
          {
            question: "Can I create a star map for any date and location?",
            answer:
              "Yes. Enter any date, time, and place worldwide to create a custom night sky map you can preview before choosing framed print, unframed print, or HD digital delivery.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
