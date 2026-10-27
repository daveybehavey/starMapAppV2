import type { Metadata } from "next";
import HomeHero from "./HomeHero";
import HomeStaticSections, { buildHomeFaqItems } from "./HomeStaticSections";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import { formatPrintPriceWithShipping, isUsOnlyPrintCheckout } from "@/lib/printCheckoutConfig";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const homepageDescription =
  "Create a personalized star map for any date and location — preview the exact night sky for free, then order a framed print, unframed poster, or HD digital download. Perfect for anniversaries, weddings, and birthdays.";
const homepageDescriptionDigitalOnly =
  "Create a personalized star map for any date and location — preview the exact night sky for free, then order an HD digital download. Perfect for anniversaries, weddings, and birthdays.";

function isPrintCheckoutEnabled(): boolean {
  return /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
}

export function generateMetadata(): Metadata {
  const description = isPrintCheckoutEnabled()
    ? homepageDescription
    : homepageDescriptionDigitalOnly;
  return {
    title: "Custom Star Map — Preview Free, Print or Download | StarMapCo",
    description,
    keywords: [
      "custom star map",
      "star map gift",
      "constellation map",
      "personalized star map",
      "star map by date",
      "star map anniversary gift",
    ],
    alternates: { canonical: `${siteUrl}/` },
    openGraph: {
      title: "Custom Star Map — Preview Free, Print or Download | StarMapCo",
      description,
      url: `${siteUrl}/`,
      siteName: "StarMapCo",
      images: [
        {
          url: `${siteUrl}/custom-star-map-anniversary.webp`,
          width: 1200,
          height: 630,
          alt: "Custom star map preview from StarMapCo",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Custom Star Map — Preview Free, Print or Download | StarMapCo",
      description,
      images: [`${siteUrl}/custom-star-map-anniversary.webp`],
    },
  };
}

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const tiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();
  const printCheckoutEnabled = isPrintCheckoutEnabled();
  const priceLabel = formatPrice(
    tiers.single.amountCents,
    (tiers.single.currency || "USD").toUpperCase()
  );
  const packLabel = formatPrice(
    tiers.pack3.amountCents,
    (tiers.pack3.currency || "USD").toUpperCase()
  );
  const subscriptionLabel = formatPrice(
    tiers.subscription.amountCents,
    (tiers.subscription.currency || "USD").toUpperCase()
  );
  const printFramedLabel = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    (printTiers.poster_framed.currency || "USD").toUpperCase(),
  );
  const printUnframedOfferLabel = formatPrintPriceWithShipping(
    printTiers.poster_unframed_16x16.amountCents,
    (printTiers.poster_unframed_16x16.currency || "USD").toUpperCase(),
  );
  const isUsOnlyPrint = isUsOnlyPrintCheckout();
  const packSavingsPercent =
    tiers.single.amountCents > 0
      ? Math.max(
          0,
          Math.round(
            (1 - tiers.pack3.amountCents / Math.max(1, tiers.single.amountCents * 3)) * 100,
          ),
        )
      : 0;
  const priceLabels = {
    single: priceLabel,
    pack3: packLabel,
    subscription: subscriptionLabel,
    packSavingsPercent,
  };
  const schemaPrice = (tiers.single.amountCents / 100).toFixed(2);
  const schemaCurrency = (tiers.single.currency || "USD").toUpperCase();
  const priceValidUntil = (() => {
    const now = new Date();
    const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
    return nextYear.toISOString().slice(0, 10);
  })();

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "Custom Star Map",
        description: printCheckoutEnabled
          ? "Personalized star map generator for special dates and locations with a free live preview, framed print, unframed poster, and HD digital delivery."
          : "Personalized star map generator for special dates and locations with a free live preview and HD digital delivery.",
        brand: { "@type": "Brand", name: "StarMapCo" },
        image: [`${siteUrl}/custom-star-map-anniversary.webp`],
        category: "Personalized gifts",
        // Deliberately NO review aggregate in this Product schema: the
        // 5.0-star rating belongs to the Google Business Profile (the
        // business), not to this product, and Google prohibits presenting
        // one entity's reviews as another's. The rating is displayed
        // visibly, labeled "on Google", by GoogleRatingsTrust — it is not
        // claimed in structured data.
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Export resolution",
            value: "6000px wide — up to 6000x9000 PNG by format",
          },
          {
            "@type": "PropertyValue",
            name: "Delivery",
            value: printCheckoutEnabled
              ? isUsOnlyPrint
                ? "HD digital + optional physical print checkout"
                : "HD digital + optional physical print checkout"
              : "HD digital",
          },
        ],
        offers: [
          {
            "@type": "Offer",
            name: "Single HD download",
            priceCurrency: schemaCurrency,
            price: schemaPrice,
            priceValidUntil,
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/editor?mode=quick&source=home-schema-digital`,
          },
          ...(printCheckoutEnabled
            ? [
                {
                  "@type": "Offer" as const,
                  name: "Unframed print",
                  priceCurrency: (printTiers.poster_unframed.currency || "USD").toUpperCase(),
                  price: (printTiers.poster_unframed.amountCents / 100).toFixed(2),
                  priceValidUntil,
                  availability: "https://schema.org/InStock",
                  url: `${siteUrl}/editor?mode=quick&source=home-schema-print-unframed`,
                },
                {
                  "@type": "Offer" as const,
                  name: "Unframed poster (16×16)",
                  priceCurrency: (printTiers.poster_unframed_16x16.currency || "USD").toUpperCase(),
                  price: (printTiers.poster_unframed_16x16.amountCents / 100).toFixed(2),
                  priceValidUntil,
                  availability: "https://schema.org/InStock",
                  url: `${siteUrl}/editor?mode=quick&source=home-schema-print-unframed-16x16&checkout=print&print_variant=poster_unframed_16x16`,
                },
                {
                  "@type": "Offer" as const,
                  name: "Framed print",
                  priceCurrency: (printTiers.poster_framed.currency || "USD").toUpperCase(),
                  price: (printTiers.poster_framed.amountCents / 100).toFixed(2),
                  priceValidUntil,
                  availability: "https://schema.org/InStock",
                  url: `${siteUrl}/editor?mode=quick&source=home-schema-print-framed`,
                },
              ]
            : []),
        ],
      },
      {
        "@type": "FAQPage",
        // Built from the same item set as the visible "Quick answers" block
        // (buildHomeFaqItems) so the schema matches the page exactly.
        mainEntity: buildHomeFaqItems({
          single: priceLabel,
          framed: printFramedLabel,
          unframed: printUnframedOfferLabel,
        }).map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };

  const promoRaw = resolvedSearchParams.promo;
  const promoParam = Array.isArray(promoRaw) ? promoRaw[0] : promoRaw;
  const promoStatus =
    promoParam === "success" || promoParam === "error" ? promoParam : undefined;
  const codeRaw = resolvedSearchParams.code;
  const promoCode =
    typeof codeRaw === "string" ? codeRaw : Array.isArray(codeRaw) ? codeRaw[0] : undefined;

  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/textures/star-map-hero/phone.webp"
        media="(max-width: 639px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/textures/star-map-hero/tablet.webp"
        media="(min-width: 640px) and (max-width: 1023px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/textures/star-map-hero/desktop.webp"
        media="(min-width: 1024px)"
        fetchPriority="high"
      />
      <script
        id="product-faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <HomeHero />
      <HomeStaticSections
        priceLabels={priceLabels}
        promoStatus={promoStatus}
        promoCode={promoCode}
      />
    </>
  );
}
