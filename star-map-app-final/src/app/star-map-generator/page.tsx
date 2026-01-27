import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "Star Map Generator",
  description:
    "Use a star map generator to create a custom night sky map from any date and location. Instant preview and print-ready download.",
  alternates: { canonical: "https://starmapco.com/star-map-generator" },
  openGraph: {
    title: "Star Map Generator | StarMapCo",
    description:
      "Use a star map generator to create a custom night sky map from any date and location. Instant preview and print-ready download.",
    url: "https://starmapco.com/star-map-generator",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function StarMapGeneratorPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Star Map Generator</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Build a custom star map from any moment with our star map generator. Enter the date, time, and location to preview
          the exact night sky instantly.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Generate a map that is actually accurate</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          This is not a stock illustration. The map is calculated from real astronomical data so the constellations and star
          positions match your date and location.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate to the minute and precise location</li>
          <li>Instant preview so you can refine details</li>
          <li>Multiple styles and layout options</li>
          <li>Print-ready digital download</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">How to use the star map generator</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter the date, time, and location that matter to you</li>
          <li>Choose a style, shape, and text layout</li>
          <li>Preview the sky instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start the generator
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Popular use cases</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Star map generators are commonly used for anniversaries, weddings, births, and memorials. Add a title, names, and a
          short dedication to make it personal.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/constellation-map" className="text-gold underline hover:text-amber-600">
            Constellation map
          </Link>
          <Link href="/star-map-poster" className="text-gold underline hover:text-amber-600">
            Star map poster
          </Link>
        </div>
      </section>
    </main>
  );
}
