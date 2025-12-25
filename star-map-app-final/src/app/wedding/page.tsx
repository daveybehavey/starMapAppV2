import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "Personalized Wedding Star Map",
  description:
    "Create a personalized wedding star map from your ceremony date and location. Astronomically accurate and print-ready — a meaningful keepsake or gift.",
  alternates: { canonical: "https://starmapco.com/wedding" },
  openGraph: {
    title: "Personalized Wedding Star Map | StarMapCo",
    description: "Capture the exact night sky from your wedding day and place. Print-ready star map keepsake.",
    url: "https://starmapco.com/wedding",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function WeddingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Personalized Wedding Star Map</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Capture the exact night sky from your wedding day and place. A keepsake that feels as timeless as your vows.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why couples love this gift</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          The stars above you on the night you said “I do” are unrepeatable. Our maps use astronomically accurate data to
          plot that exact sky—constellations, planets, and Moon phase can all be included. It’s a tangible way to remember
          the moment you created a new constellation of your own.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate to the date, time, and location of your wedding</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Elegant presets with gold accents that feel celebration-ready</li>
          <li>Optional dedication lines to add your vows, venue, or names</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter your wedding location (city or venue)</li>
          <li>Select the wedding date (and time if you want to be exact)</li>
          <li>Choose a style and add your names or vows</li>
          <li>Reveal the sky and download a print-ready file</li>
        </ol>
        <p className="text-sm text-neutral-700 sm:text-base">
          You can share a preview for free. Upgrade once to unlock the HD, watermark-free file for framing.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Craft your wedding star map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What makes it special</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Every map uses the same rendering engine for preview and HD export, so what you see is exactly what you receive.
          You can toggle constellations, glow, labels, and choose fonts to match your wedding aesthetic. No subscriptions—just
          a one-time purchase for a keepsake you can print forever.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/" className="text-gold underline hover:text-amber-600">
            Anniversary star maps
          </Link>
          <Link href="/" className="text-gold underline hover:text-amber-600">
            Birthday star maps
          </Link>
        </div>
      </section>
    </main>
  );
}
