import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Media Kit | StarMapCo",
  description:
    "Press and media resources for StarMapCo, including logos, product images, and a short brand description.",
  alternates: { canonical: `${siteUrl}/media-kit` },
  robots: { index: false, follow: false },
  openGraph: {
    title: "StarMapCo Media Kit",
    description:
      "Press and media resources for StarMapCo, including logos, product images, and a short brand description.",
    url: `${siteUrl}/media-kit`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function MediaKitPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Media Kit</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Resources for press, partners, and creators who want to feature StarMapCo.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Short description</h2>
        <p className="text-sm leading-relaxed text-neutral-700 sm:text-base">
          StarMapCo lets you create a custom star map of the exact night sky from any date and location. It is an instant
          preview, print‑ready digital download designed for gifting and framing.
        </p>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Logos and images</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Use these images when featuring StarMapCo. Please keep attribution to StarMapCo.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
          <li>
            <a href="/favicon.ico" className="font-semibold text-amber-700 underline hover:text-amber-900">
              Logo (ICO)
            </a>
          </li>
          <li>
            <a href="/custom-star-map-anniversary.webp" className="font-semibold text-amber-700 underline hover:text-amber-900">
              Product image (WebP)
            </a>
          </li>
          <li>
            <a href="/og-default.png" className="font-semibold text-amber-700 underline hover:text-amber-900">
              OpenGraph image (PNG)
            </a>
          </li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Contact</h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          For press or partnerships, email support@starmapco.com.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Go to StarMapCo
          </Link>
        </div>
      </section>
    </main>
  );
}
