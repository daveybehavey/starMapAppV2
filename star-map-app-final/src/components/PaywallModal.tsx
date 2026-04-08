"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckoutPlan } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/pricing";
import type { PaywallCopyVariant } from "@/lib/experiments";
import { track, trackSelectItem, trackViewItemList } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/businessProfile";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  formatPrintDeliveryEstimate,
  formatPrintShippingEstimate,
  getPrintShippingCountryLabel,
  getPrintShippingCountryOptions,
} from "@/lib/printfulShipping";
import {
  DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT,
  DIGITAL_CHECKOUT_REDIRECT_LABEL,
  getDigitalCheckoutPrimaryLabel,
  getPrintCheckoutCtaState,
  PRINT_CHECKOUT_REDIRECT_LABEL,
} from "@/lib/checkoutUi";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
};

type Props = {
  checkoutInFlight: boolean;
  checkoutError: string | null;
  priceLabels: PriceLabels;
  printPriceLabels?: {
    unframed: string;
    framed: string;
    digitalAddOn: string;
  };
  printShippingCountry?: string | null;
  printShippingCountries?: string[];
  onPrintShippingCountryChange?: (country: string) => void;
  variant: PaywallCopyVariant;
  purchaseIntent?: "digital" | "print";
  preferredPrintVariant?: PrintVariant;
  showReferralHint?: boolean;
  onStartCheckout: (plan: CheckoutPlan) => void;
  onStartPrintCheckout?: (options: { variant: PrintVariant; includeDigitalAddOn: boolean }) => void;
  onClose: () => void;
};

const PAYWALL_COPY: Record<
  PaywallCopyVariant,
  {
    title: string;
    subtitle: string;
  }
> = {
  control: {
    title: "Get this exact map in HD or print",
    subtitle: "This exact preview is already saved. Most buyers start with the one-time HD download for this map, then switch to print only if they want a shipped keepsake.",
  },
  value_anchor: {
    title: "Get this exact map in HD",
    subtitle: "This exact preview is already saved. The fastest route is the one-time HD download for this map. Print stays available from the other tab if you need a physical gift.",
  },
};

export function PaywallModal({
  checkoutInFlight,
  checkoutError,
  priceLabels,
  printPriceLabels,
  variant,
  purchaseIntent = "digital",
  preferredPrintVariant = "poster_framed",
  printShippingCountry,
  printShippingCountries = [],
  onPrintShippingCountryChange,
  showReferralHint = false,
  onStartCheckout,
  onStartPrintCheckout,
  onClose,
}: Props) {
  const copy = PAYWALL_COPY[variant];
  const hasPrintOptions = Boolean(onStartPrintCheckout && printPriceLabels);
  const [activeIntent, setActiveIntent] = useState<"digital" | "print">(
    hasPrintOptions && purchaseIntent === "print" ? "print" : "digital",
  );
  const [printUpsellHint, setPrintUpsellHint] = useState<string | null>(null);
  const supportEmail = getBusinessProfile().email;
  const shippingDisclosure = getPrintShippingDisclosure();
  const preferredVariant = preferredPrintVariant === "poster_unframed" ? "poster_unframed" : "poster_framed";
  const showDigitalPlans = !hasPrintOptions || activeIntent !== "print";
  const headerTitle = activeIntent === "print" && hasPrintOptions ? "Choose your printed gift route" : copy.title;
  const headerSubtitle =
    activeIntent === "print" && hasPrintOptions
      ? "Pick the final delivery route. Framed arrives ready to gift; unframed is best if you already have a frame plan."
      : copy.subtitle;
  const viewedListsRef = useRef<Set<string>>(new Set());
  const printShippingCountryOptions = useMemo(
    () => getPrintShippingCountryOptions(printShippingCountries),
    [printShippingCountries],
  );
  const framedShippingLabel = useMemo(
    () => formatPrintShippingEstimate("poster_framed", printShippingCountry, "shipping"),
    [printShippingCountry],
  );
  const framedDeliveryLabel = useMemo(
    () => formatPrintDeliveryEstimate("poster_framed", printShippingCountry),
    [printShippingCountry],
  );
  const unframedShippingLabel = useMemo(
    () => formatPrintShippingEstimate("poster_unframed", printShippingCountry, "shipping"),
    [printShippingCountry],
  );
  const unframedDeliveryLabel = useMemo(
    () => formatPrintDeliveryEstimate("poster_unframed", printShippingCountry),
    [printShippingCountry],
  );
  const canPrintCheckout = Boolean(printShippingCountry);
  const printCheckoutCtaState = useMemo(
    () =>
      getPrintCheckoutCtaState({
        checkoutInFlight,
        hasShippingCountry: canPrintCheckout,
      }),
    [canPrintCheckout, checkoutInFlight],
  );
  const reassurancePills =
    activeIntent === "print"
      ? ["Saved preview", "Shipping shown before payment", "Quality check before production"]
      : ["Saved preview", `${priceLabels.single} one-time`, "No subscription"];

  useEffect(() => {
    if (!hasPrintOptions) {
      setActiveIntent("digital");
      return;
    }
    setActiveIntent(purchaseIntent === "print" ? "print" : "digital");
  }, [hasPrintOptions, purchaseIntent]);

  useEffect(() => {
    if (printShippingCountry) {
      setPrintUpsellHint(null);
    }
  }, [printShippingCountry]);

  useEffect(() => {
    if (showDigitalPlans && !viewedListsRef.current.has("paywall_digital_primary")) {
      trackViewItemList({
        itemListId: "paywall_digital_primary",
        itemListName: "Paywall digital primary option",
        items: [{ plan: "single", orderType: "digital", index: 0 }],
      });
      viewedListsRef.current.add("paywall_digital_primary");
    }

    if (!hasPrintOptions || !printPriceLabels) return;

    const listId = activeIntent === "print" ? "paywall_print_options" : "paywall_print_upsell";
    if (viewedListsRef.current.has(listId)) return;

    trackViewItemList({
      itemListId: listId,
      itemListName: activeIntent === "print" ? "Paywall print options" : "Paywall print upsell",
      items:
        activeIntent === "print"
          ? [
              { plan: "single", orderType: "print", printVariant: "poster_framed", includeDigitalAddOn: true, index: 0 },
              { plan: "single", orderType: "print", printVariant: "poster_framed", includeDigitalAddOn: false, index: 1 },
              { plan: "single", orderType: "print", printVariant: "poster_unframed", includeDigitalAddOn: false, index: 2 },
            ]
          : [
              { plan: "single", orderType: "print", printVariant: "poster_framed", includeDigitalAddOn: true, index: 0 },
              { plan: "single", orderType: "print", printVariant: "poster_framed", includeDigitalAddOn: false, index: 1 },
              { plan: "single", orderType: "print", printVariant: "poster_unframed", includeDigitalAddOn: false, index: 2 },
            ],
    });
    viewedListsRef.current.add(listId);
  }, [activeIntent, hasPrintOptions, printPriceLabels, showDigitalPlans]);

  const handleDigitalCheckoutClick = (plan: CheckoutPlan) => {
    trackSelectItem({
      itemListId: "paywall_digital_primary",
      itemListName: "Paywall digital primary option",
      item: {
        plan,
        orderType: "digital",
        index: 0,
      },
    });
    onStartCheckout(plan);
  };

  const handleSwitchToPrintIntent = () => {
    setActiveIntent("print");
    setPrintUpsellHint("Choose your shipping country, then pick framed or unframed checkout.");
    track("paywall_intent_switched", {
      intent: "print",
      source: "digital_upsell",
    });
  };

  const handlePrintCheckoutClick = (
    options: { variant: PrintVariant; includeDigitalAddOn: boolean },
    listId: "paywall_print_options" | "paywall_print_upsell",
  ) => {
    setPrintUpsellHint(null);
    trackSelectItem({
      itemListId: listId,
      itemListName: listId === "paywall_print_options" ? "Paywall print options" : "Paywall print upsell",
      item: {
        plan: "single",
        orderType: "print",
        printVariant: options.variant,
        includeDigitalAddOn: options.includeDigitalAddOn,
        index:
          options.variant === "poster_framed" && options.includeDigitalAddOn
            ? 0
            : options.variant === "poster_framed"
              ? 1
              : 2,
      },
    });
    onStartPrintCheckout?.(options);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 px-0 py-0 sm:items-center sm:px-4 sm:py-8">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.75rem] border border-amber-200 bg-[rgba(247,241,227,0.98)] px-4 pb-5 pt-4 shadow-2xl shadow-black/25 sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-midnight">{headerTitle}</h3>
            <p className="mt-1 text-xs text-neutral-700">{headerSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close paywall"
            className="shrink-0 rounded-full border border-amber-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:bg-white"
          >
            Not now
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {reassurancePills.map((pill) => (
            <span
              key={pill}
              className="inline-flex items-center rounded-full border border-amber-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-amber-900"
            >
              {pill}
            </span>
          ))}
        </div>

        {hasPrintOptions && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-1">
            <button
              type="button"
              onClick={() => setActiveIntent("digital")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeIntent === "digital"
                  ? "bg-amber-400 text-midnight shadow-sm"
                  : "text-neutral-700 hover:bg-white/80"
              }`}
            >
              Fast digital
            </button>
            <button
              type="button"
              onClick={() => setActiveIntent("print")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeIntent === "print"
                  ? "bg-[#0b1433] text-amber-100 shadow-sm"
                  : "text-neutral-700 hover:bg-white/80"
              }`}
            >
              Printed gift
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 text-sm">
          {activeIntent === "print" && hasPrintOptions && printPriceLabels && onStartPrintCheckout && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Pick the final print route</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Physical delivery
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Your current map is attached automatically. Choose a shipping country first, then pick framed or
                unframed checkout. {shippingDisclosure}
              </p>
              {printShippingCountryOptions.length > 0 && (
                <div className="mt-3">
                  <label className="text-[11px] font-semibold text-amber-100/80">Shipping country</label>
                  <select
                    value={printShippingCountry ?? ""}
                    onChange={(event) => onPrintShippingCountryChange?.(event.target.value)}
                    className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-xs text-midnight"
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
                  {!canPrintCheckout && (
                    <div className="mt-2 rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2">
                      <p className="text-[11px] font-semibold text-amber-50">{printCheckoutCtaState.disabledReason}</p>
                    </div>
                  )}
                  {printShippingCountry && (
                    <p className="mt-1 text-[10px] text-amber-100/80">
                      Estimated shipping to {getPrintShippingCountryLabel(printShippingCountry)}: framed{" "}
                      {framedShippingLabel} · unframed {unframedShippingLabel}. Delivery: framed {framedDeliveryLabel} ·
                      unframed {unframedDeliveryLabel}
                    </p>
                  )}
                </div>
              )}
              {printUpsellHint ? (
                <p className="mt-2 rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2 text-[11px] text-amber-100">
                  {printUpsellHint}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePrintCheckoutClick(
                      { variant: "poster_framed", includeDigitalAddOn: true },
                      "paywall_print_options",
                    )}
                  disabled={checkoutInFlight || !canPrintCheckout}
                  title={printCheckoutCtaState.disabledReason ?? undefined}
                  className="w-full rounded-2xl border border-amber-200/70 bg-amber-400/30 px-4 py-3 text-left text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : (
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-sm font-semibold">Gift-ready framed print + HD backup</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              Best when the finished piece is the gift and you still want the file.
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-[11px] font-semibold">
                            <span className="block">{printPriceLabels.framed}</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              + {framedShippingLabel} + {printPriceLabels.digitalAddOn}
                            </span>
                          </span>
                        </span>
                      )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePrintCheckoutClick(
                      { variant: "poster_framed", includeDigitalAddOn: false },
                      "paywall_print_options",
                    )}
                  disabled={checkoutInFlight || !canPrintCheckout}
                  title={printCheckoutCtaState.disabledReason ?? undefined}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_framed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : (
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-sm font-semibold">Gift-ready framed print</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              Arrives ready to display.
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-[11px] font-semibold">
                            <span className="block">{printPriceLabels.framed}</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              + {framedShippingLabel}
                            </span>
                          </span>
                        </span>
                      )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePrintCheckoutClick(
                      { variant: "poster_unframed", includeDigitalAddOn: false },
                      "paywall_print_options",
                    )}
                  disabled={checkoutInFlight || !canPrintCheckout}
                  title={printCheckoutCtaState.disabledReason ?? undefined}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_unframed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : (
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-sm font-semibold">Unframed print only</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              Best if you already have a frame plan.
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-[11px] font-semibold">
                            <span className="block">{printPriceLabels.unframed}</span>
                            <span className="mt-1 block text-[10px] font-medium text-amber-100/80">
                              + {unframedShippingLabel}
                            </span>
                          </span>
                        </span>
                      )}
                </button>
              </div>
              {checkoutInFlight && (
                <p className="mt-2 text-[10px] text-amber-100/80">{printCheckoutCtaState.helperText}</p>
              )}
              {activeIntent === "print" && checkoutError && (
                <p className="mt-2 rounded-lg border border-rose-200/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-100" role="alert">
                  {checkoutError}
                </p>
              )}
            </div>
          )}

          {showDigitalPlans && (
            <>
              <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-midnight">One-time HD for this map</p>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          One-time
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">1 print-ready HD file for this saved map. No subscription required.</p>
                    </div>
                  <div className="text-right text-sm font-semibold text-amber-800">
                    <span>{priceLabels.single}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDigitalCheckoutClick("single")}
                  disabled={checkoutInFlight}
                  className="mt-3 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  {checkoutInFlight ? DIGITAL_CHECKOUT_REDIRECT_LABEL : getDigitalCheckoutPrimaryLabel(priceLabels.single)}
                </button>
                <p className="mt-2 text-[11px] text-neutral-600">
                  {checkoutInFlight
                    ? DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT
                    : "Pay once for this saved design. Preview stays free, and the HD file unlocks right after payment."}
                </p>
                {activeIntent !== "print" && checkoutError && (
                  <p className="mt-2 rounded-lg border border-rose-200/60 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700" role="alert">
                    {checkoutError}
                  </p>
                )}
              </div>
            </>
          )}

          {activeIntent !== "print" && onStartPrintCheckout && printPriceLabels && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Want it shipped as a gift instead?</p>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Framed stays the ready-to-display route. Unframed keeps the physical total lower.
              </p>
              <p className="mt-2 text-[11px] text-amber-100/80">
                Framed from {printPriceLabels.framed} + shipping. Unframed from {printPriceLabels.unframed} + shipping.
              </p>
              <button
                type="button"
                onClick={handleSwitchToPrintIntent}
                disabled={checkoutInFlight}
                className="mt-3 w-full rounded-full border border-amber-200/60 bg-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/35 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Compare print options
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 text-[11px] text-neutral-600">
          <p>Your current preview stays saved. Close this and keep editing free if you are not ready to buy yet.</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <p>Promo codes apply at checkout.</p>
            <p>Questions? Email {supportEmail}.</p>
          </div>
        </div>
        {showReferralHint && (
          <p className="mt-1 text-[11px] text-neutral-600">
            If your referral code is eligible, the friend offer is applied automatically at checkout.
          </p>
        )}
      </div>
    </div>
  );
}
