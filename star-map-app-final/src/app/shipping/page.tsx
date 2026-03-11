import type { Metadata } from "next";
import { getPrintAllowedCountries } from "@/lib/printCheckoutConfig";
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <h1 className="text-3xl font-semibold text-midnight sm:text-4xl">Shipping policy</h1>
        <p className="mt-4 text-sm text-neutral-900 sm:text-base">
          StarMapCo supports digital delivery worldwide and physical print shipping to the countries listed below.
          Shipping cost is shown at checkout before payment is finalized.
        </p>

        <section className="mt-6">
          <h2 className="text-xl font-semibold text-midnight">Physical print countries</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-200/80 bg-white/85">
            <table className="min-w-full text-left text-xs text-neutral-900 sm:text-sm">
              <thead className="bg-amber-100/80 text-[11px] uppercase tracking-wide text-midnight sm:text-xs">
                <tr>
                  <th className="px-3 py-2 font-semibold">Country</th>
                  <th className="px-3 py-2 font-semibold">Unframed shipping</th>
                  <th className="px-3 py-2 font-semibold">Framed shipping</th>
                  <th className="px-3 py-2 font-semibold">Delivery estimate</th>
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
          <p>
            Orders are reviewed before production when manual approval mode is enabled. Production begins after review,
            then tracking is provided by the print partner.
          </p>
          <p>
            If a print arrives damaged or there is a shipping issue, contact{" "}
            <a href="mailto:support@starmapco.com" className="font-semibold text-midnight underline">
              support@starmapco.com
            </a>{" "}
            within 7 days with your order details and photos.
          </p>
        </section>
      </div>
    </main>
  );
}
