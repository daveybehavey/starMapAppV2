import type { Metadata } from "next";
import {
  Cinzel,
  Cormorant_Garamond as CormorantGaramond,
  Great_Vibes as GreatVibes,
  Montserrat,
  Playfair_Display as PlayfairDisplay,
} from "next/font/google";
import "./globals.css";
import PosthogProvider from "@/components/PosthogProvider";

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
    default: "StarMapCo — Custom Night Sky Maps",
    template: "%s | StarMapCo",
  },
  description:
    "Create a personalized, print-ready star map with astronomically accurate night skies. Custom night sky maps for your special moment.",
  openGraph: {
    title: "StarMapCo — Custom Night Sky Maps",
    description:
      "Create a personalized, print-ready star map with astronomically accurate night skies. Custom night sky maps for your special moment.",
    url: "https://starmapco.com",
    siteName: "StarMapCo",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "StarMapCo preview of a custom night sky map",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StarMapCo — Custom Night Sky Maps",
    description:
      "Create a personalized, print-ready star map with astronomically accurate night skies. Custom night sky maps for your special moment.",
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} ${cinzel.variable} ${greatVibes.variable} ${cormorant.variable} ${montserrat.variable} bg-parchment text-midnight min-h-screen antialiased`}
      >
        <div className="min-h-screen bg-gradient-to-br from-parchment via-white to-parchment">
          {children}
        </div>
        <PosthogProvider />
        <script
          id="product-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: "Custom Star Map",
              description: "Personalized night sky map based on date and location.",
              brand: { "@type": "Brand", name: "StarMapCo" },
              offers: {
                "@type": "Offer",
                price: "9.99",
                priceCurrency: "USD",
                availability: "InStock",
              },
            }),
          }}
        />
      </body>
    </html>
  );
}
