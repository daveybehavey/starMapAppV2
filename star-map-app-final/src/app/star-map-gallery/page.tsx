import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gallery", label: "Star map gallery" },
];

const galleryItems = [
  {
    src: "/examples/example-wedding-cinematic-heart.webp",
    alt: "Wedding star map in cinematic heart style",
    title: "Wedding · Cinematic Heart",
    caption: "Santorini, Greece · June 21, 2024",
    badge: "CINEMATIC",
    anchor: "cinematic",
  },
  {
    src: "/examples/example-anniversary-luxe.webp",
    alt: "Anniversary star map in luxe style",
    title: "Anniversary · Luxe",
    caption: "Paris, France · September 15, 2016",
    badge: "LUXE",
    anchor: "luxe",
  },
  {
    src: "/examples/example-birthday-classic.webp",
    alt: "Birthday star map in classic style",
    title: "Birthday · Classic",
    caption: "Tokyo, Japan · July 7, 1995",
    badge: "CLASSIC",
    anchor: "classic",
  },
  {
    src: "/examples/example-birth-classic.webp",
    alt: "New baby star map in warm classic style",
    title: "New Baby · Warm Classic",
    caption: "Toronto, Canada · February 14, 2023",
    badge: "WARM",
    anchor: "warm",
  },
  {
    src: "/examples/example-memorial-blueprint.webp",
    alt: "Memorial star map in blueprint style",
    title: "Memorial · Blueprint",
    caption: "London, UK · November 11, 2018",
    badge: "BLUEPRINT",
    anchor: "blueprint",
  },
  {
    src: "/examples/example-graduation-luxe.webp",
    alt: "Graduation star map in luxe diamond style",
    title: "Graduation · Luxe Diamond",
    caption: "Boston, USA · May 25, 2024",
    badge: "LUXE",
    anchor: "luxe-diamond",
  },
];

export const metadata: Metadata = {
  title: "Star Map Gallery",
  description:
    "Browse real star map examples by occasion and style. See finished previews before creating your own custom star map.",
  alternates: { canonical: `${siteUrl}/star-map-gallery` },
  openGraph: {
    title: "Star Map Gallery | StarMapCo",
    description:
      "Browse real star map examples by occasion and style. See finished previews before creating your own custom star map.",
    url: `${siteUrl}/star-map-gallery`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGalleryPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star Map Gallery</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Real examples from popular occasions and styles. Use these for inspiration before you create your own map.
        </p>
      </header>

      <PreviewStartForm
        source="star-map-gallery"
        title="Start your free preview"
        description="Pick a date and location to open the editor with your sky ready to customize."
        buttonLabel="Preview your star map"
      />
      <StickyCtaBar source="sticky-star-map-gallery" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-midnight">Gallery highlights</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Each map is generated from real astronomical data, then styled with different shapes and typography.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {galleryItems.map((item) => (
            <div
              key={item.src}
              id={item.anchor}
              className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg shadow-black/10"
            >
              <div className="relative aspect-square overflow-hidden">
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={1200}
                  height={1200}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="border-t border-black/5 px-4 py-3 text-sm text-neutral-800">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-midnight">
                  <span>{item.title}</span>
                  <span className="rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    {item.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{item.caption}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 text-sm text-neutral-700">
          Want to see more? Explore by occasion or jump into the editor with your own date.
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-sm font-semibold">
          <Link href="/star-map-for" className="text-amber-700 underline hover:text-amber-800">
            Browse by occasion
          </Link>
          <Link href="/editor?mode=quick" className="text-amber-700 underline hover:text-amber-800">
            Create your map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">What you can customize</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Choose any date, time, and location worldwide</li>
          <li>Pick a shape, layout, and style preset</li>
          <li>Add names, a title, and a dedication line</li>
          <li>Preview instantly before unlocking HD</li>
        </ul>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Start a free preview
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map gallery FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Are these real star maps?</h3>
            <p>Yes. Every example is generated from real astronomical data for a specific date and location.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I recreate one of these exact maps?</h3>
            <p>Yes. Enter the same date and location to get a matching sky, then customize the text and layout.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Do I get a print-ready file?</h3>
            <p>Yes. After unlocking, you download a high-resolution file ready for printing or gifting.</p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Are these real star maps?",
            answer: "Yes. Every example is generated from real astronomical data for a specific date and location.",
          },
          {
            question: "Can I recreate one of these exact maps?",
            answer: "Yes. Enter the same date and location to get a matching sky, then customize the text and layout.",
          },
          {
            question: "Do I get a print-ready file?",
            answer: "Yes. After unlocking, you download a high-resolution file ready for printing or gifting.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
