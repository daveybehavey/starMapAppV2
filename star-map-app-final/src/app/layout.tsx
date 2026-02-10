import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import ClientOverlays from "@/components/ClientOverlays";
import {
  Playfair_Display,
  Cinzel,
  Great_Vibes,
  Cormorant_Garamond,
  Montserrat,
  Libre_Baskerville,
  EB_Garamond,
  Crimson_Text,
  Lora,
  Raleway,
  Poppins,
  Dancing_Script,
  Parisienne,
  Bebas_Neue,
  Abril_Fatface,
} from "next/font/google";

// Current fonts
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
  preload: true,
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
  preload: false,
  display: "swap",
});
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
  preload: false,
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-montserrat",
  preload: false,
  display: "swap",
});

// Premium fonts - Serif
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-libre-baskerville",
  preload: false,
  display: "swap",
});
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-eb-garamond",
  preload: false,
  display: "swap",
});
const crimsonText = Crimson_Text({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-crimson-text",
  preload: false,
  display: "swap",
});
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-lora",
  preload: false,
  display: "swap",
});

// Premium fonts - Sans-serif
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-raleway",
  preload: false,
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
  preload: false,
  display: "swap",
});

// Premium fonts - Script/Decorative
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-dancing-script",
  preload: false,
  display: "swap",
});
const parisienne = Parisienne({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-parisienne",
  preload: false,
  display: "swap",
});

// Premium fonts - Display
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-neue",
  preload: false,
  display: "swap",
});
const abrilFatface = Abril_Fatface({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-abril-fatface",
  preload: false,
  display: "swap",
});

// Revalidate pages every hour to keep pricing data fresh
export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Custom Star Map & Constellation Map | StarMapCo",
    template: "%s | StarMapCo",
  },
  description:
    "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing at StarMapCo.",
  keywords: [
    "custom star map",
    "star map",
    "starmap",
    "constellation map",
    "personalized night sky print",
    "star map generator",
    "wedding star map",
    "anniversary gift",
  ],
  openGraph: {
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description:
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing.",
    url: siteUrl,
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
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/favicon.png",
    shortcut: "/favicon.ico",
  },
  twitter: {
    card: "summary_large_image",
    title: "Custom Star Map & Constellation Map | StarMapCo",
    description:
      "Create a custom star map or constellation map of any date and location. Instant preview, print-ready downloads, and flexible pricing.",
    images: [`${siteUrl}/custom-star-map-anniversary.png`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

const siteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "StarMapCo",
      url: siteUrl,
      logo: `${siteUrl}/favicon.png`,
      email: "support@starmapco.com",
    },
    {
      "@type": "WebSite",
      name: "StarMapCo",
      url: siteUrl,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`text-midnight min-h-screen antialiased ${playfair.variable} ${cinzel.variable} ${greatVibes.variable} ${cormorant.variable} ${montserrat.variable} ${libreBaskerville.variable} ${ebGaramond.variable} ${crimsonText.variable} ${lora.variable} ${raleway.variable} ${poppins.variable} ${dancingScript.variable} ${parisienne.variable} ${bebasNeue.variable} ${abrilFatface.variable}`}>
        <div className="cosmic-backdrop">
          {children}
        </div>
        <footer className="bg-[rgba(247,241,227,0.92)] px-6 py-4 text-sm text-neutral-800 shadow-[0_-6px_20px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span>© {new Date().getFullYear()} StarMapCo</span>
            <div className="flex items-center gap-4">
              <Link href="/blog" className="font-semibold text-midnight hover:underline">
                Blog
              </Link>
              <Link href="/privacy" className="font-semibold text-midnight hover:underline">
                Privacy Policy
              </Link>
              <Link href="/returns" className="font-semibold text-midnight hover:underline">
                Returns &amp; Refunds
              </Link>
            </div>
          </div>
        </footer>
        <ClientOverlays />
        <script
          id="site-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
      </body>
    </html>
  );
}
