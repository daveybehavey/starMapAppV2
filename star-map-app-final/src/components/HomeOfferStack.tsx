"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { track, trackFunnelStep, trackSelectItem, trackViewItemList } from "@/lib/analytics";
import { getPrintAllowedCountries, getPrintAvailabilityBadgeLabel, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  formatPrintShippingEstimate,
  getPrintShippingCountryLabel,
  getPrintShippingCountryOptions,
  readStoredPrintShippingCountry,
  storePrintShippingCountry,
} from "@/lib/printfulShipping";

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
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const itemListsTrackedRef = useRef(false);
  const printShippingCountries = useMemo(() => getPrintAllowedCountries(), []);
  const printShippingCountryOptions = useMemo(
    () => getPrintShippingCountryOptions(printShippingCountries),
    [printShippingCountries],
  );
  const [printShippingCountry, setPrintShippingCountry] = useState<string>(
    printShippingCountryOptions[0]?.code ?? "US",
  );
  const framedShippingLabel = useMemo(
    () => formatPrintShippingEstimate("poster_framed", printShippingCountry, "shipping"),
    [printShippingCountry],
  );
  const unframedShippingLabel = useMemo(
    () => formatPrintShippingEstimate("poster_unframed", printShippingCountry, "shipping"),
    [printShippingCountry],
  );
  const shippingCountryLabel = useMemo(
    () => getPrintShippingCountryLabel(printShippingCountry),
    [printShippingCountry],
  );

  useEffect(() => {
    const stored = readStoredPrintShippingCountry();
    if (stored && printShippingCountries.includes(stored)) {
      setPrintShippingCountry(stored);
      return;
    }
    if (printShippingCountryOptions[0]?.code) {
      const fallback = printShippingCountryOptions[0].code;
      setPrintShippingCountry(fallback);
      storePrintShippingCountry(fallback);
    }
  }, [printShippingCountries, printShippingCountryOptions]);

  useEffect(() => {
    if (itemListsTrackedRef.current) return;
    itemListsTrackedRef.current = true;

    trackViewItemList({
      itemListId: "home_print_options",
      itemListName: "Homepage print options",
      items: [
        { plan: "single", orderType: "print", printVariant: "poster_framed", index: 0 },
        { plan: "single", orderType: "print", printVariant: "poster_unframed", index: 1 },
      ],
    });

    trackViewItemList({
      itemListId: "home_digital_plans",
      itemListName: "Homepage digital plans",
      items: [
        { plan: "single", orderType: "digital", index: 0 },
        { plan: "pack3", orderType: "digital", index: 1 },
        { plan: "subscription", orderType: "digital", index: 2 },
      ],
    });
  }, []);

  const handleDeliveryChoice = (choice: DeliveryChoice) => {
    track("delivery_choice_split", {
      source: "home-offer-stack",
      choice,
      shippingCountry: printShippingCountry,
    });
    track("delivery_choice_selected", {
      source: "home-offer-stack",
      choice,
      shippingCountry: printShippingCountry,
    });
    trackFunnelStep("hero_plan_click", {
      source: "home-offer-stack",
      plan: `delivery_${choice}`,
      shippingCountry: printShippingCountry,
    });
    if (choice === "print_unframed" || choice === "print_framed") {
      trackSelectItem({
        itemListId: "home_print_options",
        itemListName: "Homepage print options",
        item: {
          plan: "single",
          orderType: "print",
          printVariant: choice === "print_framed" ? "poster_framed" : "poster_unframed",
          index: choice === "print_framed" ? 0 : 1,
        },
      });
    }
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
    trackSelectItem({
      itemListId: "home_digital_plans",
      itemListName: "Homepage digital plans",
      item: {
        plan,
        orderType: "digital",
        index: plan === "single" ? 0 : plan === "pack3" ? 1 : 2,
      },
    });
  };

  return (
    <section
      id="delivery-options"
      className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8"
    >
      <div className="space-y-7 rounded-3xl border border-amber-300/26 bg-[linear-gradient(180deg,rgba(9,17,40,0.9),rgba(6,12,32,0.95))] p-6 text-white shadow-[0_20px_48px_rgba(0,0,0,0.34)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Choose your format</p>
          <h2 className="text-2xl font-semibold sm:text-3xl">Preview first, then pick how you want it delivered</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-neutral-200 sm:text-base">
            Build the exact sky map first. Then choose instant HD digital, gift-ready framed print, or a lower-cost
            unframed poster.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="brand-dark-card flex h-full flex-col rounded-2xl p-4">
            <p className="text-sm font-semibold text-white">Instant digital</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">HD file unlocks immediately after payment.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Up to 6000x6000 PNG</li>
              <li>No watermark on paid export</li>
              <li>Great for local print shops</li>
            </ul>
            <a
              href="/editor?mode=quick&source=home-delivery-digital"
              onClick={() => handleDeliveryChoice("digital")}
            className="mt-auto inline-flex rounded-full border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/20"
          >
            Start free preview
          </a>
        </article>

          <article className="brand-dark-card-accent flex h-full flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Framed print</p>
              <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                MOST POPULAR
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">Ready-to-hang 14x14 option for the strongest premium gift presentation.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Delivered framed and gift-ready</li>
              <li>Best-looking premium option for special occasions</li>
              <li>Estimated shipping to {shippingCountryLabel}: {framedShippingLabel}</li>
              <li>{printLabels.framed}</li>
            </ul>
            <a
              href={`/editor?mode=quick&source=home-delivery-print-framed&checkout=print&print_variant=poster_framed&shipping_country=${encodeURIComponent(printShippingCountry)}`}
              onClick={() => handleDeliveryChoice("print_framed")}
              className="mt-auto inline-flex rounded-full border border-amber-300/70 bg-amber-300/25 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/35"
            >
              Preview then buy framed
            </a>
          </article>

          <article className="brand-dark-card flex h-full flex-col rounded-2xl p-4">
            <p className="text-sm font-semibold text-white">Unframed print</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">Professionally printed 18x18 poster for buyers who already have a frame plan.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Museum-quality poster stock</li>
              <li>Lower-cost physical option</li>
              <li>Estimated shipping to {shippingCountryLabel}: {unframedShippingLabel}</li>
              <li>{printLabels.unframed}</li>
            </ul>
            <a
              href={`/editor?mode=quick&source=home-delivery-print-unframed&checkout=print&print_variant=poster_unframed&shipping_country=${encodeURIComponent(printShippingCountry)}`}
              onClick={() => handleDeliveryChoice("print_unframed")}
              className="mt-auto inline-flex rounded-full border border-amber-300/40 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-amber-300/60 hover:bg-white/10"
            >
              See unframed option
            </a>
          </article>
        </div>

        <div className="brand-dark-card rounded-2xl p-4">
          <div className="mb-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[minmax(0,190px),1fr] sm:items-center">
            <label htmlFor="home-shipping-country" className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
              Shipping estimate country
            </label>
            <div className="space-y-1">
              <select
                id="home-shipping-country"
                value={printShippingCountry}
                onChange={(event) => {
                  const nextCountry = event.target.value;
                  setPrintShippingCountry(nextCountry);
                  storePrintShippingCountry(nextCountry);
                }}
                className="print-country-select w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-xs text-midnight"
                style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
              >
                {printShippingCountryOptions.map((country) => (
                  <option
                    key={country.code}
                    value={country.code}
                    className="text-midnight"
                    style={{ color: "#111827", backgroundColor: "#ffffff" }}
                  >
                    {country.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-300">
                Framed: {framedShippingLabel} · Unframed: {unframedShippingLabel}
              </p>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Print confidence</p>
          <ul className="mt-2 grid gap-2 text-xs text-neutral-200 sm:grid-cols-2">
            <li>✓ Production starts after manual order review.</li>
            <li>✓ {shippingDisclosure}</li>
            <li>✓ Damage support: support@starmapco.com.</li>
            <li>✓ HD digital add-on available for {printLabels.digitalAddOn}.</li>
            <li>✓ {printBadgeLabel}</li>
          </ul>
        </div>

        <div className="brand-dark-card rounded-2xl p-4">
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
