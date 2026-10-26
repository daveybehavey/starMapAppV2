import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import ResilientImage from "@/components/ResilientImage";
import StickyCtaBar from "@/components/StickyCtaBar";
import { CHRISTMAS_ORDER_BY_DATES } from "@/lib/christmasCampaign";
import {
  buildPrintEditorCheckoutHref,
  formatPrintPriceWithShipping,
  getPrintProductionReviewDisclosure,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";
import { formatPrice, getPrintPricingTiers } from "@/lib/pricing";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const CARD_PATH = "/star-map-keepsake-card";
const CARD_PRODUCT_NAME = "Custom Star Map Keepsake Card (4×6)";
const CARD_IMAGE = "/printproof/gift-raw/card/card-mockup.jpg";

const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: CARD_PATH, label: "Keepsake card" },
];

export const metadata: Metadata = {
  title: `${CARD_PRODUCT_NAME} | StarMapCo`,
  description:
    "A folded 4×6 greeting card printed with your custom star map — order it on its own, or add it to a framed print. Preview free in the editor, then checkout.",
  alternates: { canonical: `${siteUrl}${CARD_PATH}` },
  openGraph: {
    title: `${CARD_PRODUCT_NAME} | StarMapCo`,
    description:
      "Your star map on a folded 4×6 keepsake card, printed to order and mailed to your recipient. Free preview first.",
    url: `${siteUrl}${CARD_PATH}`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

function formatOrderBy(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export default function KeepsakeCardLandingPage() {
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const printTiers = getPrintPricingTiers();
  const cardTier = printTiers.card_4x6;
  const currency = (cardTier.currency || "USD").toUpperCase();
  const cardPriceLabel = formatPrice(cardTier.amountCents, cardTier.currency);
  const cardPriceWithShipping = formatPrintPriceWithShipping(cardTier.amountCents, cardTier.currency);
  const framedPriceLabel = formatPrice(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency);
  const bundlePriceLabel = formatPrice(
    printTiers.poster_framed.amountCents + cardTier.amountCents,
    cardTier.currency,
  );
  const deliveryUs = formatPrintDeliveryDisclosure("card_4x6", "US");
  const primaryHref = buildPrintEditorCheckoutHref({
    source: "keepsake-card",
    variant: "card_4x6",
  });
  const framedCardHref = buildPrintEditorCheckoutHref({
    source: "keepsake-card-framed",
    variant: "poster_framed",
    includeCardAddOn: true,
  });
  const cardOrderByUs = formatOrderBy(CHRISTMAS_ORDER_BY_DATES.card_us);
  const cardOrderByCa = formatOrderBy(CHRISTMAS_ORDER_BY_DATES.card_ca);

  const faqItems = [
    {
      question: "What is the keepsake card?",
      answer: `A folded 4×6 greeting card printed with the star map you design in the editor — the sky over your date and place, with your title and occasion lines. It is the same card that bundles with our framed print, now orderable on its own for ${cardPriceLabel}.`,
    },
    {
      question: "How much is shipping for a card on its own?",
      answer: `A standalone card is ${cardPriceWithShipping}. Shipping is charged at our standard poster rate for your country and shown in checkout before you pay. ${shippingDisclosure} The free-shipping threshold applies to the whole print order, so a card ordered with a framed print ships under that order's shipping terms.`,
    },
    {
      question: "Can I still get the card with a framed print?",
      answer: `Yes. The framed + keepsake card bundle is unchanged at ${bundlePriceLabel} (${framedPriceLabel} framed print + ${cardPriceLabel} card) — choose it in the editor's print options, or start from the framed print and add the card.`,
    },
    {
      question: "When should I order for Christmas?",
      answer: `Order by ${cardOrderByUs} for US delivery and ${cardOrderByCa} for Canada. Every card is printed to order after you approve your free preview.`,
    },
    {
      question: "Do I design the card before paying?",
      answer:
        "Yes. Start with a free preview in the editor — set the date, place, title, and style — and only checkout when the design looks right. No watermark on the printed card.",
    },
  ] as const;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: CARD_PRODUCT_NAME,
    description:
      "Made-to-order folded 4×6 greeting card printed with a custom star map of a chosen date and place.",
    brand: { "@type": "Brand", name: "StarMapCo" },
    image: [`${siteUrl}${CARD_IMAGE}`],
    category: "Paper Products > Stationery > Greeting Cards",
    offers: {
      "@type": "Offer",
      name: CARD_PRODUCT_NAME,
      priceCurrency: currency,
      price: (cardTier.amountCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      url: `${siteUrl}${CARD_PATH}`,
    },
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 text-neutral-900 sm:px-6 lg:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="rounded-3xl border border-white/15 bg-white/90 px-5 py-8 shadow-xl shadow-black/10 sm:px-10 sm:py-10">
        <Breadcrumbs items={breadcrumbs} />
        <p className="mt-4 text-xs font-semibold tracking-[0.22em] text-amber-700 uppercase">Shop</p>
        <h1 className="mt-2 text-3xl font-bold text-midnight sm:text-4xl">
          The keepsake card, on its own — {cardPriceLabel}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
          A folded 4×6 greeting card printed with your custom star map — the night sky over your date and
          place, with your own title and occasion lines. Until now it only came bundled with a framed print;
          now you can send the card by itself. {productionReviewDisclosure}
        </p>

        <div className="mt-8 grid items-start gap-8 md:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
            <ResilientImage
              src={CARD_IMAGE}
              fallbackSrc={CARD_IMAGE}
              alt="Folded keepsake card with an example star map design — your own map is printed to order"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-2xl font-semibold text-amber-800">{cardPriceWithShipping}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-700 sm:text-base">
              <li>Folded 4×6 card — your star map on the front, room to write inside</li>
              <li>Printed to order from the design you approve in the free preview</li>
              <li>
                Christmas order-by: {cardOrderByUs} (US) · {cardOrderByCa} (Canada)
              </li>
              {deliveryUs ? <li>{deliveryUs}.</li> : null}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={primaryHref}
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-midnight shadow-md transition hover:bg-amber-400"
              >
                Customize your card
              </Link>
              <Link
                href={framedCardHref}
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-neutral-50"
              >
                Or get it with a framed print — {bundlePriceLabel}
              </Link>
            </div>
            <p className="mt-4 text-sm text-neutral-600">
              Comparing formats? See the{" "}
              <Link href="/star-map-gift-formats" className="font-semibold text-amber-800 underline">
                gift formats page
              </Link>{" "}
              or browse the{" "}
              <Link href="/shop" className="font-semibold text-amber-800 underline">
                full shop
              </Link>
              .
            </p>
          </div>
        </div>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold text-midnight">Keepsake card FAQ</h2>
          <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
            {faqItems.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold text-midnight">{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <PurchaseTrustPanel
          heading="Before you order"
          intro="Preview for free first. Checkout only when the design feels right."
          leftTitle="Checkout and files"
          leftPoints={[
            "Secure Stripe checkout",
            "Free preview — no watermark on the printed card",
            "Shipping shown before you pay",
          ]}
          rightTitle="Print and support"
          rightPoints={[
            "Printed to order by our print partner",
            shippingDisclosure,
            "Support is available at support@starmapco.com",
          ]}
          guideLabel="Print and frame guide"
        />
      </div>

      <StickyCtaBar
        source="sticky-keepsake-card"
        primaryHref={primaryHref}
        secondaryButtonLabel="Preview framed print"
        secondaryHref="/editor?mode=quick&source=sticky-keepsake-card-framed&checkout=print&print_variant=poster_framed"
        secondaryPlan="print_framed"
      />
      <FaqSchema items={[...faqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
