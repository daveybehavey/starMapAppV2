"use client";

import Image from "next/image";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { blogPosts } from "@/lib/blogPosts";
import { formatPrice, getPricingTiers, type CheckoutPlan } from "@/lib/pricing";
import { useInView } from "@/hooks/useInView";
import {
  track,
  trackExperimentExposure,
  trackFunnelStep,
} from "@/lib/analytics";
import {
  getHeroCheckoutVariant,
  HERO_CHECKOUT_EXPERIMENT,
  type HeroCheckoutVariant,
} from "@/lib/experiments";
import PromotionSignup from "@/components/PromotionSignup";

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

export default function HomeClient() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  // Compute price labels once (they never change during session)
  const priceLabels = useMemo(() => {
    const tiers = getPricingTiers();
    const packSavingsPercent =
      tiers.single.amountCents > 0
        ? Math.max(
            0,
            Math.round(
              (1 - tiers.pack3.amountCents / Math.max(1, tiers.single.amountCents * 3)) * 100,
            ),
          )
        : 0;
    return {
      single: formatPrice(tiers.single.amountCents, tiers.single.currency),
      pack3: formatPrice(tiers.pack3.amountCents, tiers.pack3.currency),
      subscription: formatPrice(tiers.subscription.amountCents, tiers.subscription.currency),
      packSavingsPercent,
    };
  }, []);
  const [heroCheckoutVariant, setHeroCheckoutVariant] = useState<HeroCheckoutVariant>("control");
  const heroCheckoutCopy = useMemo(() => {
    if (heroCheckoutVariant === "value") {
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
  }, [heroCheckoutVariant, priceLabels.packSavingsPercent]);
  const [heroCheckoutPlan, setHeroCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [heroCheckoutError, setHeroCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    // Resolve experiment variant only on the client after hydration,
    // so initial server/client markup stays identical.
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

  // Scroll-triggered animation hooks
  const { ref: examplesRef, isVisible: examplesVisible } = useInView();
  const { ref: howItWorksRef, isVisible: howItWorksVisible } = useInView();
  const { ref: blogRef, isVisible: blogVisible } = useInView();
  const latestPosts = useMemo(
    () => [...blogPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6),
    []
  );
  const useFeaturedBlogLayout = latestPosts.length >= 5;
  const blogGridClassName =
    latestPosts.length <= 1
      ? "grid grid-cols-1 gap-4"
      : latestPosts.length === 2
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6"
        : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3";

  return (
    <main className="flex flex-col items-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-12 lg:py-10">
      {/* Hero Section with SimplifiedEditor */}
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

          {/* Pricing Cards */}
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
        <SimplifiedEditor />
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <PromotionSignup />
      </section>

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section ref={examplesRef} className={`mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20 fade-in-up ${examplesVisible ? 'visible' : ''}`}>
        <div className="space-y-6 lg:space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">What your map could look like</p>
            <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-white sm:text-4xl">See finished examples before you start</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Real outputs from our presets and render modes—so you know exactly what you can create in seconds.
            </p>
          </div>
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:grid-cols-3 lg:gap-6 stagger-children ${examplesVisible ? 'visible' : ''}`}>
            {[
              {
                imageSrc: "/examples/example-wedding-cinematic-heart.webp",
                occasion: "Wedding",
                renderMode: "Cinematic",
                caption: "Santorini, Greece · June 21, 2024",
                badge: "CINEMATIC",
              },
              {
                imageSrc: "/examples/example-anniversary-luxe.webp",
                occasion: "Anniversary",
                renderMode: "Luxe",
                caption: "Paris, France · September 15, 2016",
                badge: "LUXE",
              },
              {
                imageSrc: "/examples/example-birthday-classic.webp",
                occasion: "Birthday",
                renderMode: "Classic",
                caption: "Tokyo, Japan · July 7, 1995",
                badge: "CLASSIC",
              },
              {
                imageSrc: "/examples/example-birth-classic.webp",
                occasion: "Birth",
                renderMode: "Classic",
                caption: "Toronto, Canada · February 14, 2023",
                badge: "CLASSIC",
              },
              {
                imageSrc: "/examples/example-memorial-blueprint.webp",
                occasion: "Memorial",
                renderMode: "Blueprint",
                caption: "London, UK · November 11, 2018",
                badge: "BLUEPRINT",
              },
              {
                imageSrc: "/examples/example-graduation-luxe.webp",
                occasion: "Graduation",
                renderMode: "Luxe",
                caption: "Boston, USA · May 25, 2024",
                badge: "LUXE",
              },
            ].map((item, idx) => (
              <div
                key={`${item.imageSrc}-${idx}`}
                className="card-hover-glow group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/30"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={item.imageSrc}
                    alt={`${item.occasion} · ${item.renderMode}`}
                    fill
                    className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-105"
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    loading="lazy"
                  />
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-white">
                  <div className="flex items-center justify-between text-sm font-semibold leading-tight">
                    <span>
                      {item.occasion} · {item.renderMode}
                    </span>
                    <span className="badge-glow rounded-full border border-amber-300/40 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-200 sm:text-base lg:text-[13px] lg:leading-snug">
            A wedding night in Santorini. A birthday in Tokyo. A quiet memorial in London. Every sky is different — just like the moment it represents.
          </p>
        </div>
      </section>

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section ref={howItWorksRef} className={`mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20 fade-in-up ${howItWorksVisible ? 'visible' : ''}`}>
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">How it works</p>
            <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-white sm:text-4xl">From date to finished star map</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Pick a meaningful moment, see the night sky instantly, personalize, and export a print-ready map in minutes.
            </p>
          </div>
          <div className={`relative grid gap-6 md:grid-cols-3 md:gap-8 stagger-children ${howItWorksVisible ? 'visible' : ''}`}>
            {/* Connecting line (desktop only) */}
            <div className="connecting-line hidden md:block" />

            {[
              {
                icon: "📅",
                title: "Choose your moment",
                desc: "Select a preset or set the exact date, time, and location.",
              },
              {
                icon: "✨",
                title: "Preview instantly",
                desc: "Accurate astronomy data renders the sky as it truly appeared.",
              },
              {
                icon: "⬇️",
                title: "Unlock & export",
                desc: "Download a high-resolution, print-ready file with flexible pricing options.",
              },
            ].map((item, index) => (
              <div
                key={item.title}
                className="relative rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/5 p-5 pt-8 shadow-lg shadow-black/20 transition-all duration-300 hover:border-amber-400/50 hover:shadow-[0_0_25px_rgba(251,191,36,0.15)]"
              >
                {/* Step number badge */}
                <div className="step-badge absolute -top-4 left-5 flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-midnight">
                  {index + 1}
                </div>
                <div className="mb-2 text-2xl">{item.icon}</div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-neutral-300">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div className="cosmic-panel-enhanced cosmic-panel rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10">
            <div className="space-y-6 text-neutral-800">
              <div className="space-y-3">
                <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-midnight sm:text-4xl">What Is a Custom Star Map?</h2>
                <p className="text-base leading-relaxed text-neutral-800 sm:text-lg">
                  A custom star map (sometimes called a starmap or constellation map) shows the exact night sky from a
                  specific date, time, and location. We turn that real sky into a print-ready design you can gift or
                  frame. Every map is unique to the moment it represents.
                </p>
                <p className="text-sm text-neutral-700 sm:text-base">
                  Need printing help? Read our{" "}
                  <Link href="/how-to-print-star-map" className="font-semibold text-amber-700 hover:underline">
                    star map printing guide
                  </Link>
                  .
                </p>
                <p className="text-sm text-neutral-700 sm:text-base">
                  Popular occasions:{" "}
                  <Link href="/anniversary" className="font-semibold text-amber-700 hover:underline">
                    Anniversary star maps
                  </Link>
                  ,{" "}
                  <Link href="/birthday" className="font-semibold text-amber-700 hover:underline">
                    Birthday star maps
                  </Link>
                  ,{" "}
                  <Link href="/wedding" className="font-semibold text-amber-700 hover:underline">
                    Wedding star maps
                  </Link>
                  .
                </p>
                <p className="text-sm text-neutral-700 sm:text-base">
                  Popular searches:{" "}
                  <Link href="/constellation-map" className="font-semibold text-amber-700 hover:underline">
                    Constellation map
                  </Link>
                  ,{" "}
                  <Link href="/star-map-poster" className="font-semibold text-amber-700 hover:underline">
                    Star map poster
                  </Link>
                  ,{" "}
                  <Link href="/night-sky-map-gift" className="font-semibold text-amber-700 hover:underline">
                    Night sky map gift
                  </Link>
                  ,{" "}
                  <Link href="/star-map-generator" className="font-semibold text-amber-700 hover:underline">
                    Star map generator
                  </Link>
                  ,{" "}
                  <Link href="/star-map-gift" className="font-semibold text-amber-700 hover:underline">
                    Star map gift
                  </Link>
                  .
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">How StarMapCo Works</h2>
                <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed text-neutral-800 sm:text-lg">
                  <li>Choose the date and location that matter most.</li>
                  <li>Preview the sky instantly with accurate star positions.</li>
                  <li>Personalize style, shape, and text.</li>
                  <li>Unlock and export a high-res, print-ready file.</li>
                </ol>
              </div>
            </div>
          </div>

          <div id="accuracy" className="cosmic-panel-enhanced cosmic-panel rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14">
            <div className="space-y-5 text-neutral-800">
              <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-midnight sm:text-4xl">Why is this accurate?</h2>
              {[
                {
                  icon: "📊",
                  title: "Data Sources",
                  content: "Yale Bright Star Catalog and astronomy-engine (Skyfield-based) for stellar positions across hemispheres.",
                },
                {
                  icon: "🧮",
                  title: "Calculations",
                  content: "Precession, time zones, latitude/longitude, and horizon transforms (alt/az) for true-to-time skies.",
                },
                {
                  icon: "✓",
                  title: "Verification",
                  content: "Compare with Stellarium or other planetarium tools—your rendered sky should match within arcminutes.",
                },
              ].map((item) => (
                <details key={item.title} className="details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] bg-white/80">
                  <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{item.icon}</span>
                      {item.title}
                    </span>
                    <span className="summary-arrow text-amber-600">▼</span>
                  </summary>
                  <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.content}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SimplifiedEditor is now in hero section above */}

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="cosmic-panel-enhanced cosmic-panel mx-auto w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14">
        <div className="space-y-6 text-neutral-800">
          <div className="space-y-3">
            <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-midnight sm:text-4xl">Frequently Asked Questions</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              Everything you need to know about creating and sharing a custom star map with StarMapCo.
            </p>
          </div>

          <div className="space-y-8">
            {/* Accuracy & Data Category */}
            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>🔬</span> Accuracy & Data
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "How accurate are StarMapCo custom star maps?",
                    a: "Extremely accurate—using professional astronomy libraries based on skyfield and Yale catalogs for precise star positions.",
                  },
                  {
                    q: "What data sources do you use for the night sky?",
                    a: "Real astronomical data from trusted sources like the Yale Bright Star Catalog to calculate exact positions for your date, time, and location.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            {/* Customization Category */}
            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>🎨</span> Customization
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "Can I customize text, styles, and shapes?",
                    a: "Yes—add titles, subtitles, or dedications; choose from four styles (navy gold, vintage, parchment, minimal) and shapes (rectangle free, heart/circle/star premium) plus visual modes and constellations.",
                  },
                  {
                    q: "What if I enter the wrong date or location?",
                    a: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
                  },
                  {
                    q: "Can I try a demo?",
                    a: "Yes—use the demo button to auto-fill a sample moment and preview without payment.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            {/* Pricing & Downloads Category */}
            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>💰</span> Pricing & Downloads
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "What is included in the free version vs. premium unlock?",
                    a: `Free: basic preview and watermarked export. Premium unlocks start at ${priceLabels.single} for an HD download, with 3-packs and unlimited monthly options.`,
                  },
                  {
                    q: "How do I export or download my star map?",
                    a: "After premium unlock, download a high-resolution PNG directly from the app.",
                  },
                  {
                    q: "Is this a one-time purchase or subscription?",
                    a: "Both options are available: one-time HD downloads or an unlimited monthly subscription.",
                  },
                  {
                    q: "Are the maps suitable for printing?",
                    a: "Yes—designed to be print-ready up to 6000x6000 resolution for posters and frames.",
                  },
                  {
                    q: "Can I share my custom star map with others?",
                    a: "Generate and share images or links now; public sharing options are coming soon.",
                  },
                  {
                    q: "Why choose StarMapCo over other star map generators?",
                    a: "Instant real-time preview, accurate science, premium visuals, and flexible pricing for one-time or unlimited access.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="#preview"
                className="cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-midnight shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                Ready to create yours? Start now →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section ref={blogRef} className={`cosmic-panel-enhanced cosmic-panel mx-auto w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14 fade-in-up ${blogVisible ? 'visible' : ''}`}>
        <div className="space-y-6">
          <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-midnight sm:text-4xl">Latest from the Blog</h2>
          <p className="text-base text-neutral-800 sm:text-lg">
            Guides and inspiration for anniversaries, birthdays, and accurate astronomy behind your custom star map.
          </p>
          <div className={`${blogGridClassName} mx-auto w-full stagger-children ${blogVisible ? 'visible' : ''}`}>
            {latestPosts.map((post, index) => (
                <article
                  key={post.slug}
                  className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-white/80 text-midnight shadow-md transition-all duration-300 hover:-translate-y-3 hover:border-amber-300 hover:shadow-[0_30px_60px_rgba(0,0,0,0.2)] ${
                    index === 0 && useFeaturedBlogLayout ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : ""
                  }`}
                >
                  <div
                    className={`relative w-full overflow-hidden ${
                      index === 0 && useFeaturedBlogLayout ? "h-40 lg:h-full lg:min-h-[200px]" : "h-32"
                    }`}
                  >
                    <Image
                      src="/custom-star-map-anniversary.webp"
                      alt={post.title}
                      fill
                      className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-105"
                      loading="lazy"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                    {index === 0 && (
                      <div className="absolute left-3 top-3 rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-midnight shadow">
                        Featured
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide sm:text-xs">
                      <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Guide</span>
                      <span className="text-amber-700">{new Date(post.date).toDateString()}</span>
                    </div>
                    <h3 className={`mt-2 font-semibold line-clamp-2 ${index === 0 ? "text-lg sm:text-xl" : "text-base sm:text-lg"}`}>
                      <Link href={`/blog/${post.slug}`} className="hover:underline">
                        {post.title}
                      </Link>
                    </h3>
                    <p className={`mt-2 text-sm text-neutral-700 ${index === 0 ? "line-clamp-3" : "line-clamp-2"}`}>{post.description}</p>
                    <div className="mt-auto pt-3">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 transition-colors hover:text-amber-900 hover:underline"
                      >
                        Read more →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="cosmic-panel-enhanced cosmic-panel mx-auto mb-10 w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:mb-14 lg:px-10 lg:py-14">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-5">
          <div className="avatar-gradient flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-2xl">
            👨‍💻
          </div>
          <div>
            <h3 className="text-xl font-semibold text-midnight sm:text-2xl">Built by a solo developer</h3>
            <p className="mt-1 text-sm text-amber-700 sm:text-base">Passionate about astronomy and meaningful gifts</p>
            <p className="mt-3 text-sm text-neutral-800 sm:text-base">
              StarMapCo is built with accuracy-first design, flexible pricing, and real sky data to help you create maps that truly matter.
            </p>
            <p className="mt-2 text-xs font-semibold text-neutral-600">
              🌟 Early access: Building reviews organically based on real customer experiences.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
