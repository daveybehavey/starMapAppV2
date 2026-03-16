import Link from "next/link";
import { formatPrintPriceWithShipping, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";

type ReceiveItem = {
  title: string;
  detail: string;
};

type WhatYouReceiveModuleProps = {
  heading?: string;
  intro?: string;
  items?: ReceiveItem[];
};

const defaultItems: ReceiveItem[] = [
  {
    title: "Astronomically accurate map",
    detail: "Rendered from your selected date, time, and location using the same engine used in preview.",
  },
  {
    title: "HD watermark-free PNG",
    detail: "Final export is up to 6000x6000 so stars and text stay sharp when printed.",
  },
  {
    title: "Immediate unlock after payment",
    detail: "Checkout completes in Stripe, then HD access appears right away in your success/download flow.",
  },
  {
    title: "Print + policy guidance",
    detail: "You get direct links for print planning, frame sizing, and returns before and after checkout.",
  },
];

export default function WhatYouReceiveModule({
  heading = "What you receive",
  intro = "Exactly what unlocks when you move from free preview to paid HD export.",
  items = defaultItems,
}: WhatYouReceiveModuleProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const printAutoConfirm = /^(1|true|yes)$/i.test(
    (process.env.PRINTFUL_AUTO_CONFIRM || "").trim(),
  );
  const shippingDisclosure = getPrintShippingDisclosure();
  const printTiers = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );
  const digitalAddOnPrice = formatPrice(digitalAddOn.amountCents, digitalAddOn.currency);

  return (
    <section className="brand-light-panel content-visibility-auto mt-6 space-y-4 rounded-3xl p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="brand-light-card-accent rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-midnight sm:text-base">{item.title}</h3>
            <p className="mt-1 text-xs text-neutral-700 sm:text-sm">{item.detail}</p>
          </div>
        ))}
      </div>

      {printCheckoutEnabled ? (
        <div className="brand-light-card rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-midnight sm:text-base">If you choose print</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="brand-light-card-accent rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Framed</p>
              <p className="mt-1 text-sm font-semibold text-midnight">{printTiers.poster_framed.label}</p>
              <p className="mt-1 text-sm text-neutral-700">{framedPrice}</p>
            </div>
            <div className="brand-light-card rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Unframed</p>
              <p className="mt-1 text-sm font-semibold text-midnight">{printTiers.poster_unframed.label}</p>
              <p className="mt-1 text-sm text-neutral-700">{unframedPrice}</p>
            </div>
            <div className="brand-light-card rounded-2xl px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Optional backup</p>
              <p className="mt-1 text-sm font-semibold text-midnight">HD digital add-on</p>
              <p className="mt-1 text-sm text-neutral-700">{digitalAddOnPrice}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="brand-light-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Delivery timeline</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
          <li>Design and preview your map for free.</li>
          <li>Complete secure checkout in Stripe.</li>
          <li>Unlock HD and download immediately.</li>
          {printCheckoutEnabled ? (
            <>
              <li>
                {printAutoConfirm
                  ? "If you add print, the physical order is submitted for fulfillment after payment."
                  : "If you add print, the physical order is created for manual review before production starts."}
              </li>
              <li>{shippingDisclosure}</li>
            </>
          ) : null}
        </ol>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/how-to-print-star-map" className="text-amber-700 underline hover:text-amber-800">
          Print and frame guide
        </Link>
        <Link href="/returns" className="text-amber-700 underline hover:text-amber-800">
          Returns and refunds policy
        </Link>
      </div>
    </section>
  );
}
