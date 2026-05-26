import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Best Personalized Star Map Gift | StarMapCo",
  description:
    "Redirecting to our personalized star map gift page—free preview, then framed print, unframed print, or HD digital delivery.",
  alternates: { canonical: `${siteUrl}/personalized-star-map` },
  robots: { index: true, follow: true },
};

export default function BestPersonalizedStarMapGiftPage() {
  permanentRedirect("/personalized-star-map");
}
