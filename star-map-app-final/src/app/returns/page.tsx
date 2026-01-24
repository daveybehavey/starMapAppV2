import type { Metadata } from "next";
import ReturnsContent from "./ReturnsContent";

export const metadata: Metadata = {
  title: "Returns & Refunds Policy",
  description:
    "StarMapCo returns and refunds policy for custom digital star maps. Learn about eligibility, timelines, and how to request a refund.",
  alternates: { canonical: "https://starmapco.com/returns" },
};

const returnsSchema = {
  "@context": "https://schema.org",
  "@type": "MerchantReturnPolicy",
  appliesToDeliveryMethod: "http://schema.org/OnSitePickup",
  merchantReturnDays: 7,
  returnPolicyCategory: "http://schema.org/MerchantReturnNotPermitted",
  applicableCountry: "US",
  returnMethod: "http://schema.org/ReturnByMail",
  returnFees: "http://schema.org/FreeReturn",
};

export default function ReturnsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(returnsSchema) }}
      />
      <ReturnsContent />
    </>
  );
}
