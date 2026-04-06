"use client";

import HeroEditorDeferred from "@/components/HeroEditorDeferred";
import { LandingViewTracker } from "@/components/analytics/LandingViewTracker";
import { track, trackFunnelStep } from "@/lib/analytics";
import {
  formatPrintPriceWithShipping,
  getPrintAvailabilityBadgeLabel,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

export default function HomeHero() {
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const pricingTiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();
  const digitalSingle = formatPrice(pricingTiers.single.amountCents, pricingTiers.single.currency);
  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    printTiers.poster_framed.currency,
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    printTiers.poster_unframed.currency,
  );

  const handleFramedPreviewClick = () => {
    track("hero_framed_preview_clicked", {
      source: "home-hero",
      placement: "hero-cta-row",
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero",
      plan: "print_framed",
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

  const handleOfferLadderClick = (choice: "digital" | "framed" | "unframed") => {
    track("home_offer_ladder_clicked", {
      source: "home-hero",
      choice,
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-hero-ladder",
      plan: choice,
    });
  };

  return (
    <main className="flex flex-col items-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-12 lg:py-10">
      <LandingViewTracker source="home" />
      <section className="particles-bg mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="mb-8 space-y-5 text-center lg:mb-10">
          <h1 className="max-[374px]:text-[1.75rem] text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            See the exact night sky from{" "}
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              the moment that changed everything
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-neutral-200 sm:text-lg">
            Enter the date and place, preview it free, then choose gift-ready{" "}
            {printTiers.poster_framed.label.toLowerCase()}, the lower-total {printTiers.poster_unframed.label.toLowerCase()},
            or HD digital delivery from the same design.
          </p>
          <p className="mx-auto max-w-2xl text-sm text-amber-100/85 sm:hidden">
            Framed stays premium. HD stays fastest when same-day delivery matters.
          </p>
          <p className="mx-auto hidden max-w-2xl text-sm text-amber-100/85 sm:block sm:text-base">
            Framed stays premium. Unframed keeps the physical total lower. HD stays fastest when same-day delivery matters.
          </p>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-amber-100/90">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Preview before payment</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">No account required</span>
            <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1 sm:inline-flex">Calculated from your date + place</span>
            <span className="hidden rounded-full border border-amber-300/50 bg-amber-300/20 px-3 py-1 text-amber-100 sm:inline-flex">
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
              href="/editor?mode=quick&source=home-hero-framed&checkout=print&print_variant=poster_framed"
              onClick={handleFramedPreviewClick}
              className="hidden items-center px-2 py-2 text-xs font-semibold text-amber-200 underline decoration-amber-300/60 underline-offset-4 transition hover:text-amber-100 sm:inline-flex"
            >
              Gift-ready? Preview framed print
            </a>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <div className="order-1">
            <HeroEditorDeferred />
          </div>
          <div className="order-2 mx-auto grid w-full max-w-3xl gap-2 pt-1 sm:grid-cols-3 sm:pt-3">
            <a
              href="/editor?mode=quick&source=home-hero-offer-digital"
              onClick={() => handleOfferLadderClick("digital")}
              className="rounded-xl border border-white/15 bg-white/6 px-3 py-3 text-left transition hover:-translate-y-[1px] hover:bg-white/10"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">Instant</p>
              <p className="mt-1 text-sm font-semibold text-white">Digital HD</p>
              <p className="mt-1 text-sm font-semibold text-amber-200">{digitalSingle}</p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-300">Best for same-day gifting, local printing, or zero shipping friction.</p>
            </a>
            <a
              href="/editor?mode=quick&source=home-hero-offer-framed&checkout=print&print_variant=poster_framed"
              onClick={() => handleOfferLadderClick("framed")}
              className="rounded-xl border border-amber-300/50 bg-amber-300/16 px-3 py-3 text-left transition hover:-translate-y-[1px] hover:bg-amber-300/24"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">Gift-ready pick</p>
              <p className="mt-1 text-sm font-semibold text-white">Framed gift</p>
              <p className="mt-1 text-sm font-semibold text-amber-100">{framedPrice}</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-100/85">Best for weddings, anniversaries, and premium presentation right out of the box.</p>
            </a>
            <a
              href="/editor?mode=quick&source=home-hero-offer-unframed&checkout=print&print_variant=poster_unframed"
              onClick={() => handleOfferLadderClick("unframed")}
              className="rounded-xl border border-white/15 bg-white/6 px-3 py-3 text-left transition hover:-translate-y-[1px] hover:bg-white/10"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">Lower total</p>
              <p className="mt-1 text-sm font-semibold text-white">Unframed print</p>
              <p className="mt-1 text-sm font-semibold text-amber-200">{unframedPrice}</p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-300">Best if you want the physical print but already know how you want to frame it.</p>
            </a>
          </div>
        </div>

        <div className="brand-dark-card mx-auto mt-4 w-full max-w-4xl rounded-2xl px-4 py-4 text-left sm:px-5">
          <div className="grid gap-2 text-xs text-neutral-100 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="font-semibold text-amber-200">300 DPI export quality</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="font-semibold text-amber-200">Museum-quality print options</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="font-semibold text-amber-200">Secure Stripe checkout</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="font-semibold text-amber-200">Quality check before production</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-200">
            After preview, choose digital HD, gift-ready {printTiers.poster_framed.label.toLowerCase()}, or the lower-cost{" "}
            {printTiers.poster_unframed.label.toLowerCase()}. {shippingDisclosure}
            <a href="/shipping" className="ml-1.5 font-semibold text-amber-200 underline hover:text-amber-100">
              Shipping policy
            </a>
            <span className="text-neutral-300"> · </span>
            <a href="/returns" className="font-semibold text-amber-200 underline hover:text-amber-100">
              Returns
            </a>
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
