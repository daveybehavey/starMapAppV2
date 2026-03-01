"use client";

import { track, trackFunnelStep } from "@/lib/analytics";

type HomeOfferStackProps = {
  priceLabels: {
    single: string;
    pack3: string;
    subscription: string;
    packSavingsPercent: number;
  };
  printLabels: {
    unframed: string;
    framed: string;
    digitalAddOn: string;
  };
};

type DeliveryChoice = "digital" | "print_unframed" | "print_framed";

export default function HomeOfferStack({ priceLabels, printLabels }: HomeOfferStackProps) {
  const handleDeliveryChoice = (choice: DeliveryChoice) => {
    track("delivery_choice_split", {
      source: "home-offer-stack",
      choice,
    });
    track("delivery_choice_selected", {
      source: "home-offer-stack",
      choice,
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-offer-stack",
      plan: `delivery_${choice}`,
    });
  };

  const handlePlanInterest = (plan: "single" | "pack3" | "subscription") => {
    track("digital_plan_interest", {
      source: "home-offer-stack",
      plan,
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-offer-stack",
      plan,
    });
  };

  return (
    <section
      id="delivery-options"
      className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6 lg:px-8"
    >
      <div className="space-y-8 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6 text-white shadow-lg shadow-black/30">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Choose your format</p>
          <h2 className="text-2xl font-semibold sm:text-3xl">Preview first, then pick how you want it delivered</h2>
          <p className="text-sm text-neutral-200 sm:text-base">
            Build your exact sky map in the editor. Checkout supports digital downloads and physical print options.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold text-white">Instant digital</p>
            <p className="mt-1 text-xs text-neutral-200">HD file unlocks immediately after payment</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Up to 6000x6000 PNG</li>
              <li>No watermark on paid export</li>
              <li>Great for local print shops</li>
            </ul>
            <a
              href="/editor?mode=quick&source=home-delivery-digital"
              onClick={() => handleDeliveryChoice("digital")}
              className="mt-3 inline-flex rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/20"
            >
              Start free preview
            </a>
          </article>

          <article className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold text-white">Unframed print</p>
            <p className="mt-1 text-xs text-neutral-200">Professionally printed poster, shipped to your door</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Museum-quality poster stock</li>
              <li>Best if you want your own frame</li>
              <li>{printLabels.unframed}</li>
            </ul>
            <a
              href="/editor?mode=quick&source=home-delivery-print-unframed"
              onClick={() => handleDeliveryChoice("print_unframed")}
              className="mt-3 inline-flex rounded-full border border-amber-300/60 bg-amber-200/20 px-3.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-200/30"
            >
              Start free preview
            </a>
          </article>

          <article className="rounded-2xl border border-amber-300/55 bg-amber-300/15 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Framed print</p>
              <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                MOST POPULAR
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-200">Ready-to-hang physical gift with premium presentation</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Delivered framed and gift-ready</li>
              <li>Shipping estimate shown before payment</li>
              <li>{printLabels.framed}</li>
            </ul>
            <a
              href="/editor?mode=quick&source=home-delivery-print-framed"
              onClick={() => handleDeliveryChoice("print_framed")}
              className="mt-3 inline-flex rounded-full border border-amber-300/70 bg-amber-300/25 px-3.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/35"
            >
              Start free preview
            </a>
          </article>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/15 bg-white/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Digital HD plans</p>
            <span className="text-[11px] text-neutral-300">Pay only when your preview looks right.</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href="/editor?mode=quick&source=home-plan-single"
              onClick={() => handlePlanInterest("single")}
              className="rounded-xl border border-white/20 bg-white/10 p-3 text-left transition hover:border-amber-300/50 hover:bg-white/15"
            >
              <p className="text-sm font-semibold text-white">Single HD</p>
              <p className="text-sm font-semibold text-amber-200">{priceLabels.single}</p>
            </a>
            <a
              href="/editor?mode=quick&source=home-plan-pack3"
              onClick={() => handlePlanInterest("pack3")}
              className="rounded-xl border border-amber-300/55 bg-amber-300/15 p-3 text-left transition hover:border-amber-300/75 hover:bg-amber-300/20"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">3-pack HD</p>
                <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                  RECOMMENDED
                </span>
              </div>
              <p className="text-sm font-semibold text-amber-200">
                {priceLabels.pack3}
                {priceLabels.packSavingsPercent > 0 ? ` (${priceLabels.packSavingsPercent}% off)` : ""}
              </p>
            </a>
            <a
              href="/editor?mode=quick&source=home-plan-subscription"
              onClick={() => handlePlanInterest("subscription")}
              className="rounded-xl border border-white/15 bg-white/5 p-3 text-left transition hover:border-white/25 hover:bg-white/10"
            >
              <p className="text-sm font-semibold text-white">Unlimited monthly</p>
              <p className="text-sm font-semibold text-neutral-100">{priceLabels.subscription}/mo</p>
            </a>
          </div>
          <p className="text-xs text-neutral-300">
            Physical orders can include the HD digital file add-on for {printLabels.digitalAddOn}.
          </p>
        </div>
      </div>
    </section>
  );
}
