import Link from "next/link";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FaqSchema from "@/components/FaqSchema";
import FramedProofSection from "@/components/FramedProofSection";
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
  buildPrintEditorCheckoutHref,
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
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/anniversary", label: "Anniversary" },
];

const anniversaryTitle = "Anniversary Star Map Gift | Your Night Sky | StarMapCo";
const anniversaryDescription =
  "The exact sky from your first date, wedding or engagement night. Free preview, no account. HD from $9; framed + HD with free shipping.";

export const metadata: Metadata = {
  title: anniversaryTitle,
  description: anniversaryDescription,
  alternates: { canonical: `${siteUrl}/anniversary` },
  openGraph: {
    title: anniversaryTitle,
    description: anniversaryDescription,
    url: `${siteUrl}/anniversary`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const anniversaryFaqItems = [
  {
    question: "What date should I use for an anniversary star map?",
    answer:
      "Common date ideas include your wedding date or the night you first met. Any meaningful date works — anniversaries, first dates, and engagements are all solid options.",
  },
  {
    question: "Is this a good couples gift?",
    answer:
      "Yes. A personalized anniversary star map is a thoughtful couples gift because it captures a shared moment unique to your relationship.",
  },
  {
    question: "Can I include the exact time of our wedding or first date?",
    answer:
      "Yes. Adding a time makes the star positions even more precise — the Moon, planets, and constellations shift during the night. If you do not know the exact time, just the date and location still produces a beautiful, accurate map.",
  },
  {
    question: "How far back can anniversary dates go?",
    answer:
      "The generator works for any date — whether your milestone was last year or decades ago. You can recreate the sky from a first date in 1985 just as easily as one from last summer.",
  },
  {
    question: "Can I add our names and a personal message?",
    answer:
      "Yes. The editor lets you add a title, both names, a date line, and a short dedication. You can also choose fonts and styles that match your home decor.",
  },
  {
    question: "Is the star map astronomically accurate?",
    answer:
      "Yes. The map is generated from real astronomical data — not a stock illustration — so every star, constellation, and planet position matches your specific date, time, and location.",
  },
  {
    question: "What format is best for an anniversary gift?",
    answer:
      "The premium gift route is the framed print bundled with HD digital — the finished piece arrives ready to hang and the digital file is available instantly. Unframed print is a lower-cost option if you already have a frame in mind.",
  },
  {
    question: "Is the preview really free?",
    answer:
      "Yes. You can create and view your map preview without an account or payment, and only pay if you choose a format.",
  },
] as const;

export default function AnniversaryPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const framedHdHref = buildFramedHdCheckoutHref("anniversary-hero-framed-hd");
  const previewIntents = buildStandardGiftPreviewIntents("anniversary");
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
      url: `${siteUrl}/editor?mode=quick&source=anniversary-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=anniversary-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=anniversary-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Personalized Anniversary Star Map</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          The stars from the night your story began, set to your date, time and city. Preview free with no
          account, then choose HD, print or framed.
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
            href="/editor?mode=quick&source=anniversary-hero-preview"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={buildPrintEditorCheckoutHref({
              source: "anniversary-hero-canvas",
              variant: "canvas_wrap",
            })}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Preview canvas wrap
          </Link>
          <InstantHdHeroExtras source="anniversary-hero-instant" showFunnelLink={false} />
        </div>
        <InstantHdHeroExtras source="anniversary-hero-instant" showButton={false} />
        <p className="text-xs text-neutral-300 sm:text-sm">Framed + HD bundle: {bundlePriceLine}</p>
      </header>

      <GiftFormatLadder
        sourcePrefix="anniversary-ladder"
        heading="Anniversary gift formats"
        intro={getGiftLadderIntro({ occasionLabel: "anniversary" })}
        includeCanvas
        className="mt-8"
      />

      <PreviewStartForm
        source="anniversary"
        title="Start your anniversary preview"
        description={getFramedHdEditorOpenDescription(bundlePriceLine)}
        intentOptions={previewIntents}
      />
      <StickyCtaBar
        source="sticky-anniversary-framed-hd"
        title="Ready to see your anniversary sky?"
        description={getFramedHdGiftCtaLine()}
        buttonLabel="Preview framed + HD"
        primaryHref={framedHdHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Free preview only"
        secondaryHref="/editor?mode=quick&source=sticky-anniversary-preview"
        secondaryPlan="preview"
      />

      <OccasionStorySection
        heading="The night you keep coming back to"
        paragraphs={[
          "Every couple has a night they come back to. Maybe it was the first date that ran three hours past closing time, the walk home after the proposal, or the evening you signed the lease on a too-small first apartment. The stars above you that night were in one exact arrangement, and they will never sit quite that way over that spot again. An anniversary star map captures that arrangement and turns it into something you can hang on the wall.",
          "With StarMapCo you enter a date, a time if you know it, and a place. The map is calculated for that moment, then set in a design you choose, with a title and a short line of text such as your names or the words you said that night. The result is not a generic constellation poster; it is the sky that belonged to the two of you.",
          "Anniversaries reward thought more than price. A star map says you remembered the date, you remembered where you were, and you wanted the memory to outlast the dinner reservation. It works for a first anniversary as easily as a fortieth, and it pairs naturally with a handwritten card.",
          "Start with the free preview. There is no account to create and nothing to pay to see your map. Adjust the title, try a warm parchment style like our Heirloom design or a deep navy look, and only decide on a format once it feels right. You can choose an instant digital file to print yourself, an unframed print, or a framed print that arrives ready to give.",
          "If the anniversary is close, the digital option means you can still give something personal tonight. If you have a little time, a framed print turns the moment into a piece for the living room or bedroom that you will both walk past every day.",
        ]}
        ctaHref="/editor?mode=quick&source=occasion-anniversary-story-preview&utm_source=site&utm_medium=landing&utm_campaign=anniversary_story"
        ctaLabel="Create your free preview"
        artwork={[
          {
            src: "/examples/example-anniversary-heirloom.webp",
            alt: "Anniversary star map example in Heirloom style",
          },
          {
            src: "/home-mockups/gallery-framed-light-wood.png",
            alt: "Framed anniversary star map with light wood frame",
          },
          {
            src: "/home-mockups/offer-framed-print.png",
            alt: "Framed anniversary star map print mockup",
          },
        ]}
        bullets={[
          "Accurate to the date, time, and location of your anniversary",
          "Print-ready, high-resolution files for framing or gifting",
          "Elegant styles that feel timeless—perfect for a living room or bedroom wall",
          "Optional dedication lines for names, vows, or the milestone year",
        ]}
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Make yours in minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Enter the anniversary location (city or venue)</li>
          <li>Select the anniversary date (add time if you want to be exact)</li>
          <li>Choose a style and add your dedication line</li>
          <li>
            Reveal the sky, then choose framed print, unframed print, or HD digital delivery at checkout
          </li>
        </ol>
        <p className="text-sm text-neutral-800 sm:text-base">
          Share a preview for free. Once the wording feels right, take the framed route, the unframed route,
          or instant HD delivery from the same approved design.
        </p>
        <div className="pt-2">
          <Link
            href={framedHdHref}
            className="text-midnight focus:ring-amber-700 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Preview framed + HD gift
          </Link>
        </div>
      </section>
      <AccuracyAuthorityCard source="anniversary-accuracy-card" />

      <DeliveryFormatModule
        heading="Choose how you want to keep the anniversary map"
        intro={`Recommended presentation is framed + HD (${bundlePriceLine}) for a ready-to-hang keepsake plus an instant file. Canvas adds a premium wall option between poster and framed.`}
        sourcePrefix="anniversary-format"
      />
      <FramedProofSection
        heading="See how the anniversary gift looks framed"
        intro="The preview lets you refine the typography and layout first. Framed is the premium route when you want the finished piece to arrive ready to display."
        sourcePrefix="anniversary-proof"
      />

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">What you get</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          The preview and HD export use the same rendering engine—what you see is what you download. Toggle
          constellations, glow, labels, and choose fonts to match your style. The same approved design can
          stay digital, go unframed, or arrive framed without rebuilding the map.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/wedding" className="text-amber-700 underline hover:text-amber-800">
            Wedding star maps
          </Link>
          <Link href="/birthday" className="text-amber-700 underline hover:text-amber-800">
            Birthday star maps
          </Link>
          <Link href="/star-map-generator" className="text-amber-700 underline hover:text-amber-800">
            Star map generator
          </Link>
          <Link href="/personalized-star-map" className="text-amber-700 underline hover:text-amber-800">
            Personalized star map
          </Link>
          <Link href="/night-sky-map-gift" className="text-amber-700 underline hover:text-amber-800">
            Night sky map gift
          </Link>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only once the wording, date, and layout feel right."
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
        heading="What your anniversary order includes"
        intro="This is the handoff from preview to the final keepsake."
      />
      <RevenueTrustModule
        heading="Anniversary gift confidence"
        intro="Decisions get clearer once the wording, frame plan, and whether you want the finished framed route are already clear."
      />
      <OccasionLinks />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Anniversary star map FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {anniversaryFaqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <ProductSchema
        name="Anniversary Star Map"
        description="Personalized anniversary star map showing the exact night sky from your milestone date and location. Order a framed print, unframed poster, or instant HD digital download."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
      />
      <FaqSchema items={[...anniversaryFaqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
