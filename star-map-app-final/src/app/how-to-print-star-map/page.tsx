import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { buildInstantHdPreviewIntents, getInstantHdHeroHref, getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/how-to-print-star-map", label: "How to print a star map" },
];

export const metadata: Metadata = {
  title: "How to Print a Star Map | StarMapCo",
  description:
    "Learn how to print a star map with the best sizes, paper, and framing tips. Get a crisp, frame-ready star map print.",
  alternates: { canonical: `${siteUrl}/how-to-print-star-map` },
  openGraph: {
    title: "How to Print a Star Map | StarMapCo",
    description:
      "Learn how to print a star map with the best sizes, paper, and framing tips. Get a crisp, frame-ready print.",
    url: `${siteUrl}/how-to-print-star-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "article",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function HowToPrintStarMapPage() {
  const instantHref = getInstantHdHeroHref("how-to-print-star-map-hero-instant");
  const instantPrice = getInstantHdPriceLine();
  const previewIntents = buildInstantHdPreviewIntents("how-to-print-star-map");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">How to Print a Star Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Use this guide to print your star map at the right size, on the right paper, with a frame that makes it shine.
          Need the file first? Start with instant HD — then print locally or order framed from the same design.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={instantHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Get instant HD from {instantPrice}
          </Link>
          <Link
            href="/hd-star-map"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Instant HD funnel
          </Link>
        </div>
      </header>

      <PreviewStartForm
        title="Start your preview"
        description="Enter date and location — instant HD unlocks after checkout, or add a framed print from the same approved design."
        buttonLabel="Preview your map"
        source="how-to-print-star-map"
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-how-to-print-instant-hd"
        title="Printing locally?"
        description="Unlock the HD file first — same preview engine, poster-quality PNG."
        buttonLabel="Preview instant HD"
        primaryHref={instantHref}
        primaryPlan="hd_digital"
        secondaryButtonLabel="Order framed print"
        secondaryHref="/editor?mode=quick&source=sticky-how-to-print-framed&checkout=print&print_variant=poster_framed&include_digital_addon=1"
        secondaryPlan="print_framed_hd"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">StarMapCo print SKUs (live today)</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Physical checkout uses square artwork matched to Printful variants. Use a square layout in the editor for the
          best fit.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>
            <strong>Framed print — 14×14 in</strong> (Enhanced Matte, black frame). Gift-ready; ships from Printful.
          </li>
          <li>
            <strong>Unframed poster — 18×18 in</strong> (museum-grade poster). Frame locally or at a print shop.
          </li>
          <li>
            <strong>HD digital — 6000×6000 PNG</strong> for DIY printing when you need a custom size or international
            delivery without freight.
          </li>
        </ul>
        <p className="text-sm text-neutral-700">
          <Link href="/shop" className="font-semibold text-amber-800 underline hover:text-amber-950">
            Browse the shop
          </Link>{" "}
          for current pricing and shipping disclosure.
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Other DIY print sizes</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          With the HD digital file you can print at common frame sizes:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>8×10 or 11×14 for desks, shelves, and small frames</li>
          <li>12×16 or 16×20 for standard wall frames</li>
          <li>18×24 or 24×36 for statement pieces (crop or letterbox as needed)</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Paper and finish</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Matte or satin paper reduces glare and keeps the stars crisp. If you want a more premium feel, choose thick
          fine‑art paper or a lightly textured stock.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Matte: soft, no glare, clean lines</li>
          <li>Satin: slight sheen, more depth</li>
          <li>Fine‑art: textured, gallery feel</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Resolution and quality</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          StarMapCo exports high‑resolution files designed for printing. For best results, avoid upscaling and print at the
          size that matches your file.
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Framing tips</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          A simple frame keeps the focus on the stars. Neutral woods, black, or brushed metal frames work well. Add a white
          mat for a clean border and a more gallery‑style presentation.
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your print‑ready star map</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Start with an instant preview, then choose framed print, unframed print, or HD digital delivery once the
          design is final.
        </p>
        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            href={instantHref}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Get instant HD from {instantPrice}
          </Link>
          <Link
            href="/editor?mode=quick&source=how-to-print-star-map-cta"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Free preview first
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map printing FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What file format do I get?</h3>
            <p>Downloads are high‑resolution PNG files, ideal for local or online printing.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What size should I print?</h3>
            <p>Popular sizes include 11x14, 16x20, and 24x36. Choose the size that fits your frame and space.</p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What file format do I get?",
            answer: "Downloads are high‑resolution PNG files, ideal for local or online printing.",
          },
          {
            question: "What size should I print?",
            answer: "Popular sizes include 11x14, 16x20, and 24x36. Choose the size that fits your frame and space.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
