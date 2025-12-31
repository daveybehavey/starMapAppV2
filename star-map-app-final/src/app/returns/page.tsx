"use client";

import Script from "next/script";

export default function ReturnsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Script
        id="returns-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MerchantReturnPolicy",
            appliesToDeliveryMethod: "http://schema.org/OnSitePickup",
            merchantReturnDays: 7,
            returnPolicyCategory: "http://schema.org/MerchantReturnNotPermitted",
            applicableCountry: "US",
            returnMethod: "http://schema.org/ReturnByMail",
            returnFees: "http://schema.org/FreeReturn",
          }),
        }}
      />

      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <h1 className="text-3xl font-semibold text-midnight sm:text-4xl">Returns & Refunds Policy</h1>

        <div className="mt-6 space-y-5 text-neutral-900 sm:text-lg">
          <section>
            <h2 className="text-xl font-semibold text-midnight">Introduction</h2>
            <p className="mt-2">
              At StarMapCo, we offer custom digital star maps that are personalized and instantly accessible. Due to
              their nature, most purchases are non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">Eligibility</h2>
            <p className="mt-2">
              Refunds are not available for unlocked or downloaded digital products. Exceptions: Full refunds for
              technical errors (e.g., generation failure) or unprocessed payments. No returns for physical prints if
              added later.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">Process</h2>
            <p className="mt-2">
              To request a refund, contact support@starmapco.com within 7 days of purchase with order details and issue
              description. We process approved refunds via the original payment method within 5-10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">Timelines</h2>
            <p className="mt-2">Refunds must be requested within 7 days; no refunds after 30 days.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">Contact</h2>
            <p className="mt-2">
              Email: support@starmapco.com. Response time: 24-48 hours.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
