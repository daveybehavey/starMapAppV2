import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "Custom Night Sky Map",
  description:
    "Create a custom night sky map from any date and location. Accurate star positions, instant preview, and print-ready download.",
  alternates: { canonical: "https://starmapco.com/custom-night-sky-map" },
  openGraph: {
    title: "Custom Night Sky Map | StarMapCo",
    description:
      "Create a custom night sky map from any date and location. Accurate star positions, instant preview, and print-ready download.",
    url: "https://starmapco.com/custom-night-sky-map",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function CustomNightSkyMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Custom Night Sky Map</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Design a custom night sky map that reflects the exact stars above you on a meaningful date. Personalized, accurate,
          and ready to print.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">A night sky map that matches your moment</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          The positions of stars and constellations depend on time and location. We calculate the real sky so your map matches
          the moment you want to remember.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate star positions for any date and location</li>
          <li>Custom styles, labels, and typography</li>
          <li>Instant preview with flexible HD download options</li>
          <li>Print-ready, high-resolution file</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your custom night sky map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter your date, time, and location</li>
          <li>Choose a design style and shape</li>
          <li>Preview the sky instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Create a night sky map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related ideas</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Looking for a specific format? Explore these popular options.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/night-sky-map-gift" className="text-gold underline hover:text-amber-600">
            Night sky map gift
          </Link>
          <Link href="/star-map-generator" className="text-gold underline hover:text-amber-600">
            Star map generator
          </Link>
        </div>
      </section>
    </main>
  );
}
