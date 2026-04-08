import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { galleryExamples } from "@/lib/galleryExamples";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gallery", label: "Star map gallery" },
];

export const metadata: Metadata = {
  title: "Star Map Gallery | StarMapCo",
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
          Fresh examples rendered with the current StarMapCo engine. Use these to judge the look before you create your own map.
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
            Every example uses real astronomical data and the current preset engine, so the gallery reflects what buyers actually see in the editor today.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {galleryExamples.map((item) => (
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
          <Link href="/star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Main gift page
          </Link>
          <Link
            href="/editor?mode=quick&source=star-map-gallery-inline-cta"
            className="text-amber-700 underline hover:text-amber-800"
          >
            Create your map
          </Link>
        </div>
      </section>

      <FramedProofSection
        heading="Compare the finished print with the on-screen render"
        intro="The gallery cards are freshly rendered with the current engine. This photographed framed example shows how the physical piece lands in a real room. Use both before deciding between digital, unframed, or framed checkout."
        sourcePrefix="gallery-proof"
      />

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
            href="/editor?mode=quick&source=star-map-gallery-primary-cta"
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
          <div>
            <h3 className="font-semibold text-midnight">Can I order a physical version from one of these examples?</h3>
            <p>Yes. After preview, checkout supports both unframed print and framed print from the same design, with shipping shown before payment.</p>
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
          {
            question: "Can I order a physical version from one of these examples?",
            answer: "Yes. After preview, checkout supports both unframed print and framed print from the same design, with shipping shown before payment.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
