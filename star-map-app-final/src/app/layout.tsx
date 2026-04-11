import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { Playfair_Display } from "next/font/google";
import ReferralAttributionClient from "@/components/ReferralAttributionClient";
import AnalyticsConsentManager from "@/components/AnalyticsConsentManager";
import PromotionCaptureSlideIn from "@/components/PromotionCaptureSlideIn";
import { getBusinessPhoneHref, getBusinessProfile } from "@/lib/businessProfile";

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
const businessProfile = getBusinessProfile();
type SocialLink = {
  label: string;
  href: string;
};

const defaultSocialLinks: SocialLink[] = [
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61584233102201" },
  { label: "Pinterest", href: "https://ca.pinterest.com/StarMapCo/" },
  { label: "X", href: "https://x.com/StarMapCo" },
  { label: "TikTok", href: "https://www.tiktok.com/@starmapco" },
];

const footerLinks = [
  { label: "About", href: "/about" },
  { label: "Personalized Star Map", href: "/personalized-star-map" },
  { label: "Star Map Gift", href: "/star-map-gift" },
  { label: "Gallery", href: "/star-map-gallery" },
  { label: "Blog", href: "/blog" },
  { label: "My Downloads", href: "/my-downloads" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
  { label: "Shipping Policy", href: "/shipping" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Returns & Refunds", href: "/returns" },
] as const;

function inferSocialLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("facebook.com")) return "Facebook";
    if (hostname.includes("pinterest.com")) return "Pinterest";
    if (hostname.includes("x.com") || hostname.includes("twitter.com")) return "X";
    if (hostname.includes("tiktok.com")) return "TikTok";
  } catch {
    // Fallback below
  }
  return "Social";
}

const envSocialLinks = (process.env.NEXT_PUBLIC_SOCIAL_LINKS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https?:\/\//i.test(value))
  .map((href) => ({ label: inferSocialLabel(href), href })) as SocialLink[];

const socialLinks = envSocialLinks.length ? envSocialLinks : defaultSocialLinks;
const socialProfiles = socialLinks.map((item) => item.href);

function SocialIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  if (normalized.includes("facebook")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current sm:h-3.5 sm:w-3.5">
        <path d="M13.7 21v-8h2.6l.4-3h-3V8.2c0-.9.3-1.5 1.6-1.5h1.5V4c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.4V10H7.3v3h2.6v8h3.8z" />
      </svg>
    );
  }
  if (normalized.includes("pinterest")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current sm:h-3.5 sm:w-3.5">
        <path d="M12 3.4c-4.6 0-7 3.3-7 6.1 0 1.7.6 3.2 2 3.8.2.1.3 0 .3-.2 0-.2.1-.8.1-.9 0-.1 0-.2-.1-.4-.4-.5-.7-1.2-.7-2.2 0-2.9 2.2-5.4 5.6-5.4 3 0 4.7 1.9 4.7 4.3 0 3.2-1.4 5.9-3.5 5.9-1.2 0-2-1-1.7-2.2.3-1.5 1-3.1 1-4.1 0-.9-.5-1.7-1.5-1.7-1.2 0-2.2 1.2-2.2 2.9 0 1 .4 1.8.4 1.8l-1.4 5.7c-.3 1.1 0 2.4 0 2.6 0 .1.1.2.2.1.2-.3 1-1.4 1.3-2.5.1-.3.5-2 .5-2 .3.6 1.4 1.2 2.5 1.2 3.3 0 5.6-3.1 5.6-7.2 0-3.1-2.6-5.9-6.6-5.9z" />
      </svg>
    );
  }
  if (normalized === "x" || normalized.includes("twitter")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current sm:h-3.5 sm:w-3.5">
        <path d="M18.9 2.3h2.8l-6.2 7.1L23 21.7h-5.7l-4.5-5.9-5.2 5.9H4.8l6.7-7.7L1 2.3h5.8l4 5.3 4.7-5.3zm-1 17h1.6L6.8 4.6H5.1L17.9 19.3z" />
      </svg>
    );
  }
  if (normalized.includes("tiktok")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current sm:h-3.5 sm:w-3.5">
        <path d="M15 2c.2 1.8 1.2 3.4 2.8 4.3.9.5 1.8.8 2.9.8v3.1c-1.2 0-2.4-.3-3.5-.9-.3-.2-.6-.3-.9-.5v6.5c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6h.7v3.2h-.7c-1.5 0-2.8 1.2-2.8 2.8s1.2 2.8 2.8 2.8 2.8-1.2 2.8-2.8V2h2.9z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current sm:h-3.5 sm:w-3.5">
      <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm6.8 8h-2.9a15 15 0 00-1-5A7.2 7.2 0 0118.8 11zM12 4.8c.8 1.1 1.5 2.9 1.7 5.2h-3.4c.2-2.3.9-4.1 1.7-5.2zM8.1 6a15 15 0 00-1 5H4.2A7.2 7.2 0 018.1 6zm-3.9 7h2.9c.1 1.8.5 3.5 1 5A7.2 7.2 0 014.2 13zM12 19.2c-.8-1.1-1.5-2.9-1.7-5.2h3.4c-.2 2.3-.9 4.1-1.7 5.2zM15.9 18a15 15 0 001-5h2.9a7.2 7.2 0 01-3.9 5z" />
    </svg>
  );
}
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StarMapCo | Custom Star Map & Constellation Map",
    template: "%s",
  },
  description:
    "Create a custom star map or constellation map for any date and location. Start with a free preview, then choose framed print, unframed print, or HD digital delivery at StarMapCo.",
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
      "Create a custom star map or constellation map for any date and location. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
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
      "Create a custom star map or constellation map for any date and location. Start with a free preview, then choose framed print, unframed print, or HD digital delivery.",
    images: [`${siteUrl}/custom-star-map-anniversary.png`],
  },
  verification: {
    other: {
      "p:domain_verify": "789a8db329c08fe1a0a43fb579bf8611",
    },
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
      name: businessProfile.name,
      url: siteUrl,
      logo: `${siteUrl}/favicon.ico`,
      email: businessProfile.email,
      ...(businessProfile.phone ? { telephone: getBusinessPhoneHref() } : {}),
      ...(businessProfile.address ? { address: businessProfile.address } : {}),
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: businessProfile.email,
          ...(businessProfile.phone ? { telephone: getBusinessPhoneHref() } : {}),
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
        <Suspense fallback={null}>
          <ReferralAttributionClient />
        </Suspense>
        <AnalyticsConsentManager />
        <div className="cosmic-backdrop">
          {children}
        </div>
        <Suspense fallback={null}>
          <PromotionCaptureSlideIn />
        </Suspense>
        <footer className="relative overflow-hidden border-t border-[#b5934f]/45 bg-[linear-gradient(140deg,rgba(4,10,31,0.98),rgba(8,24,61,0.97),rgba(10,34,80,0.94))] text-[#f7f0e2] shadow-[0_-14px_36px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(248,212,117,0.12),transparent_42%),radial-gradient(circle_at_88%_22%,rgba(130,173,255,0.16),transparent_38%)]" />
          <div className="relative mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-9">
            <div className="grid gap-5 sm:gap-8 md:grid-cols-[1.2fr_1fr_auto] md:items-start">
              <div>
                <Link href="/" prefetch={false} className="inline-flex items-center text-base font-semibold tracking-wide text-[#f8e8bf] sm:text-lg">
                  {businessProfile.name}
                </Link>
                <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#d5ddf2] sm:mt-2 sm:text-sm">
                  Personalized night sky maps for weddings, anniversaries, birthdays, and once-in-a-lifetime moments.
                </p>
                <a
                  href={`mailto:${businessProfile.email}`}
                  className="mt-3 inline-flex items-center rounded-full border border-[#b5934f]/60 bg-[rgba(8,18,51,0.78)] px-3.5 py-1.5 text-xs font-semibold text-[#f8d475] transition hover:border-[#f8d475] hover:text-[#ffe29a] sm:mt-4 sm:px-4 sm:text-sm"
                >
                  {businessProfile.email}
                </a>
                {businessProfile.phone ? (
                  <a
                    href={`tel:${getBusinessPhoneHref()}`}
                    className="mt-2 inline-flex items-center text-xs font-semibold text-[#f7f0e2] sm:text-sm"
                  >
                    {businessProfile.phone}
                  </a>
                ) : null}
                {businessProfile.address ? (
                  <p className="mt-2 text-[11px] text-[#cbd6ee] sm:text-xs">
                    {businessProfile.address}
                  </p>
                ) : null}
                {businessProfile.hours ? (
                  <p className="mt-1 text-[11px] text-[#cbd6ee] sm:text-xs">
                    Support hours: {businessProfile.hours}
                  </p>
                ) : null}
              </div>

              <nav aria-label="Footer links">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f8d475] sm:mb-3 sm:text-xs sm:tracking-[0.24em]">Quick links</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:gap-x-5 sm:gap-y-2 sm:text-sm">
                  {footerLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className="w-fit text-[#e5ebfb] transition hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </nav>

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f8d475] md:text-right sm:mb-3 sm:text-xs sm:tracking-[0.24em]">Follow</p>
                <div className="flex flex-nowrap gap-1.5 sm:flex-wrap sm:gap-2 md:justify-end">
                  {socialLinks.map((social) => (
                    <a
                      key={social.href}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Follow StarMapCo on ${social.label}`}
                      title={social.label}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#b5934f]/65 bg-[rgba(7,16,46,0.78)] text-[#f7f0e2] transition hover:-translate-y-0.5 hover:border-[#f8d475] hover:text-white sm:h-8 sm:w-8 md:h-9 md:w-9"
                    >
                      <SocialIcon label={social.label} />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-1.5 border-t border-white/14 pt-3 text-[11px] text-[#c9d1e6] sm:mt-7 sm:gap-2 sm:pt-4 sm:text-xs sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} StarMapCo. All rights reserved.</span>
              <span className="hidden sm:inline">Fast previews. Print-ready exports. No account required.</span>
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
