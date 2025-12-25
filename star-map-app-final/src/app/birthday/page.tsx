import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

export const metadata: Metadata = {
  title: "Personalized Birthday Star Map",
  description:
    "Celebrate a birthday with a personalized star map showing the exact night sky from their special date and place. Astronomically accurate, print-ready, and memorable.",
  alternates: { canonical: "https://starmapco.com/birthday" },
  openGraph: {
    title: "Personalized Birthday Star Map | StarMapCo",
    description: "Capture the night sky from their birthday—accurate, print-ready, and gift-worthy.",
    url: "https://starmapco.com/birthday",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default function BirthdayPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Personalized Birthday Star Map</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          Mark a birthday with the exact night sky from their birth date and location. A keepsake that feels personal, timeless,
          and ready to frame.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why this birthday gift stands out</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          Birthdays come every year—but the sky on the night someone was born is one of a kind. Our maps use astronomically
          accurate data to plot that exact sky—constellations, planets, and Moon phase can all be included—so the gift feels
          as unique as they are.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Accurate to the birth date, time, and location</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Styles that work for any age—clean, elegant, or celebratory</li>
          <li>Optional dedication lines for names, wishes, or a milestone year</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create it in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Enter the birth location (city or hospital)</li>
          <li>Select the birth date (add time if you want to be exact)</li>
          <li>Choose a style and add a dedication line</li>
          <li>Reveal the sky and download a print-ready file</li>
        </ol>
        <p className="text-sm text-neutral-700 sm:text-base">
          Share a preview for free. Upgrade once to unlock the HD, watermark-free file for framing.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make their birthday star map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Preview and HD export share the same rendering engine, so the final download matches what you see. Toggle
          constellations, glow, labels, and choose fonts to fit their style. One-time purchase—no subscriptions—so you can print
          and gift it forever.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/wedding" className="text-gold underline hover:text-amber-600">
            Wedding star maps
          </Link>
          <Link href="/anniversary" className="text-gold underline hover:text-amber-600">
            Anniversary star maps
          </Link>
        </div>
      </section>
    </main>
  );
}
