import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import StickyCtaBar from "@/components/StickyCtaBar";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import { getBusinessProfile } from "@/lib/businessProfile";
import {
  buildPrintEditorCheckoutHref,
  getFramedHdBundlePriceLine,
  getPrintFreeShippingOfferLine,
  getPrintProductionReviewDisclosure,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  getPrintMerchandiseSubtotalCents,
  qualifiesForPrintFreeShipping,
} from "@/lib/printFreeShipping";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const BUNDLE_PATH = "/star-map-poster/framed-hd-bundle";
const BUNDLE_PRODUCT_NAME = "Custom Star Map Framed Print + HD Digital Download";

const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-poster", label: "Star map poster" },
  { href: BUNDLE_PATH, label: "Framed + HD bundle" },
];

export const metadata: Metadata = {
  title: `${BUNDLE_PRODUCT_NAME} | StarMapCo`,
  description:
    "Framed custom star map print plus instant HD digital download from the same approved design. Preview free, then checkout the framed + HD bundle with free standard shipping on qualifying orders.",
  alternates: { canonical: `${siteUrl}${BUNDLE_PATH}` },
  openGraph: {
    title: `${BUNDLE_PRODUCT_NAME} | StarMapCo`,
    description:
      "Ready-to-hang framed star map print plus instant HD digital download. Free preview first; free standard shipping when the bundle merchandise threshold is met.",
    url: `${siteUrl}${BUNDLE_PATH}`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function FramedHdBundleLandingPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const freeShippingOfferLine = getPrintFreeShippingOfferLine();
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const profile = getBusinessProfile();
  const printTiers = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const bundleCents = getPrintMerchandiseSubtotalCents({
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
  const currency = (printTiers.poster_framed.currency || "USD").toUpperCase();
  const bundlePriceLabel = formatPrice(bundleCents, printTiers.poster_framed.currency);
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const qualifiesFreeShipping = qualifiesForPrintFreeShipping(bundleCents);
  const framedLabel = formatPrice(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency);
  const digitalLabel = formatPrice(digitalAddOn.amountCents, digitalAddOn.currency);
  const primaryHref = buildPrintEditorCheckoutHref({
    source: "merchant-framed-hd-bundle",
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
  const faqItems = [
    {
      question: "What does the framed + HD bundle include?",
      answer: `A ready-to-hang framed physical print and an instant HD digital download from the same approved design. Bundle merchandise is ${bundlePriceLabel} (${framedLabel} framed print + ${digitalLabel} HD add-on).`,
    },
    {
      question: "Is shipping free on this bundle?",
      answer: qualifiesFreeShipping
        ? `Yes for this bundle under current thresholds. ${freeShippingOfferLine ?? shippingDisclosure}`
        : shippingDisclosure,
    },
    {
      question: "Do I see shipping before paying?",
      answer: `Yes. Physical checkout shows the shipping charge (or free-shipping waiver) before payment is finalized. ${productionReviewDisclosure}`,
    },
    {
      question: "Can I compare other print formats?",
      answer:
        "Yes. The broader poster page lists framed-only and unframed routes. This page is dedicated to the framed print + HD digital bundle advertised in Merchant Center.",
    },
  ] as const;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: BUNDLE_PRODUCT_NAME,
    description:
      "Made-to-order custom star map framed print with instant HD digital download from the same approved design.",
    brand: { "@type": "Brand", name: "StarMapCo" },
    image: [`${siteUrl}${HOME_MOCKUPS.framedBedroom}`, `${siteUrl}${HOME_MOCKUPS.digitalHd}`],
    category: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
    offers: {
      "@type": "Offer",
      name: BUNDLE_PRODUCT_NAME,
      priceCurrency: currency,
      price: (bundleCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      url: `${siteUrl}${BUNDLE_PATH}`,
    },
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <section className="content-visibility-auto overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(241,194,125,0.18),transparent_34%),linear-gradient(135deg,rgba(10,18,39,0.96),rgba(7,12,26,0.96))] shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
        <div className="grid gap-0 lg:grid-cols-[1.12fr,0.88fr]">
          <header className="space-y-5 p-6 sm:p-8">
            <Breadcrumbs items={breadcrumbs} className="flex flex-wrap gap-2" />
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.2em] text-amber-100/85 uppercase">
              <span className="brand-pill rounded-full px-3 py-1">Framed + HD bundle</span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                Instant digital included
              </span>
              {qualifiesFreeShipping ? (
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                  Free standard shipping
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
              <h1 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">{BUNDLE_PRODUCT_NAME}</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-white/88 sm:text-base">
                Preview the exact night sky free, then checkout this bundle: a ready-to-hang framed physical
                print plus an instant HD digital download from the same approved design.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 p-5">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-100/80 uppercase">
                Bundle price
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{bundlePriceLabel}</p>
              <p className="mt-2 text-sm text-amber-100/90">{bundlePriceLine}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/78">
                Derived as {framedLabel} framed print + {digitalLabel} HD digital add-on.{" "}
                {qualifiesFreeShipping
                  ? freeShippingOfferLine ?? shippingDisclosure
                  : shippingDisclosure}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={primaryHref}
                className="text-midnight inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold transition hover:-translate-y-[1px] hover:bg-amber-200"
              >
                Start framed + HD preview
              </Link>
              <Link
                href="/star-map-poster"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/14"
              >
                See other poster formats
              </Link>
            </div>
          </header>

          <aside className="border-t border-white/8 bg-white/6 p-6 lg:border-t-0 lg:border-l">
            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
                What this offer includes
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Framed print + HD digital</h2>
              <ul className="mt-5 space-y-3 text-sm text-white/82">
                <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  Ready-to-hang framed physical star map print from your approved preview.
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  Instant HD digital download of the same design after checkout.
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  {qualifiesFreeShipping
                    ? "Free standard shipping on this bundle under the current merchandise threshold."
                    : shippingDisclosure}
                </li>
              </ul>
              <ol className="mt-5 space-y-2 text-sm text-white/80">
                <li>1. Enter the date and location and approve the preview.</li>
                <li>2. Continue into framed print checkout with HD digital included.</li>
                <li>3. Shipping appears before payment. {productionReviewDisclosure}</li>
              </ol>
            </div>
          </aside>
        </div>
      </section>

      <StickyCtaBar
        source="sticky-framed-hd-bundle"
        title="Ready for the framed + HD bundle?"
        description={`Preview free, then checkout at ${bundlePriceLine}.`}
        buttonLabel="Start framed + HD preview"
        primaryHref={primaryHref}
        primaryPlan="print_framed_hd"
        secondaryButtonLabel="Compare poster formats"
        secondaryHref="/star-map-poster"
        secondaryPlan="print_compare"
      />

      <PurchaseTrustPanel
        heading="Before you buy this bundle"
        intro="This Merchant landing page is for the framed print + HD digital bundle only. Price, inclusions, and checkout preselection match the advertised offer."
        leftTitle="What you are ordering"
        leftPoints={[
          `${BUNDLE_PRODUCT_NAME} at ${bundlePriceLabel}.`,
          "Framed physical print plus instant HD digital from the same approved map.",
          `Support is handled directly by ${profile.name} at ${profile.email}.`,
        ]}
        rightTitle="Shipping and fulfillment"
        rightPoints={[
          qualifiesFreeShipping
            ? `${freeShippingOfferLine ?? shippingDisclosure} This bundle qualifies under the current merchandise threshold.`
            : shippingDisclosure,
          productionReviewTrustPoint,
          "Damaged prints can be reported to support with photos and order details.",
        ]}
      />

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Framed + HD bundle FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
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
