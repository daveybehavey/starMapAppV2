import StorefrontProductSchema from "@/components/StorefrontProductSchema";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import ChristmasOrderByTable from "@/components/ChristmasOrderByTable";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import OccasionLinks from "@/components/OccasionLinks";
import OccasionStorySection from "@/components/OccasionStorySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import {
  getChristmasDigitalPitchLine,
  getChristmasLandingPromo,
  getChristmasOrderBySummaryLines,
  getChristmasPromoCodesFaqAnswer,
  resolveChristmasCampaignNowMs,
} from "@/lib/christmasCampaign";
import { getPrintDeliveryTimingFaqAnswerShort } from "@/lib/commerceFacts";
import {
  buildInstantHdPreviewIntents,
  getInstantHdHeroHref,
  getInstantHdPriceLine,
} from "@/lib/digitalGiftCheckout";
import { LOVE_IT_GUARANTEE_LINE, getLoveItGuaranteeFaq } from "@/lib/loveItGuarantee";
import { buildFramedHdCheckoutHref, getGiftLadderIntro } from "@/lib/moneyPageGiftCheckout";
import {
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import type { Metadata } from "next";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/first-christmas-star-map", label: "First Christmas" },
];

const pageTitle = "First Christmas Star Map Gift | Baby & Couples | StarMapCo";
const pageDescription =
  "Baby’s first Christmas or our first Christmas together — a personalized star map of a meaningful night sky. Free preview, then framed print, poster, or HD digital.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: `${siteUrl}/first-christmas-star-map` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${siteUrl}/first-christmas-star-map`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const loveItFaq = getLoveItGuaranteeFaq();

export default async function FirstChristmasStarMapPage() {
  const clockMs = resolveChristmasCampaignNowMs();
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("first-christmas-hero-framed-hd");
  const instantHref = getInstantHdHeroHref("first-christmas-hero-instant");
  const instantPrice = getInstantHdPriceLine();
  const previewIntents = buildInstantHdPreviewIntents("first-christmas");
  const orderByLines = getChristmasOrderBySummaryLines();
  const landingPromo = getChristmasLandingPromo(clockMs);
  const digitalPitch = getChristmasDigitalPitchLine(instantPrice);

  const faqItems = [
    {
      question: "What date should I use for a baby’s first Christmas star map?",
      answer:
        "Many families use the birth date and the town where the baby arrived, or the first night home. You can also use Christmas Eve or Christmas Day over the family home if that is the moment you want to keep.",
    },
    {
      question: "What date works for our first Christmas as a couple?",
      answer:
        "Common choices include the night you met, the night you moved in, your wedding date, or the sky on your first Christmas Eve together. Any meaningful date and place works — the map shows that exact sky.",
    },
    {
      question: "Can I add a title like Our First Christmas?",
      answer:
        "Yes. The editor lets you add a title, subtitle, and dedication line — for example Our First Christmas with names and the town underneath.",
    },
    {
      question: "What are the Christmas order-by dates?",
      answer: `${orderByLines.join(" ")} Dates are buffered estimates for standard shipping; they are not guarantees.`,
    },
    {
      question: "Do Christmas discount codes apply to HD digital?",
      answer: getChristmasPromoCodesFaqAnswer(clockMs),
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
      question: "Is the preview free?",
      answer:
        "Yes. Create and view your map without an account or payment, then choose framed, unframed, or HD digital when you are ready.",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          First Christmas Star Map Gift
        </h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Baby’s first Christmas or our first Christmas together — capture a meaningful night sky as a
          Christmas keepsake. For a new arrival, keep the sky on the night they arrived; for a couple, keep a
          shared night from a first home or the holiday itself. Preview free, then choose framed print,
          poster, or HD digital for your shipping country.
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
            HD digital from {instantPrice}
          </Link>
          <Link
            href="/editor?mode=quick&source=first-christmas-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-neutral-200 underline decoration-white/30 underline-offset-2 transition hover:text-white"
          >
            Free preview only
          </Link>
        </div>
        <InstantHdHeroExtras source="first-christmas-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
      </header>

      <section
        className="mt-8 space-y-3 rounded-3xl border border-amber-200/40 bg-amber-50/90 p-6 shadow-xl shadow-black/10"
        data-testid="first-christmas-order-by-box"
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
          <p className="text-sm text-neutral-800" data-digital-offer>
            {digitalPitch}
          </p>
        ) : null}
        <p className="text-xs text-neutral-700">{LOVE_IT_GUARANTEE_LINE}</p>
      </section>

      <GiftFormatLadder
        sourcePrefix="first-christmas-ladder"
        heading="First Christmas gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "a first Christmas" })}
        className="mt-8"
      />

      <PreviewStartForm
        source="first-christmas"
        title="Start your first Christmas preview"
        description="Enter a birth night, a first Christmas together, or another meaningful date and place — then choose HD digital or framed + HD."
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-first-christmas-instant-hd"
        title="Need it before Christmas?"
        description={`HD digital from ${instantPrice} unlocks right after checkout — no shipping wait.`}
        buttonLabel="Preview HD digital"
        primaryHref={instantHref}
        primaryPlan="hd_digital"
        secondaryButtonLabel="Framed + HD instead"
        secondaryHref={framedHdHref}
        secondaryPlan="print_framed_hd"
      />

      <OccasionStorySection
        heading="Two firsts under the same sky idea"
        paragraphs={[
          "A first Christmas asks for something quieter than a gadget and more lasting than a sweater. Christmas gifts get personal when they capture a shared night. For a new baby, the sky on the night they arrived — or the first Christmas Eve in the family home — becomes a nursery keepsake with their name and date. For a couple, Our First Christmas can mark the night you moved in, the night you met, or the holiday sky over your first shared address — the map shows that exact sky.",
          "Remember the day their world began, or the night your first Christmas together started. StarMapCo uses the same editor flow either way: enter the date and place, generate a free preview, add a title and dedication, then choose framed print, unframed print, or HD digital. Soft parchment styles suit a nursery wall; a deep navy look suits a living room or bedroom gift.",
          "If print order-by dates still work for your country, framed + HD arrives as a ready-to-hang piece with the HD file as backup. If you are past a print cutoff, HD digital unlocks right after payment so the gift can still land before Christmas.",
          "Make a moment into a keepsake. Start with the free preview — there is no account to create and nothing to pay to see the map. Check the wording, try a style, and only decide on a format once it feels like the night you meant to keep. The sky on the day someone was born is truly one of a kind; so is the sky above a couple’s first Christmas.",
        ]}
        ctaHref="/editor?mode=quick&source=occasion-first-christmas-story-preview&utm_source=site&utm_medium=landing&utm_campaign=first_christmas_story"
        ctaLabel="Start free preview"
        artwork={[
          {
            src: "/examples/example-new-baby-heirloom.webp",
            alt: "Baby’s first Christmas star map example in Heirloom style",
          },
          {
            src: "/examples/example-anniversary-heirloom.webp",
            alt: "Couple’s first Christmas star map example",
          },
          {
            src: "/home-mockups/offer-framed-print.webp",
            alt: "Framed first Christmas star map print mockup",
            aspect: "16:9",
          },
        ]}
        bullets={[
          "Works for baby’s first Christmas or a couple’s first Christmas together",
          "Accurate to the date, time, and location you enter",
          "Title and dedication lines for names, Our First Christmas, or a short welcome",
          "Same design unlocks framed print, unframed print, or HD digital",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the place — hospital town, first home, or family Christmas address</li>
          <li>Select the date (birth night, first Christmas Eve, or another shared moment)</li>
          <li>Add a title such as Our First Christmas or the baby’s name</li>
          <li>Reveal the sky, then choose framed print, unframed print, or HD digital</li>
        </ol>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-amber-700 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/how-personalized-star-map-works"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            How the map works
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose the first Christmas delivery format"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) when you still have time before the order-by date. Unframed is the lower-cost physical option; HD-only is fastest after cutoffs.`}
        sourcePrefix="first-christmas-format"
      />
      <FramedProofSection
        heading="See the first Christmas map as a finished framed gift"
        intro="Framed is the ready-to-display gift option when shipping timing still works. Unframed keeps the total lower if you already have a frame plan."
        sourcePrefix="first-christmas-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related Christmas and family gifts</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/christmas-star-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Christmas star map gift
          </Link>
          <Link href="/new-baby" className="text-amber-700 underline hover:text-amber-800">
            New baby star map
          </Link>
          <Link href="/gifts/new-baby-star-map" className="text-amber-700 underline hover:text-amber-800">
            New baby gift catalogue
          </Link>
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
          <Link
            href="/how-personalized-star-map-works"
            className="text-amber-700 underline hover:text-amber-800"
          >
            How a personalized star map works
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only after the wording, date, and style feel right — and check Christmas order-by dates for prints."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "HD digital download after payment",
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
        heading="What your first Christmas order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="First Christmas gift confidence"
        intro="Decide with the preview first, then choose framed, poster, or HD digital based on shipping timing."
      />

      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">First Christmas star map FAQ</h2>
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
      <StorefrontProductSchema name="First Christmas star map gift" siteUrl={siteUrl} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
