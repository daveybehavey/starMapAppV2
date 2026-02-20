import type { Metadata } from "next";
import HomeHero from "./HomeHero";
import HomeStaticSections from "./HomeStaticSections";
import { formatPrice, getPricingTiers } from "@/lib/pricing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Custom Star Map & Constellation Map | StarMapCo",
  description:
    "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing at StarMapCo.",
  alternates: { canonical: `${siteUrl}/` },
  openGraph: {
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description:
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing.",
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
    description:
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing.",
    images: [`${siteUrl}/custom-star-map-anniversary.png`],
  },
};

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const tiers = getPricingTiers();
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
        description: "Personalized star map generator for special dates and locations.",
        brand: { "@type": "Brand", name: "StarMapCo" },
        image: [`${siteUrl}/custom-star-map-anniversary.webp`],
        offers: {
          "@type": "Offer",
          priceCurrency: schemaCurrency,
          price: schemaPrice,
          priceValidUntil,
          availability: "https://schema.org/InStock",
          url: `${siteUrl}/`,
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How accurate are StarMapCo custom star maps?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Extremely accurate—using professional astronomy libraries based on skyfield and Yale catalogs for precise star positions.",
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
              text: `Free offers a basic preview and watermarked export. Premium unlocks start at ${priceLabel} per HD download, with ${packLabel} for 3 or ${subscriptionLabel}/mo unlimited options.`,
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
            name: "Is this a one-time purchase or subscription?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Both: one-time HD downloads or an unlimited monthly subscription.",
            },
          },
          {
            "@type": "Question",
            name: "Are the maps suitable for printing?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes—designed to be print-ready up to 6000x6000 resolution for posters and frames.",
            },
          },
          {
            "@type": "Question",
            name: "Can I share my custom star map with others?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Generate and share images or links now; public sharing options are coming soon.",
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
              text: "Instant real-time preview, accurate science, premium visuals, and flexible pricing for one-time or unlimited access.",
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
      <HomeHero priceLabels={priceLabels} />
      <HomeStaticSections
        priceLabels={priceLabels}
        promoStatus={promoStatus}
        promoCode={promoCode}
      />
    </>
  );
}
