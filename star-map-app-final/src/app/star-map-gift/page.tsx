import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift", label: "Star map gift" },
];

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
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          A personalized star map gift captures the exact sky from a meaningful moment. It is personal, timeless, and ready
          to print.
        </p>
      </header>

      <PreviewStartForm source="star-map-gift" />
      <StickyCtaBar source="sticky-star-map-gift" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why a star map gift feels different</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Instead of a generic present, a custom star map ties your gift to a moment that can never be repeated. The stars
          were arranged that way only once.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Perfect for anniversaries, weddings, birthdays, and memorials</li>
          <li>Accurate night sky based on real astronomical data</li>
          <li>Instant preview and easy personalization</li>
          <li>Print‑ready digital download</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a gift in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Choose the date and location that matter most</li>
          <li>Add names, a title, and a dedication line</li>
          <li>Preview the map instantly</li>
          <li>Unlock and download the HD file</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make a star map gift
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related gift ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Explore these popular variations when searching for the perfect gift.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/star-map-gift-ideas" className="text-amber-700 underline hover:text-amber-800">
            Star map gift ideas
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-midnight">Recent examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            See real outputs before you start. Each map is unique to its date and location.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              src: "/examples/example-wedding-cinematic-heart.webp",
              label: "Wedding · Cinematic",
            },
            {
              src: "/examples/example-anniversary-luxe.webp",
              label: "Anniversary · Luxe",
            },
            {
              src: "/examples/example-birthday-classic.webp",
              label: "Birthday · Classic",
            },
          ].map((item) => (
            <div key={item.src} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              <div className="relative aspect-square">
                <Image
                  src={item.src}
                  alt={item.label}
                  width={900}
                  height={900}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="border-t border-black/5 px-3 py-2 text-xs font-semibold text-midnight">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="text-sm">
          <Link href="/star-map-gallery" className="text-amber-700 underline hover:text-amber-800">
            View full gallery
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map gift FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
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
      <FaqSchema
        items={[
          {
            question: "Is a star map a good couples gift?",
            answer:
              "Yes. A custom star map gift is one of the most meaningful couples gifts because it captures the exact sky from a shared moment.",
          },
          {
            question: "Can I add names and a date?",
            answer:
              "You can personalize the star map with names, a title, a date line, and a dedication before downloading the HD file.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
