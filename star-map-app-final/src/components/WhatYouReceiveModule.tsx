import Link from "next/link";

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
  intro = "Exactly what unlocks when you move from free preview to final purchase.",
  items = defaultItems,
}: WhatYouReceiveModuleProps) {
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
