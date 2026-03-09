import Link from "next/link";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

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

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
            <h3 className="text-sm font-semibold text-midnight sm:text-base">{item.title}</h3>
            <p className="mt-1 text-xs text-neutral-700 sm:text-sm">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Delivery timeline</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
          <li>Design and preview your map for free.</li>
          <li>Complete secure checkout in Stripe.</li>
          <li>Unlock HD and download immediately.</li>
          {printCheckoutEnabled ? (
            <>
              <li>
                {printAutoConfirm
                  ? "If you add print, the physical order is sent to Printful after payment."
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
