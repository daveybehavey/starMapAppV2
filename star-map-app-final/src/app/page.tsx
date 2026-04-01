import type { Metadata } from "next";
import HomeHero from "./HomeHero";
import HomeStaticSections from "./HomeStaticSections";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import { formatPrintPriceWithShipping, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const homepageDescription =
  "Create a custom star map or constellation map of any date and location. Start with a free live preview, then choose framed print, unframed print, or HD digital delivery at StarMapCo.";

export const metadata: Metadata = {
  title: "Custom Star Map & Constellation Map | StarMapCo",
  description: homepageDescription,
  alternates: { canonical: `${siteUrl}/` },
  openGraph: {
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description: homepageDescription,
    url: `${siteUrl}/`,
    images: [
      {
        url: `${siteUrl}/custom-star-map-anniversary.png`,
        width: 1200,
        height: 630,
        alt: "Custom star map preview from StarMapCo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description: homepageDescription,
    images: [`${siteUrl}/custom-star-map-anniversary.png`],
  },
};

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const tiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
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
    printTiers.poster_unframed.amountCents,
    (printTiers.poster_unframed.currency || "USD").toUpperCase(),
  );
  const shippingDisclosure = getPrintShippingDisclosure();
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
        description:
          "Personalized star map generator for special dates and locations with a free live preview, framed print, unframed print, and HD digital delivery.",
        brand: { "@type": "Brand", name: "StarMapCo" },
        image: [`${siteUrl}/custom-star-map-anniversary.webp`],
        category: "Personalized gifts",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Export resolution",
            value: "Up to 6000x6000 PNG",
          },
          {
            "@type": "PropertyValue",
            name: "Delivery",
            value: printCheckoutEnabled
              ? "Instant digital + optional physical print checkout"
              : "Instant digital",
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
        mainEntity: [
          {
            "@type": "Question",
            name: "How accurate are StarMapCo custom star maps?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "StarMapCo uses real date, time, timezone, and location inputs, then calculates the sky with astronomy-engine and bundled star catalog data.",
            },
          },
          {
            "@type": "Question",
            name: "What data sources do you use for the night sky?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "We rely on real astronomical data from trusted sources like the Yale Bright Star Catalog to calculate exact positions for your date, time, and location.",
            },
          },
          {
            "@type": "Question",
            name: "Can I customize text, styles, and shapes?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes—add titles, subtitles, or dedications; choose from four styles (navy gold, vintage, parchment, minimal) and shapes (rectangle free, heart/circle/star premium) plus visual modes and constellations.",
            },
          },
          {
            "@type": "Question",
            name: "What is included in the free version vs. premium unlock?",
            acceptedAnswer: {
              "@type": "Answer",
              text: `Free preview lets you confirm the date, location, and layout first. Paid checkout can unlock framed print (${printFramedLabel}), unframed print (${printUnframedOfferLabel}), or HD digital delivery from ${priceLabel}. Digital packs and subscription stay available if you need repeat exports.`,
            },
          },
          {
            "@type": "Question",
            name: "How do I export or download my star map?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "After premium unlock, download a high-resolution PNG directly from the app.",
            },
          },
          {
            "@type": "Question",
            name: "Do I have to subscribe to buy a star map?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. Most buyers use one-time checkout for framed print, unframed print, or a single HD file. Subscription is optional only for repeat digital exports.",
            },
          },
          {
            "@type": "Question",
            name: "Are the maps suitable for printing?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes—designed to be print-ready up to 6000x6000 resolution for crisp posters and framed gifts.",
            },
          },
          {
            "@type": "Question",
            name: "Can I order a printed or framed version directly?",
            acceptedAnswer: {
              "@type": "Answer",
              text: printCheckoutEnabled
                ? `Yes. After the free preview, checkout supports framed print (${printFramedLabel}), unframed print (${printUnframedOfferLabel}), and HD digital delivery.`
                : "Physical print checkout is in staged rollout. You can always download a print-ready HD file immediately after payment.",
            },
          },
          {
            "@type": "Question",
            name: "When do I see shipping cost and delivery timing?",
            acceptedAnswer: {
              "@type": "Answer",
              text: `${shippingDisclosure} Production starts after order review while manual approval is enabled.`,
            },
          },
          {
            "@type": "Question",
            name: "What if a print arrives damaged?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Contact support@starmapco.com and we will help resolve the issue.",
            },
          },
          {
            "@type": "Question",
            name: "Can I share my custom star map with others?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. You can share exported images right away and use private access or referral links from the success/download flow.",
            },
          },
          {
            "@type": "Question",
            name: "What if I enter the wrong date or location?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
            },
          },
          {
            "@type": "Question",
            name: "Why choose StarMapCo over other star map generators?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Free live preview, accurate science, and a clear delivery ladder: framed for premium gifting, unframed for lower physical cost, or HD digital for instant access.",
            },
          },
        ],
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
