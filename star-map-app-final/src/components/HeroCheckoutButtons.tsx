"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CheckoutPlan } from "@/lib/pricing";
import { runWhenIdle, track, trackExperimentExposure, trackFunnelStep } from "@/lib/analytics";
import {
  getHeroCheckoutVariant,
  HERO_CHECKOUT_EXPERIMENT,
  type HeroCheckoutVariant,
} from "@/lib/experiments";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
  packSavingsPercent: number;
};

type HeroCheckoutButtonsProps = {
  priceLabels: PriceLabels;
};

export default function HeroCheckoutButtons({ priceLabels }: HeroCheckoutButtonsProps) {
  const [heroCheckoutVariant, setHeroCheckoutVariant] = useState<HeroCheckoutVariant>("control");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [heroCheckoutPlan, setHeroCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [heroCheckoutError, setHeroCheckoutError] = useState<string | null>(null);

  const resolvedHeroVariant = hasHydrated ? heroCheckoutVariant : "control";
  const heroCheckoutCopy = useMemo(() => {
    if (resolvedHeroVariant === "value") {
      return {
        singleLabel: "One HD map",
        singleCta: "Get 1 HD map",
        packLabel: priceLabels.packSavingsPercent > 0 ? `Save ${priceLabels.packSavingsPercent}%` : "Best value",
        packCta: "Get 3 HD maps",
        subscriptionLabel: "Unlimited HD exports",
        subscriptionCta: "Go unlimited",
      };
    }
    return {
      singleLabel: "Single Map",
      singleCta: "Buy single",
      packLabel: "Best value",
      packCta: "Get 3-pack",
      subscriptionLabel: "Unlimited",
      subscriptionCta: "Start unlimited",
    };
  }, [resolvedHeroVariant, priceLabels.packSavingsPercent]);

  useEffect(() => {
    setHasHydrated(true);
    const resolvedVariant = getHeroCheckoutVariant();
    setHeroCheckoutVariant(resolvedVariant);

    runWhenIdle(() => {
      trackExperimentExposure(HERO_CHECKOUT_EXPERIMENT, resolvedVariant, { source: "home" });
      trackFunnelStep("landing_view", {
        source: "home",
        experiment: HERO_CHECKOUT_EXPERIMENT,
        variant: resolvedVariant,
      });
    });
  }, []);

  const startHeroCheckout = useCallback(
    async (plan: CheckoutPlan) => {
      if (heroCheckoutPlan) return;

      trackFunnelStep("hero_plan_click", {
        source: "home",
        plan,
        experiment: HERO_CHECKOUT_EXPERIMENT,
        variant: heroCheckoutVariant,
      });
      trackFunnelStep("checkout_started", {
        source: "home",
        plan,
        experiment: HERO_CHECKOUT_EXPERIMENT,
        variant: heroCheckoutVariant,
      });
      setHeroCheckoutPlan(plan);
      setHeroCheckoutError(null);

      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        if (!res.ok) throw new Error("checkout failed");

        const data = (await res.json()) as { url?: string };
        if (!data.url) throw new Error("missing checkout url");

        const checkoutUrl = new URL(data.url);
        if (!checkoutUrl.protocol.startsWith("http")) {
          throw new Error("invalid checkout url");
        }

        trackFunnelStep("checkout_redirected", {
          source: "home",
          plan,
          experiment: HERO_CHECKOUT_EXPERIMENT,
          variant: heroCheckoutVariant,
        });
        window.location.assign(checkoutUrl.toString());
      } catch (err) {
        console.error("Hero checkout error", err);
        track("checkout_failed", {
          source: "home",
          plan,
          reason: (err as Error)?.message ?? "unknown",
          experiment: HERO_CHECKOUT_EXPERIMENT,
          variant: heroCheckoutVariant,
        });
        setHeroCheckoutError("Unable to start checkout right now. Please try again.");
        setHeroCheckoutPlan(null);
      }
    },
    [heroCheckoutPlan, heroCheckoutVariant]
  );

  return (
    <>
      <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-3 pt-2 sm:max-w-lg sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void startHeroCheckout("single")}
          disabled={Boolean(heroCheckoutPlan)}
          aria-busy={heroCheckoutPlan === "single"}
          className="pricing-card max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        >
          <div className="text-xs uppercase tracking-wide text-neutral-400">{heroCheckoutCopy.singleLabel}</div>
          <div className="text-lg font-bold text-white">{priceLabels.single}</div>
          <div className="mt-1 text-[11px] font-semibold text-amber-300">
            {heroCheckoutPlan === "single" ? "Starting checkout..." : heroCheckoutCopy.singleCta}
          </div>
        </button>
        <button
          type="button"
          onClick={() => void startHeroCheckout("pack3")}
          disabled={Boolean(heroCheckoutPlan)}
          aria-busy={heroCheckoutPlan === "pack3"}
          className="pricing-card featured max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        >
          <div className="text-xs uppercase tracking-wide text-amber-300">3-Pack</div>
          <div className="text-lg font-bold text-white">{priceLabels.pack3}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            {heroCheckoutCopy.packLabel}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-amber-300">
            {heroCheckoutPlan === "pack3" ? "Starting checkout..." : heroCheckoutCopy.packCta}
          </div>
        </button>
        <button
          type="button"
          onClick={() => void startHeroCheckout("subscription")}
          disabled={Boolean(heroCheckoutPlan)}
          aria-busy={heroCheckoutPlan === "subscription"}
          className="pricing-card max-[374px]:px-4 max-[374px]:py-4 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-300/80 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        >
          <div className="text-xs uppercase tracking-wide text-neutral-400">{heroCheckoutCopy.subscriptionLabel}</div>
          <div className="text-lg font-bold text-white">
            {priceLabels.subscription}
            <span className="text-sm font-normal text-neutral-400">/mo</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold text-amber-300">
            {heroCheckoutPlan === "subscription" ? "Starting checkout..." : heroCheckoutCopy.subscriptionCta}
          </div>
        </button>
      </div>
      {heroCheckoutError && <p className="text-xs font-medium text-rose-300">{heroCheckoutError}</p>}
    </>
  );
}
