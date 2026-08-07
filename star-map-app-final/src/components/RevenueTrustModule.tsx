import Link from "next/link";
import {
  formatPrintPriceWithShipping,
  getPrintProductionReviewDisclosure,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";

type RevenueTrustModuleProps = {
  heading?: string;
  intro?: string;
};

export default function RevenueTrustModule({
  heading = "Confidence before checkout",
  intro = "Everything below is designed to remove guesswork before you buy.",
}: RevenueTrustModuleProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const shippingDisclosure = getPrintShippingDisclosure();
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const printTiers = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const printFormats = [
    `${printTiers.poster_framed.label} at ${formatPrintPriceWithShipping(
      printTiers.poster_framed.amountCents,
      printTiers.poster_framed.currency,
    )}`,
    `${printTiers.poster_unframed.label} at ${formatPrintPriceWithShipping(
      printTiers.poster_unframed.amountCents,
      printTiers.poster_unframed.currency,
    )}`,
  ];
  const digitalAddOnLabel = formatPrice(digitalAddOn.amountCents, digitalAddOn.currency);

  return (
    <section className="brand-light-panel content-visibility-auto mt-6 space-y-4 rounded-3xl p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="brand-light-card-accent rounded-2xl p-4">
          <p className="text-sm font-semibold text-midnight">Secure payment</p>
          <p className="mt-1 text-xs text-neutral-700">
            Stripe Checkout with card security, plus Apple Pay, Google Pay, or Link on supported devices and browsers.
          </p>
        </div>
        <div className="brand-light-card-accent rounded-2xl p-4">
          <p className="text-sm font-semibold text-midnight">
            {printCheckoutEnabled ? "Digital + physical options" : "Instant digital delivery"}
          </p>
          <p className="mt-1 text-xs text-neutral-700">
            {printCheckoutEnabled
              ? `Unlock HD instantly, or choose ${printFormats[0]} or ${printFormats[1]} from the editor. ${shippingDisclosure}`
              : "HD file unlocks immediately after successful payment verification."}
          </p>
        </div>
        <div className="brand-light-card-accent rounded-2xl p-4">
          <p className="text-sm font-semibold text-midnight">Print-ready quality</p>
          <p className="mt-1 text-xs text-neutral-700">
            Exports up to 6000x6000 PNG so stars and text stay sharp in print, including large poster sizes.
          </p>
        </div>
        <div className="brand-light-card-accent rounded-2xl p-4">
          <p className="text-sm font-semibold text-midnight">Clear policy + support</p>
          <p className="mt-1 text-xs text-neutral-700">Returns policy is public and support is available at support@starmapco.com.</p>
        </div>
      </div>

      <div className="brand-light-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Physical order overview</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="brand-light-card rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Live print formats</p>
            <p className="mt-1 text-sm text-neutral-700">
              Framed uses {printTiers.poster_framed.label.toLowerCase()}, unframed uses {printTiers.poster_unframed.label.toLowerCase()}, and the HD add-on stays available for {digitalAddOnLabel}.
            </p>
          </div>
          <div className="brand-light-card rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Before payment</p>
            <p className="mt-1 text-sm text-neutral-700">
              {shippingDisclosure} Checkout shows the exact variant before the card is charged.
            </p>
          </div>
          <div className="brand-light-card rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">After payment</p>
            <p className="mt-1 text-sm text-neutral-700">
              {productionReviewDisclosure}
            </p>
          </div>
        </div>
      </div>

      <div className="brand-light-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Before you buy checklist</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
          <li>Verify your date and location one last time in preview.</li>
          <li>Check title, subtitle, and dedication spelling.</li>
          <li>Confirm your preferred style and shape before checkout.</li>
          {printCheckoutEnabled && <li>If ordering physical print, choose unframed vs framed before payment.</li>}
          {printCheckoutEnabled && <li>If you want the stronger gift presentation, choose framed; if you already have a frame plan, keep the lower total with unframed.</li>}
          {printCheckoutEnabled && <li>Review your shipping address carefully before paying for a physical order.</li>}
          {printCheckoutEnabled && <li>If a print arrives damaged, contact support@starmapco.com for replacement support.</li>}
          <li>Use the print guide if you need framing confidence.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/how-to-print-star-map" className="text-amber-700 underline hover:text-amber-800">
          Full print and frame guide
        </Link>
        <Link href="/returns" className="text-amber-700 underline hover:text-amber-800">
          Returns and refunds policy
        </Link>
      </div>
    </section>
  );
}
