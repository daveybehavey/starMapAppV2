import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { formatPrice, getPricingInfo } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Custom Star Map & Constellation Map",
  description:
    "Create a custom star map or constellation map of any date and location. Instant preview, print-ready download, and one-time unlock at StarMapCo.",
  alternates: { canonical: "https://starmapco.com/" },
  openGraph: {
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description:
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready download, and one-time unlock.",
    url: "https://starmapco.com/",
    images: [
      {
        url: "https://starmapco.com/custom-star-map-anniversary.webp",
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
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready download, and one-time unlock.",
    images: ["https://starmapco.com/custom-star-map-anniversary.png"],
  },
};

export default function HomePage() {
  const pricingInfo = getPricingInfo();
  const priceLabel = formatPrice(
    pricingInfo.activeAmountCents,
    (pricingInfo.currency || "USD").toUpperCase()
  );
  const schemaPrice = (pricingInfo.activeAmountCents / 100).toFixed(2);
  const schemaCurrency = (pricingInfo.currency || "USD").toUpperCase();
  const priceValidUntil = (() => {
    const promoEnd = pricingInfo.promoEnd;
    if (promoEnd && promoEnd.getTime() > Date.now()) {
      return promoEnd.toISOString().slice(0, 10);
    }
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
        image: ["https://starmapco.com/custom-star-map-anniversary.webp"],
        offers: {
          "@type": "Offer",
          priceCurrency: schemaCurrency,
          price: schemaPrice,
          priceValidUntil,
          availability: "https://schema.org/InStock",
          url: "https://starmapco.com/",
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
              text: `Free offers a basic preview and watermarked export. Premium (${priceLabel} one-time) gives HD no-watermark PNG and advanced visuals.`,
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
              text: `One-time ${priceLabel} unlock per device/browser, stored locally—no subscriptions.`,
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
              text: "Instant real-time preview, accurate science, premium visuals, and an affordable one-time unlock with no subscriptions.",
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        id="product-faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <HomeClient />
    </>
  );
}
