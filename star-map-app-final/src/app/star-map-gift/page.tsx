import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Star Map Gift",
  description:
    "Give a personalized star map gift that recreates the exact night sky from a special date. Personal, accurate, and print-ready.",
  alternates: { canonical: `${siteUrl}/star-map-gift` },
  openGraph: {
    title: "Star Map Gift | StarMapCo",
    description:
      "Give a personalized star map gift that recreates the exact night sky from a special date. Personal, accurate, and print-ready.",
    url: `${siteUrl}/star-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGiftPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gift</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          A personalized star map gift captures the exact sky from a meaningful moment. It is personal, timeless, and ready
          to print.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a star map gift feels different</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          Instead of a generic present, a custom star map ties your gift to a moment that can never be repeated. The stars
          were arranged that way only once.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate night sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>Print‑ready digital download</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a gift in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Choose the date and location that matter most</li>
          <li>Add names, a title, and a dedication line</li>
          <li>Preview the map instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make a star map gift
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related gift ideas</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Explore these popular variations when searching for the perfect gift.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-700 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Is a star map a good couples gift?</h3>
            <p>
              Yes. A custom star map gift is one of the most meaningful couples gifts because it captures the exact sky from
              a shared moment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I add names and a date?</h3>
            <p>
              You can personalize the star map with names, a title, a date line, and a dedication before downloading the HD
              file.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
