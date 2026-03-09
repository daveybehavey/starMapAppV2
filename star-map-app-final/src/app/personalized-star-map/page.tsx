import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
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
  { href: "/personalized-star-map", label: "Personalized star map" },
];

export const metadata: Metadata = {
  title: "Personalized Star Map | StarMapCo",
  description:
    "Create a personalized star map with names, dates, and locations. Choose HD download, unframed print, or framed print at checkout.",
  alternates: { canonical: `${siteUrl}/personalized-star-map` },
  openGraph: {
    title: "Personalized Star Map | StarMapCo",
    description:
      "Create a personalized star map with names, dates, and locations. Choose HD download, unframed print, or framed print at checkout.",
    url: `${siteUrl}/personalized-star-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function PersonalizedStarMapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Star Map</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Personalize a star map with names, a date, and a location to capture the exact night sky from a meaningful moment.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital download</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print checkout</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print checkout</span>
        </div>
      </header>

      <PreviewStartForm source="personalized-star-map" />
      <StickyCtaBar
        source="sticky-personalized-star-map"
        secondaryButtonLabel="Preview framed version"
        secondaryHref="/editor?mode=quick&source=sticky-personalized-star-map-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Make it truly personal</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Add a title, names, and a short dedication line. Choose a style that matches the person or place you are
          celebrating, then download a print-ready file.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate night sky based on real astronomical data</li>
          <li>Custom text, fonts, and layout options</li>
          <li>Instant preview so you can fine-tune details</li>
          <li>Flexible pricing options for HD download</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a personalized star map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Add names, a title, and a short message</li>
          <li>Preview the design instantly</li>
          <li>Choose HD download, unframed print, or framed print at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=personalized-star-map-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Personalize your star map
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Pick the right format after you preview"
        intro="Most buyers decide faster when the delivery choice is clear up front. Start with the free preview, then choose whether this moment should stay digital, be printed, or arrive framed."
        sourcePrefix="personalized-format"
      />
      <FramedProofSection sourcePrefix="personalized-proof" />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-midnight">Recent personalized map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            These are real StarMapCo outputs. You can start from one of these looks and adjust fonts, lines, and text.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              src: "/examples/example-wedding-cinematic-heart.webp",
              label: "Luxe wedding style",
            },
            {
              src: "/examples/example-anniversary-luxe.webp",
              label: "Classic anniversary style",
            },
            {
              src: "/examples/example-birthday-classic.webp",
              label: "Birthday keepsake style",
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
          <Link href="/star-map-gallery" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
            View full gallery
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Buy with confidence"
        intro="Preview first, then pay only when the design feels right. Checkout is secure, and your watermark-free HD file unlocks immediately after payment."
        leftTitle="Checkout and delivery"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after successful payment",
          "Single map, 3-pack, or unlimited plans",
        ]}
        rightTitle="Print quality and support"
        rightPoints={[
          "Export up to 6000x6000 resolution",
          "Built for poster-quality prints and framing",
          "Shipping address collected during checkout for physical orders",
          "Physical orders stay in manual review before production starts",
          "Email support at support@starmapco.com",
        ]}
        guideLabel="Print size and frame guide"
      />
      <WhatYouReceiveModule
        heading="What you receive with your personalized map"
        intro="Your paid export package is designed to go straight from checkout to print planning."
      />
      <RevenueTrustModule
        heading="Personalized order confidence"
        intro="This is built for gifting quality, not just a quick screenshot. Use the quick guide below to lock in print size and framing before you checkout."
      />
      <TestimonialHighlights
        heading="Verified personalized map feedback"
        intro="Real comments from buyers are shown here as they are collected."
        testimonials={testimonialsByPage.personalized}
      />

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Personalized star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">What can I customize on a personalized star map?</h3>
            <p>
              You can add names, a title, a date line, a dedication, and choose styles, fonts, shapes, and labels.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is the personalized star map print-ready?</h3>
            <p>
              Yes. The HD file is high resolution and designed for crisp prints and framing.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What if I do not know the exact time?</h3>
            <p>
              You can still create a beautiful map using date + location only. If time is unknown, we default to midnight
              and you can adjust later.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">How quickly do I get the HD file?</h3>
            <p>
              Immediately after checkout. You unlock the download in the app and can save your file right away.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I order a printed or framed version directly?</h3>
            <p>
              Yes. After preview, you can choose HD download, unframed print, or framed print during checkout.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "What can I customize on a personalized star map?",
            answer:
              "You can add names, a title, a date line, a dedication, and choose styles, fonts, shapes, and labels.",
          },
          {
            question: "Is the personalized star map print-ready?",
            answer: "Yes. The HD file is high resolution and designed for crisp prints and framing.",
          },
          {
            question: "What if I do not know the exact time?",
            answer:
              "You can still create a beautiful map using date + location only. If time is unknown, we default to midnight and you can adjust later.",
          },
          {
            question: "How quickly do I get the HD file?",
            answer: "Immediately after checkout. You unlock the download in the app and can save your file right away.",
          },
          {
            question: "Can I order a printed or framed version directly?",
            answer: "Yes. After preview, you can choose HD download, unframed print, or framed print during checkout.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
