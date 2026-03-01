import Link from "next/link";

type PurchaseTrustPanelProps = {
  heading: string;
  intro: string;
  leftTitle: string;
  leftPoints: string[];
  rightTitle: string;
  rightPoints: string[];
  guideLabel?: string;
  returnsLabel?: string;
};

export default function PurchaseTrustPanel({
  heading,
  intro,
  leftTitle,
  leftPoints,
  rightTitle,
  rightPoints,
  guideLabel = "Print and frame guide",
  returnsLabel = "Returns and refunds",
}: PurchaseTrustPanelProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
      <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <h3 className="text-sm font-semibold text-midnight sm:text-base">{leftTitle}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-800">
            {leftPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <h3 className="text-sm font-semibold text-midnight sm:text-base">{rightTitle}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-800">
            {rightPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      {printCheckoutEnabled && (
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <h3 className="text-sm font-semibold text-midnight sm:text-base">Physical order confidence</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-800">
            <li>Shipping rate and delivery estimate are shown before payment.</li>
            <li>You can choose unframed or framed print checkout based on your gift plan.</li>
            <li>If a print arrives damaged, contact support@starmapco.com and we will help resolve it.</li>
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/how-to-print-star-map" className="text-amber-700 underline hover:text-amber-800">
          {guideLabel}
        </Link>
        <Link href="/returns" className="text-amber-700 underline hover:text-amber-800">
          {returnsLabel}
        </Link>
      </div>
    </section>
  );
}
