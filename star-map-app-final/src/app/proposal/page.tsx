import Link from "next/link";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import OccasionLinks from "@/components/OccasionLinks";
import OccasionStorySection from "@/components/OccasionStorySection";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import ProductSchema from "@/components/ProductSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import {
  PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS,
  PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS,
  getPrintDeliveryEstimateExampleLine,
  getPrintUrgentHdUpsellLine,
} from "@/lib/commerceFacts";
import {
  buildFramedHdCheckoutHref,
  buildStandardGiftPreviewIntents,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getGiftLadderIntro,
} from "@/lib/moneyPageGiftCheckout";
import {
  buildPrintEditorCheckoutHref,
  getFramedHdBundlePriceLine,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/proposal", label: "Wedding & Proposal" },
];

const pageTitle = "Wedding & Proposal Star Map Gift | Exact Sky | StarMapCo";
const pageDescription =
  "Turn the proposal moment — or the wedding night — into a timeless keepsake with a custom star map that matches the exact sky. Free preview, then framed + HD, poster, or HD digital.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: `${siteUrl}/proposal` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${siteUrl}/proposal`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const proposalFaqItems = [
  {
    question: "Can I create a star map for the proposal night?",
    answer:
      "Yes. Enter the proposal date and location to generate an astronomically accurate map of the night sky from that moment — the map shows that exact sky.",
  },
  {
    question: "Can I use the wedding ceremony instead?",
    answer:
      "Yes. Create a wedding star map that captures the exact sky from your wedding night or ceremony date. Use the venue city or exact coordinates so the map matches the ceremony.",
  },
  {
    question: "Is a star map a good engagement or wedding gift?",
    answer:
      "Yes. A star map captures the exact night sky from the proposal, making it a meaningful, personalized engagement gift for couples and families. Couples, parents, and wedding parties also use it for the wedding night, first anniversary, or vow renewal.",
  },
  {
    question: "Do I need the exact proposal or ceremony time?",
    answer:
      "Exact time is optional. Date plus city or venue still produces an accurate, beautiful sky — add time if you want Moon and planet placement precise.",
  },
  {
    question: "Can I include names and a location line?",
    answer:
      "Yes. Add a custom location line, names, and a dedication in the editor before you unlock the final file or print.",
  },
  {
    question: "Which gift format fits a proposal or wedding best?",
    answer:
      "Recommended presentation is framed print + HD digital for a wall-ready gift plus an HD file. HD digital alone works when you need a same-night or long-distance gift.",
  },
  {
    question: "Is the preview really free?",
    answer:
      "Yes. You can create and view your map preview without an account or payment, and only pay if you choose a format.",
  },
  {
    question: "How long does delivery take?",
    answer: `${getPrintDeliveryEstimateExampleLine()} ${getPrintUrgentHdUpsellLine()}`,
  },
] as const;

export default function ProposalPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("proposal-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("proposal");
  const tiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
  );
  const schemaCurrency = (tiers.single.currency || "USD").toUpperCase();
  const productOffers = [
    {
      name: "HD digital download",
      price: (tiers.single.amountCents / 100).toFixed(2),
      priceCurrency: schemaCurrency,
      url: `${siteUrl}/editor?mode=quick&source=proposal-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=proposal-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=proposal-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <LandingViewTracker source="occasion-proposal" />
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Wedding &amp; Proposal Star Map Gift
        </h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Turn the proposal moment into a timeless keepsake with a custom star map that matches the exact
          sky — or give their wedding day a place on the wall with the sky above the ceremony. Preview free,
          then choose framed print, poster, or HD digital.
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
        <ul className="mx-auto flex max-w-sm flex-col gap-1.5 text-left text-sm text-white/85 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Free preview — no payment required
          </li>
          <li className="hidden items-center gap-1.5 text-white/35 sm:flex" aria-hidden="true">
            ·
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Secure Stripe checkout
          </li>
          <li className="hidden items-center gap-1.5 text-white/35 sm:flex" aria-hidden="true">
            ·
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-amber-300" aria-hidden="true">
              ✓
            </span>
            Same design unlocks framed, unframed, or HD
          </li>
        </ul>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/editor?mode=quick&source=proposal-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "proposal-hero-canvas",
              variant: "canvas_wrap",
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview canvas wrap
          </Link>
          <InstantHdHeroExtras source="proposal-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="proposal-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
        <p className="text-xs text-neutral-300 sm:text-sm">
          Made to order in {PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS} · U.S. transit typically{" "}
          {PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS} ·{" "}
          <Link
            href="/shipping"
            className="underline decoration-white/30 underline-offset-2 hover:text-white"
          >
            Delivery ranges by destination
          </Link>
        </p>
      </header>

      <GiftFormatLadder
        sourcePrefix="proposal-ladder"
        heading="Wedding & proposal gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "a wedding or proposal" })}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="proposal"
        title="Start your wedding or proposal preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-proposal-framed-hd"
        title="Ready to capture that shared night?"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-proposal-preview"
        secondaryPlan="preview"
      />

      <OccasionStorySection
        heading="A wedding star map for the day they said yes"
        paragraphs={[
          "Celebrate the engagement with a star map that captures the exact sky from the proposal night. Personal, romantic, and ready to print — or create a wedding star map that captures the exact sky from your wedding night or ceremony date. Either way, the gift feels connected to the couple rather than picked from a shelf.",
          "Common date ideas include the proposal night, the first date, or the day you decided on forever. For a wedding map, start with the ceremony venue and planned time; you can also choose the proposal location if that moment is more meaningful to the couple. Add names and a short line to make it feel like a framed promise.",
          "Give their wedding day a place on the wall. Couples, parents, and the wedding party use the same design for the wedding night, first anniversary, or vow renewal — a shared night kept as a framed keepsake. Preview free with no account, then choose framed print, unframed print, or HD digital from the same approved design.",
          "Make a moment into a keepsake. Start with the free preview, refine the title and dedication, and only decide on a format once the wording feels right. Need the ceremony-focused wedding path with design examples? Continue on the dedicated wedding page.",
        ]}
        ctaHref="/editor?mode=quick&source=occasion-proposal-story-preview&utm_source=site&utm_medium=landing&utm_campaign=proposal_story"
        ctaLabel="Start free preview"
        artwork={[
          {
            src: "/examples/example-anniversary-heirloom.webp",
            alt: "Proposal star map example in Heirloom style",
          },
          {
            src: "/home-mockups/gallery-framed-light-wood.png",
            alt: "Framed wedding star map with light wood frame",
          },
          {
            src: "/home-mockups/offer-framed-print.webp",
            alt: "Framed wedding and proposal star map print mockup",
            aspect: "16:9",
          },
        ]}
        bullets={[
          "Exact sky from the proposal night or wedding ceremony date",
          "Names, location line, and dedication in the free editor preview",
          "Framed + HD for a ready-to-hang gift; poster or HD digital as alternatives",
          "Works for engagement gifts, wedding party gifts, and vow renewals",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Choose the wedding date and venue — or the proposal date and place</li>
          <li>Add the couple’s names and a short dedication, such as “Our beginning”</li>
          <li>Preview the design together or keep it a surprise</li>
          <li>Choose framed print, unframed print, or HD digital from the same design</li>
        </ol>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-amber-700 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
          <Link
            href="/wedding"
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            Full wedding gift page
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="proposal-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose how you want to keep the proposal or wedding map"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus the HD file. Canvas adds a premium wall option between poster and framed.`}
        sourcePrefix="proposal-format"
      />
      <FramedProofSection
        heading="See the wedding or proposal gift framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="proposal-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related gift occasions</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
          <Link href="/anniversary" className="text-amber-700 underline hover:text-amber-800">
            Anniversary star maps
          </Link>
          <Link href="/star-map-for/engagement" className="text-amber-700 underline hover:text-amber-800">
            Engagement star maps
          </Link>
          <Link href="/gifts/wedding-star-map" className="text-amber-700 underline hover:text-amber-800">
            Wedding gift catalogue
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
        intro="Preview for free first. Upgrade only once the wording, date, and layout feel right."
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
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your wedding or proposal order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Wedding & proposal gift confidence"
        intro="Decisions get clearer once the wording, frame plan, and whether you want the finished framed route are already clear."
      />
      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Wedding &amp; proposal star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {proposalFaqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="Wedding & Proposal Star Map"
        description="Personalized wedding and proposal star map showing the exact night sky from your milestone date and location. Order a framed print, unframed poster, or HD digital download."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
      />
      <FaqSchema items={[...proposalFaqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
