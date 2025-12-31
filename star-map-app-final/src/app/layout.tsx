import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner";

export const metadata: Metadata = {
  metadataBase: new URL("https://starmapco.com"),
  title: {
    default: "Buy Custom Star Map for Anniversary | StarMapCo",
    template: "%s | StarMapCo",
  },
  description:
    "Buy personalized star maps for special moments. Customize date, location, and styles at StarMapCo for anniversaries, birthdays, and more.",
  keywords: [
    "custom star map",
    "personalized night sky print",
    "star map generator",
    "wedding star map",
    "anniversary gift",
  ],
  alternates: {
    canonical: "https://starmapco.com",
  },
  openGraph: {
    title: "Buy Your Personalized Star Map | StarMapCo",
    description:
      "Create custom star maps with accurate night skies for anniversaries, birthdays, and more.",
    url: "https://starmapco.com",
    siteName: "StarMapCo",
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
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
    shortcut: "/favicon.png",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buy Your Personalized Star Map | StarMapCo",
    description: "Create custom star maps with accurate night skies for anniversaries, birthdays, and more.",
    images: ["https://starmapco.com/custom-star-map-anniversary.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="text-midnight min-h-screen antialiased">
        <div className="cosmic-backdrop">{children}</div>
        <footer className="bg-[rgba(247,241,227,0.92)] px-6 py-4 text-sm text-neutral-800 shadow-[0_-6px_20px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span>© {new Date().getFullYear()} StarMapCo</span>
            <Link href="/returns" className="font-semibold text-midnight hover:underline">
              Returns &amp; Refunds
            </Link>
          </div>
        </footer>
        <CookieBanner />
        <script
          id="product-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Product",
                  name: "Custom Star Map",
                  description: "Personalized star map generator for special dates and locations.",
                  brand: { "@type": "Brand", name: "StarMapCo" },
                  offers: {
                    "@type": "Offer",
                    priceCurrency: "USD",
                    price: "9.99",
                    availability: "https://schema.org/InStock",
                  },
                  review: [],
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
                        text: "Free offers a basic preview and watermarked export. Premium ($9.99 one-time) gives HD no-watermark PNG/PDF and advanced visuals.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "How do I export or download my star map?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "After premium unlock, download a high-resolution PNG or PDF directly from the app.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Is this a one-time purchase or subscription?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "One-time $9.99 unlock per device/browser, stored locally—no subscriptions.",
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
            }),
          }}
        />
      </body>
    </html>
  );
}
