import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import OccasionLinks from "@/components/OccasionLinks";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/birthday", label: "Birthday" },
];

export const metadata: Metadata = {
  title: "Personalized Birthday Star Map | StarMapCo",
  description:
    "Celebrate a birthday with a personalized star map showing the exact night sky from their special date and place. Choose HD plus unframed and framed print checkout.",
  alternates: { canonical: `${siteUrl}/birthday` },
  openGraph: {
    title: "Personalized Birthday Star Map | StarMapCo",
    description: "Capture the night sky from their birthday with HD plus unframed and framed print options.",
    url: `${siteUrl}/birthday`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function BirthdayPage() {
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Birthday Star Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Mark a birthday with a birthday star map gift showing the exact night sky from their birth date and location. A
          keepsake that feels personal, timeless, and ready to frame.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD digital keepsake</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Unframed print</span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">Framed print</span>
        </div>
      </header>

      <PreviewStartForm source="birthday" />
      <StickyCtaBar
        source="sticky-birthday"
        secondaryButtonLabel="Preview framed birthday print"
        secondaryHref="/editor?mode=quick&source=sticky-birthday-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
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
          <li>Reveal the sky, then choose HD download, unframed print, or framed print at checkout</li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          Share a preview for free. Upgrade once to unlock the HD, watermark-free file for framing.
        </p>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=birthday-cta"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Make their birthday star map
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the birthday delivery format"
        intro="Some buyers want instant HD for same-day gifting. Others want a framed version ready to display. You decide after the preview."
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
          constellations, glow, labels, and choose fonts to fit their style. You can keep it digital or move into
          unframed or framed print checkout without rebuilding the map.
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
          "Physical orders stay in manual review before production starts",
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
        intro="Most buyers decide faster once the wording, print plan, and whether they need the framed version are already settled."
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
