import type { Metadata } from "next";
import PolicyShell from "@/components/policy/PolicyShell";
import { getBusinessProfile } from "@/lib/businessProfile";
import { PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS, getPrintDeliveryEstimateLine, getPrintStandardShippingOnlyLine } from "@/lib/commerceFacts";
import { buildPolicyLastUpdatedLine } from "@/lib/policyMeta";
import { getPrintAllowedCountries, getPrintProductionReviewDisclosure } from "@/lib/printCheckoutConfig";
import { getPrintFreeShippingOfferLine, getPrintFreeShippingQualifyingHint } from "@/lib/printFreeShipping";
import { getPrintfulShippingRate, getPrintShippingCountryLabel } from "@/lib/printfulShipping";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";

export const metadata: Metadata = {
  title: "Shipping Policy | StarMapCo",
  description:
    "Shipping policy for StarMapCo physical prints, including supported countries, delivery ranges, and support contact details.",
  alternates: {
    canonical: `${siteUrl}/shipping`,
  },
};

type ShippingRow = {
  country: string;
  countryLabel: string;
  unframedRate: string;
  framedRate: string;
  estimate: string;
};

function formatUsd(amount?: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function buildShippingRows(): ShippingRow[] {
  const countries = getPrintAllowedCountries();
  return countries.map((country) => {
    const unframed = getPrintfulShippingRate("poster_unframed", country);
    const framed = getPrintfulShippingRate("poster_framed", country);
    const minDays =
      typeof framed?.min_delivery_days === "number" ? framed.min_delivery_days : unframed?.min_delivery_days;
    const maxDays =
      typeof framed?.max_delivery_days === "number" ? framed.max_delivery_days : unframed?.max_delivery_days;

    return {
      country,
      countryLabel: getPrintShippingCountryLabel(country),
      unframedRate: formatUsd(unframed?.rate),
      framedRate: formatUsd(framed?.rate),
      estimate:
        typeof minDays === "number" && typeof maxDays === "number"
          ? `${minDays}-${maxDays} business days`
          : "Varies by destination",
    };
  });
}

export default function ShippingPage() {
  const rows = buildShippingRows();
  const profile = getBusinessProfile();
  const freeShippingOffer = getPrintFreeShippingOfferLine();
  const freeShippingHint = getPrintFreeShippingQualifyingHint();

  return (
    <PolicyShell
      variant="cosmic"
      title="Shipping policy"
      lastUpdatedLabel={buildPolicyLastUpdatedLine("shipping")}
      maxWidthClass="max-w-5xl"
    >
        <p className="mt-6 text-sm text-neutral-900 sm:text-base">
          StarMapCo supports digital delivery worldwide and physical print shipping to the countries listed below.
          Shipping cost is shown at checkout before payment is finalized.
        </p>
        <p className="mt-3 text-sm text-neutral-900 sm:text-base">
          Print orders are made to order. Typical fulfillment time before shipment is {PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS},
          plus carrier transit time shown below. {getPrintDeliveryEstimateLine()}
        </p>
        <p className="mt-3 text-sm text-neutral-900 sm:text-base">{getPrintStandardShippingOnlyLine()}</p>
        {freeShippingOffer ? (
          <section className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-neutral-900 sm:text-base">
            <h2 className="text-lg font-semibold text-midnight">Free shipping on larger print orders</h2>
            <p className="mt-2">{freeShippingOffer}</p>
            {freeShippingHint ? <p className="mt-2 text-neutral-800">{freeShippingHint}</p> : null}
            <p className="mt-2 text-neutral-800">
              Merchandise subtotal is calculated before shipping and tax. Promo codes that reduce the subtotal below the
              threshold may remove free shipping.
            </p>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-xl font-semibold text-midnight">Physical print countries</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-200/80 bg-white/85">
            <table className="min-w-full text-left text-xs text-neutral-900 sm:text-sm">
              <thead className="bg-amber-100/80 text-[11px] uppercase tracking-wide text-midnight sm:text-xs">
                <tr>
                  <th className="px-3 py-2 font-semibold">Country</th>
                  <th className="px-3 py-2 font-semibold">Unframed shipping</th>
                  <th className="px-3 py-2 font-semibold">Framed shipping</th>
                  <th className="px-3 py-2 font-semibold">Transit after production</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.country} className="border-t border-amber-100/80">
                    <td className="px-3 py-2">{row.countryLabel}</td>
                    <td className="px-3 py-2">{row.unframedRate}</td>
                    <td className="px-3 py-2">{row.framedRate}</td>
                    <td className="px-3 py-2">{row.estimate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 space-y-3 text-sm text-neutral-900 sm:text-base">
          <h2 className="text-xl font-semibold text-midnight">Notes</h2>
          <p>{getPrintProductionReviewDisclosure()} Tracking is provided when your order ships.</p>
          <p>
            Physical orders are fulfilled through third-party print facilities selected by destination and production
            availability, while StarMapCo handles customer support directly.
          </p>
          <p>
            Delivery ranges on this page are estimates in business days after fulfillment and are not guaranteed
            delivery dates. They may change due to customs processing, carrier delays, weather, or local disruptions.
          </p>
          <p>
            Local import duties, customs charges, VAT, or brokerage fees may apply in some destinations and are the
            customer&apos;s responsibility unless they are already included at checkout.
          </p>
          <p>
            If a print arrives damaged or there is a shipping issue, contact{" "}
            <a href={`mailto:${profile.email}`} className="font-semibold text-midnight underline">
              {profile.email}
            </a>{" "}
            within 30 days with your order details and photos.
          </p>
        </section>
    </PolicyShell>
  );
}
