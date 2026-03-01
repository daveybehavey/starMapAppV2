import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PreviewStartForm from "@/components/PreviewStartForm";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import TestimonialHighlights from "@/components/TestimonialHighlights";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { testimonialsByPage } from "@/data/testimonials";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/wedding", label: "Wedding" },
];

export const metadata: Metadata = {
  title: "Personalized Wedding Star Map | StarMapCo",
  description:
    "Create a personalized wedding star map from your ceremony date and location. Astronomically accurate and print-ready — a meaningful keepsake or gift.",
  alternates: { canonical: `${siteUrl}/wedding` },
  openGraph: {
    title: "Personalized Wedding Star Map | StarMapCo",
    description: "Capture the exact night sky from your wedding day and place. Print-ready star map keepsake.",
    url: `${siteUrl}/wedding`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function WeddingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Wedding Star Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Capture the exact night sky from your wedding day and place. A wedding star map gift that feels as timeless as
          your vows.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital keepsake</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print option</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print option</span>
        </div>
      </header>

      <PreviewStartForm source="wedding" />
      <StickyCtaBar source="sticky-wedding" />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why couples love this gift</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          The stars above you on the night you said “I do” are unrepeatable. Our maps use astronomically accurate data to
          plot that exact sky—constellations, planets, and Moon phase can all be included. It’s a tangible way to remember
          the moment you created a new constellation of your own.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the date, time, and location of your wedding</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Elegant presets with gold accents that feel celebration-ready</li>
          <li>Optional dedication lines to add your vows, venue, or names</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter your wedding location (city or venue)</li>
          <li>Select the wedding date (and time if you want to be exact)</li>
          <li>Choose a style and add your names or vows</li>
          <li>Reveal the sky, then choose HD download, unframed print, or framed print at checkout</li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          You can share a preview for free. Upgrade once to unlock the HD, watermark-free file for framing.
        </p>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=wedding-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Craft your wedding star map
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-midnight">Wedding map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            Start with a style you like, then personalize wording, date line, and frame feel for your own event.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { src: "/examples/example-wedding-cinematic-heart.webp", label: "Cinematic gold" },
            { src: "/examples/example-anniversary-luxe.webp", label: "Luxe minimal" },
            { src: "/examples/example-birthday-classic.webp", label: "Classic contrast" },
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
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What makes it special</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Every map uses the same rendering engine for preview and HD export, so what you see is exactly what you receive.
          You can toggle constellations, glow, labels, and choose fonts to match your wedding aesthetic. Flexible pricing
          includes single downloads, bundles, or an unlimited subscription.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only when both of you are happy with the layout and text."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "High-resolution file up to 6000x6000",
          "Designed for frame-ready printing",
          "Help available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your wedding order includes"
        intro="This is the exact handoff from your final preview to a frame-ready HD file."
      />
      <RevenueTrustModule
        heading="Wedding keepsake confidence"
        intro="Couples usually decide faster when size, frame plan, and final text checks are already settled. Use this block before checkout."
      />
      <TestimonialHighlights
        heading="Verified wedding buyer feedback"
        intro="Real wedding-buyer comments are shown here as they are collected."
        testimonials={testimonialsByPage.wedding}
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Wedding star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Can I use the ceremony location?</h3>
            <p>
              Yes. Use the venue city or exact coordinates to generate a wedding star map that matches your ceremony.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is this a good couples gift?</h3>
            <p>
              Definitely. A wedding star map is one of the most meaningful couples gifts because it captures a shared
              moment under the stars.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Do I need the exact wedding time?</h3>
            <p>
              Exact time helps if you want maximum precision, but date + location still gives a beautiful and meaningful
              result.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I print it locally?</h3>
            <p>
              Yes. Most customers print locally or online and frame it themselves. We include guidance for common print
              sizes.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Can I use the ceremony location?",
            answer: "Yes. Use the venue city or exact coordinates to generate a wedding star map that matches your ceremony.",
          },
          {
            question: "Is this a good couples gift?",
            answer:
              "Definitely. A wedding star map is one of the most meaningful couples gifts because it captures a shared moment under the stars.",
          },
          {
            question: "Do I need the exact wedding time?",
            answer:
              "Exact time helps if you want maximum precision, but date + location still gives a beautiful and meaningful result.",
          },
          {
            question: "Can I print it locally?",
            answer:
              "Yes. Most customers print locally or online and frame it themselves. We include guidance for common print sizes.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
