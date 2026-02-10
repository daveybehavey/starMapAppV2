import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Star Map Poster",
  description:
    "Design a star map poster (night sky poster) for any date and location. High-resolution digital download, ready for printing and framing.",
  alternates: { canonical: `${siteUrl}/star-map-poster` },
  openGraph: {
    title: "Star Map Poster | StarMapCo",
    description:
      "Design a star map poster (night sky poster) for any date and location. High-resolution digital download, ready for printing and framing.",
    url: `${siteUrl}/star-map-poster`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapPosterPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Star Map Poster</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Create a star map poster from the exact night sky of a special moment. This night sky poster is a print-ready
          download that looks beautiful in a frame.
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

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map poster FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-700 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Is this a physical star map poster?</h3>
            <p>
              It is a digital download. You receive a high-resolution star map poster file that you can print locally or
              with an online print service.
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
    </main>
  );
}
