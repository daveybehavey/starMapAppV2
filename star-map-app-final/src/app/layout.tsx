import type { Metadata } from "next";
import {
  Cinzel,
  Cormorant_Garamond as CormorantGaramond,
  Great_Vibes as GreatVibes,
  Montserrat,
  Playfair_Display as PlayfairDisplay,
} from "next/font/google";
import "./globals.css";
import ConsentManager from "@/components/ConsentManager";

const playfair = PlayfairDisplay({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = CormorantGaramond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const greatVibes = GreatVibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Create Your Custom Star Map | StarMapCo",
    template: "%s | StarMapCo",
  },
  description:
    "Personalized night sky prints for weddings, anniversaries, and birthdays. Relive special moments with accurate star maps, premium effects, and easy sharing.",
  keywords: [
    "custom star map",
    "personalized night sky print",
    "star map generator",
    "wedding star map",
    "anniversary gift",
  ],
  openGraph: {
    title: "Create Your Custom Star Map | StarMapCo",
    description:
      "Capture your milestone under the stars with our interactive star map generator. Print-ready exports, premium effects, and instant sharing.",
    url: "https://starmapco.com",
    siteName: "StarMapCo",
    images: [
      {
        url: "/api/og/sample",
        width: 1200,
        height: 630,
        alt: "Custom star map preview from StarMapCo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Your Custom Star Map | StarMapCo",
    description: "Personalized star maps for special occasions with instant previews and premium finishes.",
    images: ["/api/og/sample"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${cinzel.variable} ${greatVibes.variable} ${cormorant.variable} ${montserrat.variable} text-midnight min-h-screen antialiased`}>
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
                  description: "Personalized night sky map generator with premium effects and sharing.",
                  brand: { "@type": "Brand", name: "StarMapCo" },
                  offers: {
                    "@type": "Offer",
                    price: "9.99",
                    priceCurrency: "USD",
                    availability: "https://schema.org/InStock",
                  },
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
