import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "How to Print a Star Map",
  description:
    "Learn how to print a star map with the best sizes, paper, and framing tips. Get a crisp, frame-ready star map print.",
  alternates: { canonical: "https://starmapco.com/how-to-print-star-map" },
  openGraph: {
    title: "How to Print a Star Map | StarMapCo",
    description:
      "Learn how to print a star map with the best sizes, paper, and framing tips. Get a crisp, frame-ready print.",
    url: "https://starmapco.com/how-to-print-star-map",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "article",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function HowToPrintStarMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">How to Print a Star Map</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Use this guide to print your star map at the right size, on the right paper, with a frame that makes it shine.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Recommended print sizes</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          Choose a size that fits your space. These are the most popular sizes for star map prints:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>8x10 or 11x14 for desks, shelves, and small frames</li>
          <li>12x16 or 16x20 for standard wall frames</li>
          <li>18x24 or 24x36 for statement pieces</li>
        </ul>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Paper and finish</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Matte or satin paper reduces glare and keeps the stars crisp. If you want a more premium feel, choose thick
          fine‑art paper or a lightly textured stock.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Matte: soft, no glare, clean lines</li>
          <li>Satin: slight sheen, more depth</li>
          <li>Fine‑art: textured, gallery feel</li>
        </ul>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Resolution and quality</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          StarMapCo exports high‑resolution files designed for printing. For best results, avoid upscaling and print at the
          size that matches your file.
        </p>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Framing tips</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          A simple frame keeps the focus on the stars. Neutral woods, black, or brushed metal frames work well. Add a white
          mat for a clean border and a more gallery‑style presentation.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your print‑ready star map</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Start with an instant preview, then unlock the HD file when you’re ready to print.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start free preview
          </Link>
        </div>
      </section>
    </main>
  );
}
