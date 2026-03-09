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

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift", label: "Star map gift" },
];

export const metadata: Metadata = {
  title: "Star Map Gift | StarMapCo",
  description:
    "Give a personalized star map gift that recreates the exact night sky from a special date. HD, unframed print, and framed print checkout options.",
  alternates: { canonical: `${siteUrl}/star-map-gift` },
  openGraph: {
    title: "Star Map Gift | StarMapCo",
    description:
      "Give a personalized star map gift that recreates the exact night sky from a special date. HD, unframed print, and framed print checkout options.",
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
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital gift</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print gift</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print gift</span>
        </div>
      </header>

      <PreviewStartForm source="star-map-gift" />
      <StickyCtaBar
        source="sticky-star-map-gift"
        secondaryButtonLabel="Preview framed gift"
        secondaryHref="/editor?mode=quick&source=sticky-star-map-gift-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

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
          <li>Choose HD download, unframed print, or framed print at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=star-map-gift-cta"
            prefetch={false}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make a star map gift
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the gift format after preview"
        intro="For last-minute gifting, digital is fastest. For a ready-to-open keepsake, framed print is usually the strongest choice. Start with the same free preview either way."
        sourcePrefix="gift-format"
      />
      <FramedProofSection sourcePrefix="gift-proof" />

      <PurchaseTrustPanel
        heading="Confidence before checkout"
        intro="Build and share your preview for free. Pay only when you are ready to unlock the final HD file."
        leftTitle="What happens after payment"
        leftPoints={[
          "Secure Stripe checkout",
          "Immediate HD unlock with no watermark",
          "Download-ready for print or frame shops",
        ]}
        rightTitle="Support and policy"
        rightPoints={[
          "Clear returns and refund policy",
          "Shipping address collected during checkout for physical orders",
          "Step-by-step print guidance included",
          "Direct support at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your gift purchase includes"
        intro="Gift buyers usually want clarity on deliverables and timing. This is the exact package you unlock."
      />
      <RevenueTrustModule
        heading="Gift-buyer confidence pack"
        intro="If this is a gift, use this section to remove last-minute uncertainty around quality, print sizing, and final review before purchase."
      />
      <TestimonialHighlights
        heading="Verified gift-buyer feedback"
        intro="Real comments from gift buyers are shown here as they are collected."
        testimonials={testimonialsByPage.gift}
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related gift ideas</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Explore these popular variations when searching for the perfect gift.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/night-sky-map-gift" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/star-map-gift-ideas" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
            Star map gift ideas
          </Link>
          <Link href="/personalized-star-map" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
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
          <Link href="/star-map-gallery" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
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
          <div>
            <h3 className="font-semibold text-midnight">Can I create it now and buy later?</h3>
            <p>
              Yes. You can design and preview first, then return to unlock HD only when you are fully happy with the result.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What if I need a quick gift turnaround?</h3>
            <p>
              This works well for same-day gifting because checkout and HD download are instant.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I send a physical print instead of digital only?</h3>
            <p>
              Yes. You can choose an unframed print or framed print in checkout after previewing your design.
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
          {
            question: "Can I create it now and buy later?",
            answer:
              "Yes. You can design and preview first, then return to unlock HD only when you are fully happy with the result.",
          },
          {
            question: "What if I need a quick gift turnaround?",
            answer: "This works well for same-day gifting because checkout and HD download are instant.",
          },
          {
            question: "Can I send a physical print instead of digital only?",
            answer: "Yes. You can choose an unframed print or framed print in checkout after previewing your design.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
