import type { Metadata } from "next";
import ReturnsContent from "./ReturnsContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Returns & Refunds Policy | StarMapCo",
  description:
    "StarMapCo returns and refunds policy for custom digital downloads and made-to-order physical prints.",
  alternates: { canonical: `${siteUrl}/returns` },
};

export default function ReturnsPage() {
  return (
    <ReturnsContent />
  );
}
