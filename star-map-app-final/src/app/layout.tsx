import type { Metadata } from "next";
import "./globals.css";
import ConsentManager from "@/components/ConsentManager";

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
        <ConsentManager />
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
                      name: "How do I create a custom star map?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Enter your date, time, and location, choose a style, then reveal and export your sky.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Is the star map astronomically accurate?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes. We render skyfields based on your exact datetime and location with constellation options.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Can I download a high-resolution file?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "You can export a print-ready 6000px file after unlocking premium, or download a free preview.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Do you offer frames or styles?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes. Choose from multiple visual styles, shapes, and text treatments to match your aesthetic.",
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
