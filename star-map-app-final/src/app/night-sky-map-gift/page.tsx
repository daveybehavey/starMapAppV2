import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Night Sky Map Gift",
  description:
    "Give a night sky map gift for anniversaries, birthdays, weddings, or memorials. Accurate, personal, and print-ready in minutes.",
  alternates: { canonical: `${siteUrl}/night-sky-map-gift` },
  openGraph: {
    title: "Night Sky Map Gift | StarMapCo",
    description:
      "Give a night sky map gift for anniversaries, birthdays, weddings, or memorials. Accurate, personal, and print-ready in minutes.",
    url: `${siteUrl}/night-sky-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function NightSkyMapGiftPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">StarMapCo</p>
        <h1 className="text-3xl font-bold text-midnight sm:text-4xl">Night Sky Map Gift</h1>
        <p className="text-sm text-neutral-700 sm:text-base">
          A night sky map gift captures the exact stars from a meaningful date and place. This personalized star map gift is
          timeless and ready to print.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why night sky maps make unforgettable gifts</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          The stars on a specific night never repeat in the same way. A custom night sky map turns that moment into a gift
          that feels thoughtful and unique.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>Print-ready download for framing</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a gift in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>Choose the date and location that matter most</li>
          <li>Pick a style and add names or a dedication</li>
          <li>Preview the map instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make a night sky map gift
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Gift ideas by occasion</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Choose the moment you want to celebrate and create a keepsake that is truly one of a kind.
        </p>
        <div className="flex gap-3 text-sm text-neutral-700">
          <Link href="/anniversary" className="text-gold underline hover:text-amber-600">
            Anniversary star maps
          </Link>
          <Link href="/wedding" className="text-gold underline hover:text-amber-600">
            Wedding star maps
          </Link>
          <Link href="/birthday" className="text-gold underline hover:text-amber-600">
            Birthday star maps
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Night sky map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-700 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">How fast do I receive a night sky map gift?</h3>
            <p>
              You can preview your night sky map instantly. After unlocking, the HD file downloads right away for printing.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What makes this a personalized gift?</h3>
            <p>
              Every map is generated from the exact date and location you choose, plus custom text like names and a message.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
