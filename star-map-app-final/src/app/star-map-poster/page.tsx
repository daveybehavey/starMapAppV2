import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "Star Map Poster",
  description:
    "Design a star map poster for any date and location. High-resolution digital download, ready for printing and framing.",
  alternates: { canonical: "https://starmapco.com/star-map-poster" },
  openGraph: {
    title: "Star Map Poster | StarMapCo",
    description:
      "Design a star map poster for any date and location. High-resolution digital download, ready for printing and framing.",
    url: "https://starmapco.com/star-map-poster",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function StarMapPosterPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Star Map Poster</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Create a star map poster from the exact night sky of a special moment. Download a print-ready file that looks
          beautiful in a frame.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Poster-quality, print-ready detail</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          Your star map poster is exported in high resolution so lines, stars, and text stay sharp when printed. Choose a
          layout and style that matches your space, then download instantly once unlocked.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate night sky based on real astronomical data</li>
          <li>High-resolution digital download for framing</li>
          <li>Clean typography and customizable text</li>
          <li>Flexible pricing: single, bundle, or subscription</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your poster in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Pick a poster style and color palette</li>
          <li>Preview the map and adjust text</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Design your star map poster
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Great for gifts and home decor</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Star map posters are perfect for anniversaries, weddings, births, and memorials. Add names, a date line, and a short
          dedication to make it personal.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/birthday" className="text-gold underline hover:text-amber-600">
            Birthday star maps
          </Link>
          <Link href="/anniversary" className="text-gold underline hover:text-amber-600">
            Anniversary star maps
          </Link>
        </div>
      </section>
    </main>
  );
}
