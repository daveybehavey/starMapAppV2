import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/constellation-map", label: "Constellation map" },
];

export const metadata: Metadata = {
  title: "Custom Constellation Map | StarMapCo",
  description:
    "Preview a constellation-focused star map from any date and place, personalize the layout, and compare digital or print delivery.",
  alternates: { canonical: `${siteUrl}/constellation-map` },
  openGraph: {
    title: "Custom Constellation Map | StarMapCo",
    description:
      "Preview a constellation-focused star map from any date and place, personalize the layout, and compare digital or print delivery.",
    url: `${siteUrl}/constellation-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function ConstellationMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Constellation Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Preview a constellation-focused star map from any date and place, then compare digital and print delivery from the same design.
        </p>
      </header>

      <section className="content-visibility-auto mt-6 rounded-3xl border border-black/5 bg-white/90 p-5 shadow-xl shadow-black/10">
        <h2 className="text-base font-semibold text-midnight">Best fit pages</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Use this page if constellation-focused language matters most. If you want the main buying paths, start with the direct pages below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link href="/personalized-star-map" className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100">
            Personalized star map
          </Link>
          <Link href="/star-map-generator" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50">
            Star map generator
          </Link>
          <Link href="/star-map-gallery" className="rounded-full border border-amber-200/60 bg-white/80 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50">
            Star map gallery
          </Link>
        </div>
      </section>

      <PreviewStartForm
        source="constellation-map"
        title="Start your constellation preview"
        description="Enter the date and place to open the preview. Choose the final delivery route after the design feels right."
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
            detail: "Keep the editor neutral until the constellation layout feels right.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-constellation-map"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-constellation-map-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a constellation map is special</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          A constellation map is more than a star chart. It is a snapshot of a real night sky tied to a meaningful moment.
          Whether it is a wedding, a birth, an anniversary, or a memorial, the constellations you saw that night can become
          a lasting keepsake.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the date, time, and location you choose</li>
          <li>Instant preview so you can refine details before checkout</li>
          <li>Elegant styles and clean layouts for framing or gifting</li>
          <li>The same approved design can stay digital, go unframed, or arrive framed</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make your constellation map in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Choose a layout, style, and optional labels</li>
          <li>Preview your exact sky instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=constellation-map-cta-framed&checkout=print&print_variant=poster_framed"
            prefetch={false}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Your preview and final export use the same rendering engine, so what you see is what you buy. The same approved
          design can move into framed print, unframed print, or HD digital delivery.
        </p>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Constellation map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What is a constellation map?</h3>
            <p>
              A constellation map is a star map that highlights the constellation layout for a specific date and location,
              showing how the sky looked at that moment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I personalize a constellation map?</h3>
            <p>
              Yes. Add names, a date line, and a dedication, then choose styles and labels before deciding on framed print,
              unframed print, or HD digital delivery.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What is a constellation map?",
            answer:
              "A constellation map is a star map that highlights the constellation layout for a specific date and location, showing how the sky looked at that moment.",
          },
          {
            question: "Can I personalize a constellation map?",
            answer:
              "Yes. Add names, a date line, and a dedication, then choose styles and labels before deciding on framed print, unframed print, or HD digital delivery.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
