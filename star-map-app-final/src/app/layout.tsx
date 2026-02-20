import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Playfair_Display } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
  preload: true,
});

// Revalidate pages every hour to keep pricing data fresh
export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const socialProfiles = (process.env.NEXT_PUBLIC_SOCIAL_LINKS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https?:\/\//i.test(value));
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StarMapCo | Custom Star Map & Constellation Map",
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
        url: `${siteUrl}/custom-star-map-anniversary.png`,
        width: 1200,
        height: 630,
        alt: "Custom star map preview from StarMapCo",
      },
    ],
    type: "website",
  },
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: "/favicon.ico",
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
  width: "device-width",
  initialScale: 1,
  themeColor: "#050915",
};

const siteSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "StarMapCo",
      url: siteUrl,
      logo: `${siteUrl}/favicon.ico`,
      email: "support@starmapco.com",
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@starmapco.com",
        },
      ],
      ...(socialProfiles.length ? { sameAs: socialProfiles } : {}),
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
      <body className={`text-midnight min-h-screen antialiased ${playfair.variable}`}>
        <div className="cosmic-backdrop">
          {children}
        </div>
        <footer className="bg-[rgba(247,241,227,0.92)] px-6 py-4 text-sm text-neutral-800 shadow-[0_-6px_20px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} StarMapCo</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm">
              <Link href="/star-map-gallery" prefetch={false} className="font-semibold text-midnight hover:underline">
                Gallery
              </Link>
              <Link href="/star-map-gift-ideas" prefetch={false} className="font-semibold text-midnight hover:underline">
                Gift Ideas
              </Link>
              <Link href="/blog" prefetch={false} className="font-semibold text-midnight hover:underline">
                Blog
              </Link>
              <Link href="/privacy" prefetch={false} className="font-semibold text-midnight hover:underline">
                Privacy Policy
              </Link>
              <Link href="/returns" prefetch={false} className="font-semibold text-midnight hover:underline">
                Returns &amp; Refunds
              </Link>
              <a href="mailto:support@starmapco.com" className="font-semibold text-midnight hover:underline">
                Contact
              </a>
            </div>
          </div>
        </footer>
        <script
          id="site-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
      </body>
    </html>
  );
}
