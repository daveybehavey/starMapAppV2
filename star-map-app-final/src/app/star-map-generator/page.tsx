import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import AccuracyAuthorityCard from "@/components/AccuracyAuthorityCard";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import HowToSchema from "@/components/HowToSchema";
import InstantHdHeroExtras from "@/components/InstantHdHeroExtras";
import ProductSchema from "@/components/ProductSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getInstantHdHeroHref, getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const pageUrl = `${siteUrl}/star-map-generator`;
const ogImage = `${siteUrl}/og-default.png`;

const howToSteps = [
  {
    name: "Enter the date, time, and location",
    text: "Open the star map generator and enter the date, time, and place that matter to you — a wedding venue, birth city, or any meaningful moment worldwide.",
    url: `${pageUrl}#generator-step-1`,
  },
  {
    name: "Choose a style, shape, and text layout",
    text: "Pick a visual style, map shape, and label layout in the editor. Add names, a date line, and a short dedication if you want the map to feel gift-ready.",
    url: `${pageUrl}#generator-step-2`,
  },
  {
    name: "Preview the sky instantly",
    text: "Review the calculated night sky for free. Adjust text, colors, or render settings until the design looks right — no payment required for preview.",
    url: `${pageUrl}#generator-step-3`,
  },
  {
    name: "Choose framed print, unframed print, or HD digital delivery",
    text: "When the preview looks right, unlock HD digital delivery for instant download, or order a framed or unframed print shipped from our print partner.",
    url: `${pageUrl}#generator-step-4`,
  },
] as const;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-generator", label: "Star map generator" },
];

export const metadata: Metadata = {
  title: "Free Star Map Generator by Date & Location | StarMapCo",
  description:
    "Free star map generator: preview the exact night sky for any date and location. No account required. Upgrade to framed print, unframed poster, or HD digital when your design is ready.",
  alternates: { canonical: `${siteUrl}/star-map-generator` },
  openGraph: {
    title: "Free Star Map Generator by Date & Location | StarMapCo",
    description:
      "Free star map generator with a live preview for any date and place. Choose framed print, unframed poster, or HD digital after your map looks right.",
    url: `${siteUrl}/star-map-generator`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGeneratorPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const instantHref = getInstantHdHeroHref("star-map-generator-hero-instant");
  const instantPrice = getInstantHdPriceLine();
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
      url: `${siteUrl}/editor?mode=quick&source=generator-schema-digital`,
    },
    ...(printCheckoutEnabled
      ? [
          {
            name: "Unframed print",
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=generator-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            name: "Framed print",
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            url: `${siteUrl}/editor?mode=quick&source=generator-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Free star map generator — night sky by date
        </h1>
        <p className="text-sm text-white/90 sm:text-base">
          Use our free star map generator to preview the exact night sky for any date and location. When it
          looks right, upgrade to framed print, unframed poster, or instant HD — no watermark on paid exports.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/editor?mode=quick&source=star-map-generator-hero-preview"
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href={instantHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Instant HD from {instantPrice}
          </Link>
        </div>
        <InstantHdHeroExtras source="star-map-generator-hero-instant" showButton={false} />
      </header>

      <PreviewStartForm
        source="star-map-generator"
        title="Start your generator preview"
        description="Enter the date and location, then open the editor with the framed path, the unframed path, or a neutral preview-first start."
        intentOptions={[
          {
            label: "Preview framed print",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Use framed when the finished piece should arrive ready to display.",
          },
          {
            label: "Preview unframed print",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Use unframed when you want the physical print with a lower total.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Keep the editor neutral until the design feels right.",
          },
        ]}
      />
      <StickyCtaBar
        source="sticky-star-map-generator"
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-star-map-generator-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Generate a map that is actually accurate</h2>
        <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
          This is not a stock illustration. The map is calculated from real astronomical data so the
          constellations and star positions match your date and location.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Accurate to the minute and precise location</li>
          <li>Instant preview so you can refine details</li>
          <li>Multiple styles and layout options</li>
          <li>The same approved design can stay digital or move into framed or unframed print</li>
        </ul>
        <p className="text-sm text-neutral-800 sm:text-base">
          Want the full breakdown of what accuracy means — and what can still change the result? Read{" "}
          <Link href="/how-accurate-are-star-maps" className="font-semibold text-amber-700 hover:underline">
            how accurate star maps are
          </Link>
          .
        </p>
      </section>
      <AccuracyAuthorityCard source="generator-accuracy-card" />

      <section
        id="how-to-use-generator"
        className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5"
      >
        <h2 className="text-midnight text-lg font-semibold">How to use the star map generator</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li id="generator-step-1">Enter the date, time, and location that matter to you</li>
          <li id="generator-step-2">Choose a style, shape, and text layout</li>
          <li id="generator-step-3">Preview the sky instantly</li>
          <li id="generator-step-4">
            Choose framed print, unframed print, or HD digital delivery at checkout
          </li>
        </ol>
        <div className="pt-2">
          <Link
            href="/editor?mode=quick&source=star-map-generator-cta-framed&checkout=print&print_variant=poster_framed"
            className="text-midnight focus:ring-gold inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-amber-50 focus:outline-none"
          >
            Start with framed print preview
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Popular use cases</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Star map generators are commonly used for anniversaries, weddings, births, and memorials. Add a
          title, names, and a short dedication to make it personal.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/wedding"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Wedding star map
          </Link>
          <Link
            href="/anniversary"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Anniversary star map
          </Link>
          <Link
            href="/birthday"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Birthday star map
          </Link>
          <Link
            href="/star-map-for/new-baby"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            New baby star map
          </Link>
          <Link
            href="/star-map-for/graduation"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Graduation star map
          </Link>
          <Link
            href="/star-map-for/memorial"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Memorial star map
          </Link>
          <Link
            href="/personalized-star-map"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Personalized star map
          </Link>
          <Link
            href="/night-sky-map-gift"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Night sky map gift
          </Link>
          <Link
            href="/constellation-map"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Constellation map
          </Link>
          <Link
            href="/star-map-poster"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map poster
          </Link>
          <Link
            href="/star-map-for"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Occasion hub
          </Link>
        </div>
      </section>

      <DeliveryFormatModule
        heading="Choose digital, unframed print, or framed print after preview"
        intro={`The generator starts the same way for every buyer: build the exact sky first, then decide whether this should become a framed gift, a lower-total unframed print, or HD digital delivery. ${shippingDisclosure}`}
        sourcePrefix="generator-format"
      />

      <FramedProofSection
        heading="The same generated map can become a framed gift"
        intro={`This is the part most generator pages skip. After preview, the same design can move into framed checkout, unframed checkout, or HD digital delivery without rebuilding the map. ${shippingDisclosure}`}
        sourcePrefix="generator-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Need inspiration?</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Browse real examples or explore curated gift ideas before you build your own.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/star-map-gallery"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Star map gallery
          </Link>
          <Link
            href="/star-map-gift-ideas"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map gift ideas
          </Link>
          <Link
            href="/shop#merch-addons"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Custom stickers
          </Link>
          <Link
            href="/blog"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Blog
          </Link>
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Star map generator FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="text-midnight font-semibold">How accurate is the star map generator?</h3>
            <p>
              The star map generator uses real astronomical data — not an illustration — so star positions and
              constellations match your chosen date, time, and location to the minute.{" "}
              <Link
                href="/how-accurate-are-star-maps"
                className="font-semibold text-amber-700 hover:underline"
              >
                Read the full accuracy guide
              </Link>
              .
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">
              Can I create a star map for any date and location?
            </h3>
            <p>
              Yes. Enter any date, time, and place worldwide to generate a custom night sky map. You can
              preview the result for free before choosing framed print, unframed print, or HD digital
              delivery.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Is this star map generator free?</h3>
            <p>
              Yes — the preview is free and requires no account. HD downloads and physical prints are paid
              upgrades after you approve the design. We do not offer free PDF or wallpaper downloads.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Can I generate a birthday star map?</h3>
            <p>
              Yes. Enter the birthday date and the location where the person was born (or where they
              celebrated) to generate the exact night sky for that moment. The result works as a framed print,
              unframed poster, or instant HD digital gift.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">How do I generate a star map for an anniversary?</h3>
            <p>
              Enter the anniversary date and the location where the moment happened — a wedding venue, the
              city where you met, or anywhere meaningful. The generator shows the actual sky from that night.
              You can add names and a message, then order a framed print or HD digital.
            </p>
          </div>
          <div>
            <h3 className="text-midnight font-semibold">Can I customize the star map after generating it?</h3>
            <p>
              Yes. After generating the initial preview, you can change the style, shape, color, and label
              text directly in the editor before choosing a delivery format.
            </p>
          </div>
        </div>
      </section>
      <HowToSchema
        name="How to create a custom star map with the StarMapCo generator"
        description="Use the free StarMapCo star map generator to preview the exact night sky for any date and location, customize the design, then choose framed print, unframed poster, or HD digital delivery."
        totalTime="PT5M"
        steps={[...howToSteps]}
      />
      <ProductSchema
        name="Custom Star Map Generator"
        description="Free star map generator for any date and location. Preview the exact night sky for free, then choose framed print, unframed poster, or instant HD digital download."
        imageUrl={`${siteUrl}/custom-star-map-anniversary.webp`}
        offers={productOffers}
      />
      <FaqSchema
        items={[
          {
            question: "How accurate is the star map generator?",
            answer:
              "The star map generator uses real astronomical data — not an illustration — so star positions and constellations match your chosen date, time, and location to the minute.",
          },
          {
            question: "Can I create a star map for any date and location?",
            answer:
              "Yes. Enter any date, time, and place worldwide to generate a custom night sky map. You can preview the result for free before choosing framed print, unframed print, or HD digital delivery.",
          },
          {
            question: "Is this star map generator free?",
            answer:
              "Yes — the preview is free and requires no account. HD downloads and physical prints are paid upgrades after you approve the design.",
          },
          {
            question: "Can I generate a birthday star map?",
            answer:
              "Yes. Enter the birthday date and the location where the person was born (or where they celebrated) to generate the exact night sky for that moment. The result works as a framed print, unframed poster, or instant HD digital gift.",
          },
          {
            question: "How do I generate a star map for an anniversary?",
            answer:
              "Enter the anniversary date and the location where the moment happened. The generator shows the actual sky from that night. You can add names and a message, then order a framed print or HD digital.",
          },
          {
            question: "Can I customize the star map after generating it?",
            answer:
              "Yes. After generating the initial preview, you can change the style, shape, color, and label text directly in the editor before choosing a delivery format.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
