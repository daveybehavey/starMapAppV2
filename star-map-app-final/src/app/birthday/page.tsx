import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import OccasionLinks from "@/components/OccasionLinks";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import {
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  buildInstantHdPreviewIntents,
  getInstantHdHeroHref,
  getInstantHdPriceLine,
} from "@/lib/digitalGiftCheckout";
import {
  buildFramedHdCheckoutHref,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/birthday", label: "Birthday" },
];

export const metadata: Metadata = {
  title: "Birthday Star Map Generator | StarMapCo",
  description:
    "Birthday star map generator for any date and place—preview the exact night sky free, then choose framed + HD (free shipping at $100+), poster, or instant digital delivery.",
  alternates: { canonical: `${siteUrl}/birthday` },
  openGraph: {
    title: "Birthday Star Map Generator | StarMapCo",
    description:
      "Create a birthday star map from their birth date and location. Free preview, then framed print, unframed print, or HD digital.",
    url: `${siteUrl}/birthday`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function BirthdayPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("birthday-hero-framed-hd");
  const instantHref = getInstantHdHeroHref("birthday-hero-instant");
  const instantPrice = getInstantHdPriceLine();
  const previewIntents = buildInstantHdPreviewIntents("birthday");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Birthday Star Map Generator</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Use our birthday star map generator to capture the exact night sky from their birth date and location—a
          keepsake that feels personal, timeless, and ready to frame.
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
            href={instantHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Instant HD from {instantPrice}
          </Link>
          <Link
            href="/editor?mode=quick&source=birthday-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-neutral-200 underline decoration-white/30 underline-offset-2 transition hover:text-white"
          >
            Free preview only
          </Link>
        </div>
        <p className="text-xs text-neutral-300 sm:text-sm">
          Last-minute?{" "}
          <Link href="/hd-star-map" className="font-semibold text-amber-200 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-100">
            Instant HD funnel
          </Link>
          {" · "}
          Popular bundle: {bundlePriceLine}
        </p>
      </header>

      <GiftFormatLadder
        sourcePrefix="birthday-ladder"
        heading="Birthday gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "birthday" })}
        className="mt-8"
      />

      <PreviewStartForm
        source="birthday"
        title="Start your birthday preview"
        description="Enter the birth date and place — choose instant HD for same-night gifts or framed + HD for a shipped keepsake."
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-birthday-instant-hd"
        title="Party tomorrow?"
        description="Instant HD unlocks right after checkout — no shipping wait."
        buttonLabel="Preview instant HD"
        primaryHref={instantHref}
        primaryPlan="hd_digital"
        secondaryButtonLabel="Framed + HD instead"
        secondaryHref={framedHdHref}
        secondaryPlan="print_framed_hd"
      />

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Why this birthday gift stands out</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Birthdays come every year—but the sky on the night someone was born is one of a kind. Our maps use astronomically
          accurate data to plot that exact sky—constellations, planets, and Moon phase can all be included—so the gift feels
          as unique as they are.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the birth date, time, and location</li>
          <li>Print-ready, high-resolution files for framing or gifting</li>
          <li>Styles that work for any age—clean, elegant, or celebratory</li>
          <li>Optional dedication lines for names, wishes, or a milestone year</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-lg font-semibold text-midnight">Create it in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the birth location (city or hospital)</li>
          <li>Select the birth date (add time if you want to be exact)</li>
          <li>Choose a style and add a dedication line</li>
          <li>Reveal the sky, then choose framed print, unframed print, or HD digital delivery at checkout</li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          Share a preview for free. Once the wording feels right, take the framed route, the unframed route, or instant HD delivery from the same approved design.
        </p>
        <div className="pt-2">
          <Link
            href={framedHdHref}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Preview framed + HD gift
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the birthday delivery format"
        intro={`Most birthday buyers choose framed + HD (${bundlePriceLine}) for a ready-to-hang gift plus an instant file. Unframed lowers the total; HD-only is fastest for same-day gifting.`}
        sourcePrefix="birthday-format"
      />
      <FramedProofSection
        heading="See the birthday map as a finished framed gift"
        intro="Framed is the strongest gift-ready option when you want the final piece to arrive ready to display. Unframed keeps the total lower if you already have a frame plan."
        sourcePrefix="birthday-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">What you get</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Preview and HD export share the same rendering engine, so the final download matches what you see. Toggle
          constellations, glow, labels, and choose fonts to fit their style. The same approved design can stay digital, go unframed, or arrive framed without rebuilding the map.
        </p>
        <div className="flex gap-3 text-sm text-neutral-800">
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only after the wording, date, and style feel right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths are available after preview",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your birthday order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Birthday gift confidence"
        intro="Most buyers decide faster once the wording, frame plan, and whether they want the finished framed route are already settled."
      />

      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Birthday star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Do I need the exact birth time?</h3>
            <p>
              The exact time makes the sky most precise, but you can still create a beautiful birthday star map with just
              the date and location.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Is this good for milestone birthdays?</h3>
            <p>
              Yes. Birthday star maps are popular for 18th, 21st, 30th, 40th, 50th, and other milestone celebrations.
            </p>
          </div>
        </div>
      </section>
      <FaqSchema
        items={[
          {
            question: "Do I need the exact birth time?",
            answer:
              "The exact time makes the sky most precise, but you can still create a beautiful birthday star map with just the date and location.",
          },
          {
            question: "Is this good for milestone birthdays?",
            answer:
              "Yes. Birthday star maps are popular for 18th, 21st, 30th, 40th, 50th, and other milestone celebrations.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
