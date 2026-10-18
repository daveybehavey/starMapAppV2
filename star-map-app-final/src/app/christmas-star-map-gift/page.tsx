import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
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
import { buildFramedHdCheckoutHref, getGiftLadderIntro } from "@/lib/moneyPageGiftCheckout";
import ChristmasOrderByTable from "@/components/ChristmasOrderByTable";
import {
  getChristmasDigitalPitchLine,
  getChristmasLandingPromo,
  getChristmasOrderBySummaryLines,
  getChristmasPromoCodesFaqAnswer,
  resolveChristmasCampaignNowMs,
} from "@/lib/christmasCampaign";
import { LOVE_IT_GUARANTEE_LINE, getLoveItGuaranteeFaq } from "@/lib/loveItGuarantee";
import { getPrintDeliveryTimingFaqAnswerShort } from "@/lib/commerceFacts";
import type { Metadata } from "next";

export const revalidate = 86400;

type PageProps = {
  searchParams?: Promise<{ christmas_now?: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/christmas-star-map-gift", label: "Christmas" },
];

const christmasTitle = "Christmas Star Map Gift | Order-By Dates | StarMapCo";
const christmasDescription =
  "Give a personalized Christmas star map of a meaningful night sky. Free preview — framed, poster, or instant HD. See Christmas order-by dates for US, Canada, and worldwide.";

export const metadata: Metadata = {
  title: christmasTitle,
  description: christmasDescription,
  alternates: { canonical: `${siteUrl}/christmas-star-map-gift` },
  openGraph: {
    title: christmasTitle,
    description: christmasDescription,
    url: `${siteUrl}/christmas-star-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const loveItFaq = getLoveItGuaranteeFaq();

export default async function ChristmasStarMapGiftPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const clockMs = resolveChristmasCampaignNowMs({ override: params.christmas_now });
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("christmas-hero-framed-hd");
  const instantHref = getInstantHdHeroHref("christmas-hero-instant");
  const instantPrice = getInstantHdPriceLine();
  const previewIntents = buildInstantHdPreviewIntents("christmas");
  const orderByLines = getChristmasOrderBySummaryLines();
  const landingPromo = getChristmasLandingPromo(clockMs);
  const digitalPitch = getChristmasDigitalPitchLine(instantPrice);

  const faqItems = [
    {
      question: "What are the Christmas order-by dates?",
      answer: `${orderByLines.join(" ")} Dates are buffered estimates for standard shipping; they are not guarantees.`,
    },
    {
      question: "Do Christmas discount codes apply to HD digital?",
      answer: getChristmasPromoCodesFaqAnswer(),
    },
    {
      question: "What if I miss the print cutoff?",
      answer: `Choose the ${instantPrice} instant HD digital file — ready to send the same day, even at the last minute.`,
    },
    {
      question: "How long does print delivery take?",
      answer: getPrintDeliveryTimingFaqAnswerShort(),
    },
    {
      question: loveItFaq.question,
      answer: loveItFaq.answer,
    },
    {
      question: "Can I use any date for a Christmas star map?",
      answer:
        "Yes. Common date ideas include a first date, wedding night, a child's birth, or another shared moment — the map shows that exact sky, then arrives as a Christmas gift.",
    },
    {
      question: "Is the preview free?",
      answer: "Yes. Create and view your map without an account or payment, then choose framed, unframed, or HD digital when you are ready.",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Christmas Star Map Gift</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Capture a meaningful night sky as a Christmas keepsake — preview free, then choose framed print,
          poster, or instant HD digital delivery.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">
            Framed print
          </span>
          <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1">
            Unframed print
          </span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
            HD digital delivery
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href={instantHref}
            data-digital-offer
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Instant HD from {instantPrice}
          </Link>
          <Link
            href="/editor?mode=quick&source=christmas-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-neutral-200 underline decoration-white/30 underline-offset-2 transition hover:text-white"
          >
            Free preview only
          </Link>
        </div>
        <InstantHdHeroExtras source="christmas-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
      </header>

      <section
        className="mt-8 space-y-3 rounded-3xl border border-amber-200/40 bg-amber-50/90 p-6 shadow-xl shadow-black/10"
        data-testid="christmas-order-by-box"
        data-christmas-landing-phase={landingPromo.phase}
        data-christmas-promo-code={landingPromo.promoCode ?? ""}
      >
        <h2 className="text-midnight text-lg font-semibold">{landingPromo.heading}</h2>
        {landingPromo.discountLine ? (
          <p className="text-sm font-semibold text-midnight sm:text-base">{landingPromo.discountLine}</p>
        ) : null}
        {landingPromo.digitalExcludedNote ? (
          <p className="text-xs text-neutral-700 sm:text-sm">{landingPromo.digitalExcludedNote}</p>
        ) : null}
        {landingPromo.showOrderBy ? (
          <>
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800">
              {orderByLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ChristmasOrderByTable />
          </>
        ) : null}
        {landingPromo.showDigitalPitch ? (
          <p className="text-sm text-neutral-800" data-digital-offer>{digitalPitch}</p>
        ) : null}
        <p className="text-xs text-neutral-700">{LOVE_IT_GUARANTEE_LINE}</p>
      </section>

      <GiftFormatLadder
        sourcePrefix="christmas-ladder"
        heading="Christmas gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "Christmas" })}
        className="mt-8"
      />

      <PreviewStartForm
        source="christmas"
        title="Start your Christmas preview"
        description="Enter a meaningful date and place — choose instant HD for last-minute gifts or framed + HD for a shipped keepsake."
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-christmas-instant-hd"
        title="Need it before Christmas?"
        description={`Instant HD from ${instantPrice} unlocks right after checkout — no shipping wait.`}
        buttonLabel="Preview instant HD"
        primaryHref={instantHref}
        primaryPlan="hd_digital"
        secondaryButtonLabel="Framed + HD instead"
        secondaryHref={framedHdHref}
        secondaryPlan="print_framed_hd"
      />

      <section className="mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Why a Christmas star map works</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          Christmas gifts get personal when they capture a shared night — a first date, a wedding, a birth, or
          another once-in-a-lifetime sky. Preview the exact map free, then choose the delivery format that
          still makes Christmas for your shipping country.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Astronomically accurate to the date, time, and location you choose</li>
          <li>Framed + HD for a ready-to-hang gift with an instant backup file</li>
          <li>Poster option when you already have a frame plan</li>
          <li>Instant HD for last-minute and international gifting</li>
        </ul>
      </section>

      <DeliveryFormatModule
        heading="Choose the Christmas delivery format"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) when you still have time before the order-by date. Unframed is the lower-cost physical option; HD-only is fastest after cutoffs.`}
        sourcePrefix="christmas-format"
      />
      <FramedProofSection
        heading="See the Christmas map as a finished framed gift"
        intro="Framed is the ready-to-display gift option when shipping timing still works. Unframed keeps the total lower if you already have a frame plan."
        sourcePrefix="christmas-proof"
      />

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only after the wording, date, and style feel right — and check Christmas order-by dates for prints."
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
          LOVE_IT_GUARANTEE_LINE,
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your Christmas order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Christmas gift confidence"
        intro="Decide with the preview first, then choose framed, poster, or instant HD based on shipping timing."
      />

      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Christmas star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <FaqSchema items={faqItems.map((item) => ({ question: item.question, answer: item.answer }))} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
