"use client";

import nextDynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CheckoutPlan } from "@/lib/pricing";
import { track, trackExperimentExposure, trackFunnelStep } from "@/lib/analytics";
import {
  getHeroCheckoutVariant,
  HERO_CHECKOUT_EXPERIMENT,
  type HeroCheckoutVariant,
} from "@/lib/experiments";

// Lazy load SimplifiedEditor for the hero section
const SimplifiedEditor = nextDynamic(
  () => import("@/components/SimplifiedEditor").then((mod) => mod.SimplifiedEditor),
  {
    loading: () => (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-white/10 bg-[#070b1b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <span className="text-sm text-neutral-400">Loading preview...</span>
        </div>
      </div>
    ),
    ssr: false,
  }
);

type HeroEditorPlaceholderProps = {
  onActivate: () => void;
};

function HeroEditorPlaceholder({ onActivate }: HeroEditorPlaceholderProps) {
  return (
    <div className="flex flex-col gap-7 md:flex-row md:gap-6 lg:gap-8">
      <div className="relative flex-1">
        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/15 bg-[#070b1b] shadow-[0_10px_24px_rgba(0,0,0,0.2)] bg-cover bg-center"
          style={{ backgroundImage: "url('/examples/example-wedding-cinematic-heart.webp')" }}
          aria-label="Sample star map preview"
        />
        <div className="absolute inset-0 flex items-end justify-center pb-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 rounded-b-2xl bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
          <button
            type="button"
            onClick={onActivate}
            className="animate-pulse-subtle relative z-10 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 px-8 py-4 text-base font-bold text-[#0b1433] shadow-[0_0_30px_rgba(251,191,36,0.5)] transition-all hover:-translate-y-1 hover:scale-105 hover:shadow-[0_0_40px_rgba(251,191,36,0.7)] max-[374px]:px-6 max-[374px]:py-3.5 max-[374px]:text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-[#070b1b]"
            aria-label="Start customizing your star map"
          >
            ✨ Make it yours
          </button>
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-5 lg:w-[380px] xl:w-[420px]">
        <div className="glass-panel min-w-0 rounded-2xl p-5 sm:p-6">
          <h3 className="mb-5 text-xl font-semibold text-white max-[374px]:text-lg">Customize your moment</h3>
          <div className="mb-4 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-amber-100/80">When was it?</label>
            <input
              type="date"
              disabled
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white/60 placeholder:text-white/40 opacity-60"
            />
          </div>
          <div className="mb-6 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-amber-100/80">Where was it?</label>
            <input
              type="text"
              disabled
              placeholder="Search city, landmark, or address"
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white/60 placeholder:text-white/40 opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={onActivate}
            className="w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold text-[#0b1433] shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Start customizing
          </button>
          <p className="mt-3 text-xs text-amber-100/60">
            Loads the live editor when you’re ready — no payment needed.
          </p>
        </div>
      </div>
    </div>
  );
}

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
  packSavingsPercent: number;
};

type HomeClientProps = {
  priceLabels: PriceLabels;
};

export default function HomeClient({ priceLabels }: HomeClientProps) {
  return (
    <Suspense fallback={null}>
      <HomeInner priceLabels={priceLabels} />
    </Suspense>
  );
}

type HomeInnerProps = {
  priceLabels: PriceLabels;
};

function HomeInner({ priceLabels }: HomeInnerProps) {
  const [heroCheckoutVariant, setHeroCheckoutVariant] = useState<HeroCheckoutVariant>("control");
  const [hasHydrated, setHasHydrated] = useState(false);
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
  const [heroCheckoutPlan, setHeroCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [heroCheckoutError, setHeroCheckoutError] = useState<string | null>(null);
  const [showHeroEditor, setShowHeroEditor] = useState(false);

  const handleHeroEditorActivate = useCallback(() => {
    setShowHeroEditor(true);
  }, []);

  useEffect(() => {
    // Resolve experiment variant only on the client after hydration,
    // so initial server/client markup stays identical.
    setHasHydrated(true);
    const resolvedVariant = getHeroCheckoutVariant();
    setHeroCheckoutVariant(resolvedVariant);

    trackExperimentExposure(HERO_CHECKOUT_EXPERIMENT, resolvedVariant, { source: "home" });
    trackFunnelStep("landing_view", {
      source: "home",
      experiment: HERO_CHECKOUT_EXPERIMENT,
      variant: resolvedVariant,
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
    <main className="flex flex-col items-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-12 lg:py-10">
      <section className="particles-bg mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="mb-8 space-y-5 text-center lg:mb-10">
          <h1 className="max-[374px]:text-[1.75rem] text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            Create a custom{" "}
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent animate-shimmer">
              star map
            </span>{" "}
            of the night sky
          </h1>
          <p className="mx-auto max-w-2xl text-base text-neutral-200 sm:text-lg">
            See the exact sky from your wedding, birthday, or meaningful moment — personalized in seconds.
          </p>

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
              <div className="text-lg font-bold text-white">{priceLabels.subscription}<span className="text-sm font-normal text-neutral-400">/mo</span></div>
              <div className="mt-1 text-[11px] font-semibold text-amber-300">
                {heroCheckoutPlan === "subscription" ? "Starting checkout..." : heroCheckoutCopy.subscriptionCta}
              </div>
            </button>
          </div>
          {heroCheckoutError && <p className="text-xs font-medium text-rose-300">{heroCheckoutError}</p>}
        </div>
        {showHeroEditor ? <SimplifiedEditor /> : <HeroEditorPlaceholder onActivate={handleHeroEditorActivate} />}
      </section>
    </main>
  );
}
