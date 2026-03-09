import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/custom-night-sky-map", label: "Custom night sky map" },
];

export const metadata: Metadata = {
  title: "Custom Night Sky Map | StarMapCo",
  description:
    "Create a custom night sky map from any date and location. Accurate star positions, instant preview, and print-ready download.",
  alternates: { canonical: `${siteUrl}/custom-night-sky-map` },
  openGraph: {
    title: "Custom Night Sky Map | StarMapCo",
    description:
      "Create a custom night sky map from any date and location. Accurate star positions, instant preview, and print-ready download.",
    url: `${siteUrl}/custom-night-sky-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function CustomNightSkyMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Custom Night Sky Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Design a custom night sky map (star map) that reflects the exact stars above you on a meaningful date.
          Personalized, accurate, and ready to print.
        </p>
      </header>

      <PreviewStartForm source="custom-night-sky-map" />
      <StickyCtaBar source="sticky-custom-night-sky-map" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">A night sky map that matches your moment</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The positions of stars and constellations depend on time and location. We calculate the real sky so your map matches
          the moment you want to remember.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate star positions for any date and location</li>
          <li>Custom styles, labels, and typography</li>
          <li>Instant preview with flexible HD download options</li>
          <li>Print-ready, high-resolution file</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create your custom night sky map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter your date, time, and location</li>
          <li>Choose a design style and shape</li>
          <li>Preview the sky instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=custom-night-sky-map-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Create a night sky map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Looking for a specific format? Explore these popular options.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Custom night sky map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What is a custom night sky map?</h3>
            <p>
              A custom night sky map is a star map created from a specific date and location, showing the real sky from that
              moment.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I preview the night sky map before buying?</h3>
            <p>
              Yes. You can preview the map for free, then unlock the HD download when you are ready.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What is a custom night sky map?",
            answer:
              "A custom night sky map is a star map created from a specific date and location, showing the real sky from that moment.",
          },
          {
            question: "Can I preview the night sky map before buying?",
            answer: "Yes. You can preview the map for free, then unlock the HD download when you are ready.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
