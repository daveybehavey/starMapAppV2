import type { Metadata } from "next";
import { getBusinessPhoneHref, getBusinessProfile } from "@/lib/businessProfile";
import {
  getPrintPhysicalOrderSummaryLine,
  getPrintProductionTimelineLine,
  getPrintStandardShippingOnlyLine,
} from "@/lib/commerceFacts";
import { getPrintProductionReviewDisclosure } from "@/lib/printCheckoutConfig";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

const aboutDescription = "Learn how StarMapCo works, what we sell, and how customer support and print fulfillment are handled.";

export const metadata: Metadata = {
  title: "About StarMapCo",
  description: aboutDescription,
  alternates: { canonical: `${siteUrl}/about` },
  openGraph: {
    title: "About StarMapCo",
    description: aboutDescription,
    url: `${siteUrl}/about`,
    siteName: "StarMapCo",
    type: "website",
  },
};

export default function AboutPage() {
  const profile = getBusinessProfile();
  const phoneHref = getBusinessPhoneHref();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">About</p>
        <h1 className="mt-2 text-3xl font-semibold text-midnight sm:text-4xl">About {profile.name}</h1>

        <div className="mt-6 space-y-5 text-neutral-900 sm:text-lg">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">What StarMapCo sells</h2>
            <p>
              StarMapCo is an online custom star map studio. Customers create a personalized map from a chosen date,
              time, and location, preview the design, and then decide whether to keep it as an HD digital download or
              place a made-to-order physical print order.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">How orders work</h2>
            <p>
              Digital orders unlock download access after payment verification. Physical print orders are custom-made
              from the approved design. {getPrintProductionReviewDisclosure()} {getPrintPhysicalOrderSummaryLine()}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">Fulfillment model</h2>
            <p>
              StarMapCo sells the personalized product, handles checkout, and provides customer support directly.
              Physical print orders are produced and shipped through third-party print and carrier partners.{" "}
              {getPrintProductionTimelineLine()} {getPrintStandardShippingOnlyLine()}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">Support and contact</h2>
            <p>
              Customer support is handled directly by {profile.name}. For help with billing, downloads, print issues,
              or delivery questions, contact{" "}
              <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              .
            </p>
            {profile.phone ? (
              <p>
                Phone:{" "}
                <a className="font-semibold text-midnight underline" href={`tel:${phoneHref}`}>
                  {profile.phone}
                </a>
              </p>
            ) : null}
            {profile.hours ? <p>Support hours: {profile.hours}</p> : null}
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">Policies</h2>
            <p>
              Shipping, returns, privacy, and terms are published on this site so customers can review them before
              purchasing.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
