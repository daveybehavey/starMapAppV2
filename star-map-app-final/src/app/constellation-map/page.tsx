import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Custom Constellation Map",
  description:
    "Create a custom constellation map (star map of constellations) for any date and location. Accurate star positions, instant preview, and print-ready download.",
  alternates: { canonical: `${siteUrl}/constellation-map` },
  openGraph: {
    title: "Custom Constellation Map | StarMapCo",
    description:
      "Create a custom constellation map (star map of constellations) for any date and location. Accurate star positions, instant preview, and print-ready download.",
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
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Constellation Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Capture the exact constellation layout from any date and place. This custom constellation map is a personal night
          sky map you can preview instantly and download in high resolution.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a constellation map is special</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          A constellation map is more than a star chart. It is a snapshot of a real night sky tied to a meaningful moment.
          Whether it is a wedding, a birth, an anniversary, or a memorial, the constellations you saw that night can become
          a lasting keepsake.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate to the date, time, and location you choose</li>
          <li>Instant preview so you can refine details before download</li>
          <li>Elegant styles and clean layouts for framing or gifting</li>
          <li>Flexible pricing for a print-ready digital file</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make your constellation map in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Choose a layout, style, and optional labels</li>
          <li>Preview your exact sky instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Create a constellation map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Your preview and HD export use the same rendering engine, so what you see is what you download. The file is
          designed for framing and printing, with crisp stars, constellation lines, and clean typography.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Constellation map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-700 sm:text-base">
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
              Yes. Add names, a date line, and a dedication, then choose styles and labels before downloading the HD file.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
