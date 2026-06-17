import { PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS } from "@/lib/commerceFacts";
import { getFramedHdBundlePriceLine, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { formatPrintDeliveryDisclosure } from "@/lib/printfulShipping";

const steps = [
  {
    title: "Preview free",
    detail: "Enter the wedding date and venue. Customize wording, layout, and colors in under five minutes.",
  },
  {
    title: "Checkout when it looks right",
    detail: "Choose framed + HD, unframed, or HD-only. Shipping and total show before Stripe — no surprise fees.",
  },
  {
    title: "HD instant · print after review",
    detail: "HD unlocks immediately. We review your print file, then production and shipping begin.",
  },
] as const;

export default function WeddingGiftJourneySection() {
  const bundleLine = getFramedHdBundlePriceLine();
  const shippingDisclosure = getPrintShippingDisclosure();
  const framedDelivery = formatPrintDeliveryDisclosure("poster_framed", "US");

  return (
    <section className="content-visibility-auto mt-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">How it works</p>
        <h2 className="text-xl font-semibold text-midnight sm:text-2xl">From preview to gift-ready</h2>
        <p className="max-w-2xl text-sm text-neutral-800 sm:text-base">
          Most wedding buyers start with the <span className="font-semibold text-midnight">{bundleLine}</span> bundle.
          You only pay after the map feels right.
        </p>
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-4 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              Step {index + 1}
            </p>
            <h3 className="mt-1 text-base font-semibold text-midnight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">{step.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-2xl border border-black/5 bg-neutral-50 px-4 py-3 text-xs leading-relaxed text-neutral-700 sm:text-sm">
        <span className="font-semibold text-midnight">Timing:</span> HD digital downloads right after payment. Physical
        prints are reviewed first, then produced in {PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}
        {framedDelivery ? ` (${framedDelivery.toLowerCase()} for framed U.S. orders)` : ""}. {shippingDisclosure}
      </div>
    </section>
  );
}
