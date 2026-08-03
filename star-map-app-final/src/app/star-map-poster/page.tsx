import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import DeliveryFormatModule from "@/components/DeliveryFormatModule";
import FramedProofSection from "@/components/FramedProofSection";
import FaqSchema from "@/components/FaqSchema";
import OccasionLinks from "@/components/OccasionLinks";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PreviewStartForm from "@/components/PreviewStartForm";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import { formatPrintPriceWithShipping, getPrintProductionReviewDisclosure, getPrintProductionReviewTrustPoint, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { FRAMED_HD_RECOMMENDED_BADGE } from "@/lib/moneyPageGiftCheckout";
import { getBusinessProfile } from "@/lib/businessProfile";
import { getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400; // refresh once per day

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-poster", label: "Star map poster" },
];

export const metadata: Metadata = {
  title: "Custom Star Map Poster — Framed & Unframed Prints | StarMapCo",
  description:
    "Create a custom star map poster from any date and location. Free preview, then choose unframed poster or framed wall art with shipping shown before payment.",
  alternates: { canonical: `${siteUrl}/star-map-poster` },
  openGraph: {
    title: "Custom Star Map Poster — Framed & Unframed Prints | StarMapCo",
    description:
      "Create a custom star map poster from any date and location. Free preview, then unframed or framed print checkout after you approve the design.",
    url: `${siteUrl}/star-map-poster`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapPosterPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const profile = getBusinessProfile();
  const printTiers = getPrintPricingTiers();
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const faqItems = [
    {
      question: "Is this a physical star map poster?",
      answer:
        `Yes. After preview, you can choose an unframed poster or framed print from the same approved design. ${shippingDisclosure}`,
    },
    {
      question: "Which route is recommended for gifting?",
      answer:
        "Framed is the premium ready-to-hang gift presentation. Unframed is the lower-cost option when you already have a frame plan, and the same approved map can still stay digital.",
    },
    {
      question: "Do I see shipping before paying?",
      answer: `Yes. Physical checkout shows the shipping charge before payment is finalized. ${productionReviewDisclosure}`,
    },
    {
      question: "What happens after I approve the preview?",
      answer:
        `After you approve the design, the same map moves into print checkout. ${productionReviewDisclosure} Support stays with StarMapCo if there is a print issue.`,
    },
    {
      question: "What sizes do star map posters come in?",
      answer:
        "StarMapCo posters are made to order from your approved design. Framed 14×14 is the premium gift presentation; unframed 18×18 is the lower-cost option when you already have a frame plan. Preview first, then pick the format at checkout.",
    },
  ] as const;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "Custom Star Map Poster",
        description:
          "Made-to-order custom star map wall art created from your chosen date and location, available as an unframed poster or framed print after preview.",
        brand: { "@type": "Brand", name: "StarMapCo" },
        image: [`${siteUrl}${HOME_MOCKUPS.unframedPoster}`, `${siteUrl}${HOME_MOCKUPS.framedBedroom}`],
        category: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
        offers: [
          {
            "@type": "Offer",
            name: "Custom Star Map Poster (Unframed)",
            priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
            price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/editor?mode=quick&source=poster-schema-print-unframed&checkout=print&print_variant=poster_unframed`,
          },
          {
            "@type": "Offer",
            name: "Custom Star Map Framed Print",
            priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
            price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/editor?mode=quick&source=poster-schema-print-framed&checkout=print&print_variant=poster_framed`,
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <section className="content-visibility-auto overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(241,194,125,0.18),transparent_34%),linear-gradient(135deg,rgba(10,18,39,0.96),rgba(7,12,26,0.96))] shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
        <div className="grid gap-0 lg:grid-cols-[1.12fr,0.88fr]">
          <header className="space-y-5 p-6 sm:p-8">
            <Breadcrumbs items={breadcrumbs} className="flex flex-wrap gap-2" />
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/85">
              <span className="brand-pill rounded-full px-3 py-1">Preview first</span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">Physical print checkout</span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">Shipping shown before payment</span>
            </div>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
              <h1 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">
                Custom star map poster for any date and place
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-white/88 sm:text-base">
                Build the map once from the exact night sky of a special moment, approve the preview, then choose the
                physical route that fits the occasion. Framed is the premium default because it arrives ready to hang.
                Unframed stays available if you already have a frame plan.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "Framed starts at",
                  value: framedPrice,
                  detail: "Best for gifting and finished presentation.",
                },
                {
                  title: "Unframed starts at",
                  value: unframedPrice,
                  detail: "Lower total if you already plan to frame it yourself.",
                },
                {
                  title: "Support stays direct",
                  value: profile.email,
                  detail: `Questions route to ${profile.name} before and after checkout.`,
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/7 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/80">{item.title}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/72">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/editor?mode=quick&source=star-map-poster-hero-framed&checkout=print&print_variant=poster_framed"
                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-amber-200"
              >
                Start with framed print preview
              </Link>
              <Link
                href="/editor?mode=quick&source=star-map-poster-hero-unframed&checkout=print&print_variant=poster_unframed"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/14"
              >
                See unframed route
              </Link>
            </div>
          </header>

          <aside className="border-t border-white/8 bg-white/6 p-6 lg:border-l lg:border-t-0">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                    Default recommendation
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Why framed is the safer default</h2>
                </div>
                <span className="rounded-full border border-amber-200/40 bg-amber-300/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                  {FRAMED_HD_RECOMMENDED_BADGE}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{printTiers.poster_framed.label}</p>
                    <span className="rounded-full border border-amber-200/35 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                      Best gift
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-amber-100">{framedPrice}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/78">
                    Finished, ready-to-hang presentation with less work on the buyer side after checkout.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{printTiers.poster_unframed.label}</p>
                    <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/72">
                      Lower total
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{unframedPrice}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    Better if you already know the exact frame, room, or custom presentation you want to handle yourself.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/12 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/80">
                  Purchase path
                </p>
                <ol className="mt-3 space-y-2 text-sm text-white/80">
                  <li>1. Enter the date and location and approve the preview.</li>
                  <li>2. Move the same approved map into framed or unframed checkout.</li>
                  <li>3. Shipping appears before payment. {productionReviewDisclosure}</li>
                </ol>
                <p className="mt-3 text-xs text-white/65">
                  Digital can still stay secondary as an add-on or immediate backup, but this page stays focused on the physical gift route.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <PreviewStartForm
        source="star-map-poster"
        title="Start your poster preview"
        description="Enter the date and location, then choose whether to open the editor with the framed path, the unframed path, or a neutral preview-first start. If you want the easiest gift route, start framed."
        intentOptions={[
          {
            label: "Start framed preview",
            sourceSuffix: "framed",
            checkout: "print",
            printVariant: "poster_framed",
            plan: "print_framed",
            tone: "recommended",
            detail: "Recommended if you want the finished piece to arrive ready to display.",
          },
          {
            label: "Start unframed preview",
            sourceSuffix: "unframed",
            checkout: "print",
            printVariant: "poster_unframed",
            plan: "print_unframed",
            tone: "default",
            detail: "Lower total if you already know how you want to frame it yourself.",
          },
          {
            label: "Preview first, decide later",
            plan: "preview",
            tone: "neutral",
            detail: "Open the editor without preselecting checkout if you want to compare first.",
          },
        ]}
      />
      <StickyCtaBar source="sticky-star-map-poster" />

      <section className="content-visibility-auto mt-8 grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">How physical checkout works</p>
            <h2 className="text-xl font-semibold text-midnight">Approve the map first, then commit to the print route</h2>
            <p className="text-sm leading-relaxed text-neutral-800 sm:text-base">
              This page is built to reduce print friction. The design is approved first, framed stays visually primary,
              and support, shipping, and damage handling stay visible before payment.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              {
                step: "01",
                title: "Build and approve the preview",
                detail: "Enter the date, time, and location, then adjust the poster style, text, and layout before checkout.",
              },
              {
                step: "02",
                title: "Choose framed or unframed with the same map attached",
                detail: "No rebuild step. The approved poster design carries straight into the physical checkout path you pick.",
              },
              {
                step: "03",
                title: "See shipping before payment, then fulfillment after checkout",
                detail: `Physical checkout shows the shipping charge before you pay. ${productionReviewDisclosure}`,
              },
            ].map((item) => (
              <div key={item.step} className="grid gap-3 rounded-2xl border border-black/5 bg-amber-50/70 p-4 sm:grid-cols-[auto,1fr] sm:items-start">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-midnight text-sm font-semibold text-white">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-midnight">{item.title}</h3>
                  <p className="mt-1 text-sm text-neutral-700">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Quick decision guide</p>
            <h2 className="text-lg font-semibold text-midnight">Which poster route fits the moment?</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-300/55 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-midnight">{printTiers.poster_framed.label}</h3>
                <span className="rounded-full border border-amber-300/70 bg-amber-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  Recommended
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-midnight">{framedPrice}</p>
              <p className="mt-2 text-sm text-neutral-700">
                Best when the buyer wants the gift to arrive finished, premium, and ready to hang.
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white/85 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-midnight">{printTiers.poster_unframed.label}</h3>
              <p className="mt-2 text-sm font-semibold text-midnight">{unframedPrice}</p>
              <p className="mt-2 text-sm text-neutral-700">
                Best when price matters more or you already know exactly how you want to frame it later.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="text-sm font-semibold text-midnight">Keep the decision simple</p>
            <p className="mt-2 text-sm text-neutral-700">
              If this is a gift, start framed. If you already have the frame plan, start unframed. If you are still
              deciding, use the neutral preview and compare after you see the map.
            </p>
          </div>
          <div className="pt-1">
            <Link
              href="/editor?mode=quick&source=star-map-poster-cta&checkout=print&print_variant=poster_framed"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-amber-50"
            >
              Design your framed poster first
            </Link>
          </div>
        </div>
      </section>

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="This is a custom physical product, so the important things should be clear before payment: what you are ordering, when shipping appears, how support works, and what happens after you approve the preview."
        leftTitle="What you are ordering"
        leftPoints={[
          "A made-to-order custom star map created from your approved preview.",
          `Choose unframed poster or framed print in checkout, with framed kept as the premium default on this page.`,
          `Support is handled directly by ${profile.name} at ${profile.email}.`,
        ]}
        rightTitle="What happens after you approve the preview"
        rightPoints={[
          "The same approved map carries into the physical checkout path you choose.",
          shippingDisclosure,
          `${productionReviewTrustPoint} Damaged prints can be reported to support with photos and order details.`,
        ]}
      />

      <DeliveryFormatModule
        heading="Choose the physical format after preview"
        intro={`Preview the artwork first, then decide whether this moment should arrive as an unframed poster or a ready-to-hang framed print. ${shippingDisclosure}`}
        sourcePrefix="poster-format"
      />

      <FramedProofSection
        heading="Poster design on screen, framed result on the wall"
        intro={`Use the poster layout to approve the composition, then move into physical checkout if you want the finished piece to arrive ready to gift or display. ${shippingDisclosure}`}
        sourcePrefix="poster-proof"
      />
      <PhysicalProductGallerySection
        heading="See the poster and framed finish in real rooms"
        intro="Room mockups from current StarMapCo artwork — framed, unframed, and in-home styling."
        sourcePrefix="poster-physical-proof"
      />

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">More ways to explore</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Start from curated hubs or jump to adjacent intent pages.
        </p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
          <Link
            href="/star-map-for"
            className="rounded-full border border-amber-200/60 bg-amber-50/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Occasion hub
          </Link>
          <Link
            href="/star-map-in"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Location hub
          </Link>
          <Link
            href="/star-map-generator"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map generator
          </Link>
          <Link
            href="/star-map-gallery"
            className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
          >
            Star map gallery
          </Link>
        </div>
      </section>

      <OccasionLinks />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Star map poster FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="font-semibold text-midnight">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSchema items={[...faqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </main>
  );
}
