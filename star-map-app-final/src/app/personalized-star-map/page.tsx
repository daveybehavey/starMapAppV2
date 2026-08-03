import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import { featuredRenderExamples } from "@/lib/galleryExamples";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import {
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  buildFramedHdCheckoutHref,
  buildStandardGiftPreviewIntents,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/personalized-star-map", label: "Personalized star map" },
];

export const metadata: Metadata = {
  title: "Best Personalized Star Map Gift | StarMapCo",
  description:
    "Looking for the best personalized star map gift? Capture any date and place with a free preview, then choose framed print, unframed print, or HD digital delivery.",
  alternates: { canonical: `${siteUrl}/personalized-star-map` },
  openGraph: {
    title: "Best Personalized Star Map Gift | StarMapCo",
    description:
      "A personalized star map gift with names, dates, and locations. Free preview, then framed print, unframed print, or HD digital.",
    url: `${siteUrl}/personalized-star-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function PersonalizedStarMapPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("personalized-star-map-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("personalized-star-map");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Best Personalized Star Map Gift</h1>
        <p className="text-sm text-white/90 sm:text-base">
          A personalized star map gift with names, a date, and a location—the exact night sky from a moment worth framing.
          Framed print + HD digital qualifies for free shipping at checkout.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital delivery</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=personalized-star-map-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Start free preview
          </Link>
          <InstantHdHeroExtras source="personalized-star-map-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="personalized-star-map-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Popular bundle: {bundlePriceLine}</p>
      </header>

      <GiftFormatLadder
        sourcePrefix="personalized-ladder"
        heading="Personalized gift formats"
        intro={getGiftLadderIntro()}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="personalized-star-map"
        title="Start your personalized preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-personalized-star-map-framed-hd"
        title="Ready to preview their night sky?"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-personalized-star-map-preview"
        secondaryPlan="preview"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Make it truly personal</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Add a title, names, and a short dedication line. Choose a style that matches the person or place you are
          celebrating, then approve the same design as a framed print, unframed poster, or HD file.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate night sky based on real astronomical data</li>
          <li>Custom text, fonts, and layout options</li>
          <li>Instant preview so you can fine-tune details</li>
          <li>One preview can flow into framed, unframed, or HD delivery</li>
        </ul>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create a personalized star map</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the date, time, and location</li>
          <li>Add names, a title, and a short message</li>
          <li>Preview the design instantly</li>
          <li>Choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <div className="pt-2">
          <Link
            href={framedHdHref}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Preview framed + HD gift
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="personalized-accuracy-card" />

      <DeliveryFormatModule
        heading="Pick the right format after you preview"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a presentation-ready gift plus an instant file. Unframed lowers the total; canvas adds a premium wall option.`}
        sourcePrefix="personalized-format"
      />
      <FramedProofSection sourcePrefix="personalized-proof" />
      <PhysicalProductGallerySection
        heading="See the physical gift options"
        intro="Room mockups from current StarMapCo artwork so buyers can judge framed and unframed finishes before checkout."
        sourcePrefix="personalized-physical-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-midnight">Recent personalized map examples</h2>
          <p className="text-sm text-neutral-800 sm:text-base">
            These are freshly rendered StarMapCo outputs from the current engine. Start from one of these looks, then adjust fonts, lines, and text.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {featuredRenderExamples.map((item) => (
            <div key={item.src} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              <div className="relative aspect-square">
                <Image
                  src={item.src}
                  alt={item.shortLabel}
                  width={900}
                  height={900}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="border-t border-black/5 px-3 py-2 text-xs font-semibold text-midnight">{item.shortLabel}</div>
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
        intro="Preview first, then pay only when the design feels right. Framed print is the recommended premium presentation, while unframed and HD stay available from the same approved design."
        leftTitle="Checkout and delivery"
        leftPoints={[
          "Secure Stripe checkout",
          "One-time checkout for framed print, unframed print, or HD digital delivery",
          "Instant HD file unlock after successful payment",
        ]}
        rightTitle="Print quality and support"
        rightPoints={[
          "Export up to 6000x6000 resolution",
          "Built for poster-quality prints and framing",
          shippingDisclosure,
          productionReviewTrustPoint,
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
        intro="This is built for gifting quality, not just a quick screenshot. Use this section to confirm the format, shipping, and final review details before checkout."
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Related star map options</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Explore by occasion or browse other formats to find the right fit.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
          <Link href="/custom-night-sky-map" className="text-amber-700 underline hover:text-amber-800">
            Custom night sky map
          </Link>
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star map
          </Link>
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star map
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star map
          </Link>
        </div>
      </section>

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
              Yes. After preview, you can choose framed print, unframed print, or HD digital delivery during checkout. {shippingDisclosure}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">What is the best personalized star map gift?</h3>
            <p>
              The premium gift route is framed print so it arrives ready to display, often paired with HD digital for a
              keepsake file. Orders at $100+ qualify for free shipping. Add{" "}
              <Link href="/shop#merch-addons" prefetch={false} className="text-amber-700 underline hover:text-amber-800">
                custom kiss-cut stickers
              </Link>{" "}
              from the same map for a small add-on gift.
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
            answer: `Yes. After preview, you can choose framed print, unframed print, or HD digital delivery during checkout. ${shippingDisclosure}`,
          },
          {
            question: "What is the best personalized star map gift?",
            answer:
              "The premium gift route is framed print so it arrives ready to display, often with HD digital included. Orders at $100+ qualify for free shipping. Custom kiss-cut stickers from the same map work well as a small add-on gift.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
