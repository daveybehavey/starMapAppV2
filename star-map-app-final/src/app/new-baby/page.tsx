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
  { href: "/new-baby", label: "New Baby" },
];

const pageTitle = "New Baby Star Map | Birth Night Sky Gift | StarMapCo";
const pageDescription =
  "The sky on the night they arrived, with their name, date and city. A nursery keepsake that grows with them. Free preview, no account — then framed + HD, poster, or HD digital.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: `${siteUrl}/new-baby` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${siteUrl}/new-baby`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const newBabyFaqItems = [
  {
    question: "Is a star map a good newborn gift?",
    answer:
      "Yes. A birth-night star map is a thoughtful keepsake that captures the sky exactly as it appeared when they arrived — suited for baby showers, hospital visits, and first birthdays.",
  },
  {
    question: "Can I include the baby’s name on the print?",
    answer:
      "Yes. Add the baby’s name, birth date line, and a short dedication in the editor before checkout. The same design works for framed print, canvas, or HD digital.",
  },
  {
    question: "Do I need the exact birth time?",
    answer:
      "Exact time improves Moon and planet placement, but date plus city or hospital location still produces a beautiful, meaningful nursery print.",
  },
  {
    question: "Which gift format fits a new-parent keepsake best?",
    answer:
      "The premium gift route is framed print + HD digital so the wall art ships ready to hang and parents get an HD file for sharing. Unframed poster lowers the total if they already picked a frame.",
  },
  {
    question: "Is it appropriate as a baby shower gift?",
    answer:
      "Yes, once the baby has arrived. Before the birth you would not yet have the date and time, so many people give it after the birth instead.",
  },
  {
    question: "Why is a birth-night sky map personal?",
    answer:
      "A sky map birthday gift is a personal way to commemorate the exact night sky from a birth date — the sky on the day someone was born is truly one of a kind.",
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

export default function NewBabyPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("new-baby-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("new-baby");
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
      url: `${siteUrl}/editor?mode=quick&source=new-baby-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=new-baby-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=new-baby-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <LandingViewTracker source="occasion-new-baby" />
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">New Baby Star Map Gift</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          A new baby star map for their first chapter — the sky on the night they arrived, with their name,
          date and city. A nursery keepsake that grows with them. Preview free, no account, then choose
          framed print, poster, or HD digital.
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
            href="/editor?mode=quick&source=new-baby-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "new-baby-hero-canvas",
              variant: "canvas_wrap",
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview canvas wrap
          </Link>
          <InstantHdHeroExtras source="new-baby-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="new-baby-hero-instant" showButton={false} />
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
        sourcePrefix="new-baby-ladder"
        heading="New baby gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "a new baby" })}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="new-baby"
        title="Start your new baby preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-new-baby-framed-hd"
        title="Remember the day their world began"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-new-baby-preview"
        secondaryPlan="preview"
      />

      <OccasionStorySection
        heading="A keepsake they grow into, not out of"
        paragraphs={[
          "Birth announcements list the weight, the length and the time. A new baby star map adds something those numbers cannot: the sky that was overhead at the moment a child arrived. It is a quiet, lasting gift for a nursery wall, and it grows up with the child instead of being outgrown like a newborn outfit.",
          "To create one, enter the birth date, the time from the hospital bracelet or birth certificate, and the town where the baby was born. Then add a title. Welcome, Oliver works well, as does the full name with the date and city underneath. Soft parchment tones like our Heirloom style suit a nursery, while a dark night style feels right for an older child's room.",
          "This is a gift that new parents appreciate weeks after the flowers have wilted. Grandparents often order one for their own home as well, so there is a matching map in two places. It also makes a thoughtful baby shower gift if you create it soon after the birth and send it to arrive while the family is settling in.",
          "There is no need to commit before you see it. The StarMapCo preview is free, with no account required. Check the spelling of the name, try a couple of styles, and choose a format only when you are happy. The digital option is useful if you want to share the design right away; a framed print is ready to hang above the crib.",
          "Later on, the map becomes a conversation piece. Children like being told that these were their stars, and many families add a map for each sibling so the set grows over the years. Make a moment into a keepsake — the sky on the day someone was born is truly one of a kind.",
        ]}
        ctaHref="/editor?mode=quick&source=occasion-new-baby-story-preview&utm_source=site&utm_medium=landing&utm_campaign=new-baby_story"
        ctaLabel="Start free preview"
        artwork={[
          {
            src: "/examples/example-new-baby-heirloom.webp",
            alt: "New baby star map example in Heirloom style",
          },
          {
            src: "/examples/example-birthday-noir.webp",
            alt: "Birth night star map example in a dark noir style",
          },
          {
            src: "/printproof/unframed-mockup.jpg",
            alt: "Unframed star map print mockup for a nursery gift",
          },
        ]}
        bullets={[
          "Accurate to the birth date, time, and place they arrived",
          "Title and dedication for name, welcome line, and city",
          "Nursery-ready framed print, unframed poster, canvas, or HD digital",
          "Matching sibling maps in the same style as the family grows",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Confirm the baby’s name, birth date and birthplace with the family</li>
          <li>Add the birth time if the family wants it included, plus a short welcome message</li>
          <li>Choose a style that will still feel at home as the child grows</li>
          <li>Check every detail in the free preview, then choose framed, unframed, or HD digital</li>
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
      <AccuracyAuthorityCard source="new-baby-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose how you want to keep their first sky"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang nursery keepsake plus the HD file. Canvas adds a premium wall option between poster and framed.`}
        sourcePrefix="new-baby-format"
      />
      <FramedProofSection
        heading="See the birth-night gift framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="new-baby-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related gift occasions</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/first-christmas-star-map" className="text-amber-700 underline hover:text-amber-800">
            First Christmas star map
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
          <Link href="/gifts/new-baby-star-map" className="text-amber-700 underline hover:text-amber-800">
            New baby gift catalogue
          </Link>
          <Link href="/blog/birth-star-map" className="text-amber-700 underline hover:text-amber-800">
            Birth star map guide
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
        intro="Preview for free first. Upgrade only once the name, date, and layout feel right."
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
        heading="What your new baby order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="New baby gift confidence"
        intro="Decisions get clearer once the wording, frame plan, and whether you want the finished framed route are already clear."
      />
      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">New baby star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {newBabyFaqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="New Baby Star Map"
        description="Personalized new baby star map showing the exact night sky from the birth date and location. Order a framed print, unframed poster, or HD digital download."
        imageUrl={`${siteUrl}/examples/example-new-baby-heirloom.webp`}
        offers={productOffers}
        offerLandingUrl={`${siteUrl}/new-baby`}
      />
      <FaqSchema items={[...newBabyFaqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
