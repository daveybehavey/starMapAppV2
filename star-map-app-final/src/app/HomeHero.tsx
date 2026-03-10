"use client";

import HeroEditorDeferred from "@/components/HeroEditorDeferred";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import { track, trackFunnelStep } from "@/lib/analytics";
import { getPrintAvailabilityBadgeLabel, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getPrintPricingTiers } from "@/lib/pricing";

export default function HomeHero() {
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const printTiers = getPrintPricingTiers();

  const handlePrintOptionsClick = () => {
    track("print_options_clicked", {
      source: "home-hero",
      placement: "hero-cta-row",
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero",
      plan: "print_options",
    });
  };

  const handlePrintGuideClick = () => {
    track("print_guide_clicked", {
      source: "home-hero",
      placement: "hero-trust-strip",
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero",
      plan: "print_guide",
    });
  };

  return (
    <main className="flex flex-col items-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-12 lg:py-10">
      <LandingViewTracker source="home" />
      <section className="particles-bg mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="mb-8 space-y-5 text-center lg:mb-10">
          <h1 className="max-[374px]:text-[1.75rem] text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            The night sky exactly as it looked on{" "}
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent animate-shimmer">
              your special day
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-neutral-200 sm:text-lg">
            Customize your own star map in minutes. Download instantly in HD, move into the premium {printTiers.poster_framed.label.toLowerCase()} path, or keep the lower total with the {printTiers.poster_unframed.label.toLowerCase()} option.
          </p>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Free live preview</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">No account required</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">HD export in seconds</span>
            <span className="rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1 text-amber-100">
              {printBadgeLabel}
            </span>
          </div>
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2 pt-2">
            <a
              href="#preview"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/15"
            >
              Start free preview
            </a>
            <a
              href="#delivery-options"
              onClick={handlePrintOptionsClick}
              className="rounded-full border border-amber-300/60 bg-amber-300/20 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/30"
            >
              See framed print options
            </a>
          </div>
        </div>

        <HeroEditorDeferred />

        <div className="mx-auto mt-4 w-full max-w-4xl rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left sm:px-5">
          <div className="grid gap-2 text-xs text-neutral-100 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-semibold text-amber-200">300 DPI export quality</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-semibold text-amber-200">Museum-quality print options</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-semibold text-amber-200">Secure Stripe checkout</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-semibold text-amber-200">Manual review before production</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-200">
            After preview, you can choose digital HD, the gift-ready {printTiers.poster_framed.label.toLowerCase()}, or the lower-cost {printTiers.poster_unframed.label.toLowerCase()}. {shippingDisclosure}
            <a
              href="/how-to-print-star-map"
              onClick={handlePrintGuideClick}
              className="ml-1.5 font-semibold text-amber-200 underline hover:text-amber-100"
            >
              See the print guide
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
