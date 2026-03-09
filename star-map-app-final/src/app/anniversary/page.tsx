import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/anniversary", label: "Anniversary" },
];

export const metadata: Metadata = {
  title: "Personalized Anniversary Star Map | StarMapCo",
  description:
    "Celebrate your years together with a personalized anniversary star map. Capture the exact night sky from your special date and place—accurate, print-ready, and unforgettable.",
  alternates: { canonical: `${siteUrl}/anniversary` },
  openGraph: {
    title: "Personalized Anniversary Star Map | StarMapCo",
    description: "Commemorate your anniversary with the exact night sky from your milestone. Print-ready star map keepsake.",
    url: `${siteUrl}/anniversary`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function AnniversaryPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Anniversary Star Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Mark your milestone with an anniversary star map gift showing the night sky from the date and place that shaped
          your story. A keepsake that grows more meaningful each year.
        </p>
      </header>

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why this gift matters</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Anniversaries celebrate time—days that turned into years. Our maps use astronomically accurate data to plot the exact
          sky from your milestone date and location. Constellations, planets, and Moon phase can all be included, so you can see
          the sky as it truly was when your journey together reached a new chapter.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the date, time, and location of your anniversary</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Elegant styles that feel timeless—perfect for a living room or bedroom wall</li>
          <li>Optional dedication lines for names, vows, or the milestone year</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the anniversary location (city or venue)</li>
          <li>Select the anniversary date (add time if you want to be exact)</li>
          <li>Choose a style and add your dedication line</li>
          <li>Reveal the sky and download a print-ready file</li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          Share a preview for free. Upgrade once to unlock the HD, watermark-free file for framing.
        </p>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=anniversary-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Create your anniversary star map
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          The preview and HD export use the same rendering engine—what you see is what you download. Toggle constellations,
          glow, labels, and choose fonts to match your style. Flexible pricing includes single downloads, bundles, or an
          unlimited subscription.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Anniversary star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What date should I use for an anniversary star map?</h3>
            <p>
              Most couples use their wedding date or the night they first met. Any meaningful date works.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is this a good couples gift?</h3>
            <p>
              Yes. A personalized anniversary star map is a thoughtful couples gift because it captures a shared moment.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What date should I use for an anniversary star map?",
            answer: "Most couples use their wedding date or the night they first met. Any meaningful date works.",
          },
          {
            question: "Is this a good couples gift?",
            answer:
              "Yes. A personalized anniversary star map is a thoughtful couples gift because it captures a shared moment.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
