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
    singleCta: string;
    packCta: string;
    subscriptionCta: string;
    badgeLabel: string;
  }
> = {
  control: {
    title: "Buy this map in HD or print",
    subtitle: "This exact preview is already saved. Start with one-time HD, or switch to print checkout for a physical gift.",
    singleCta: "Buy this map in HD",
    packCta: "Buy 3 HD exports",
    subscriptionCta: "Start unlimited",
    badgeLabel: "Repeat use",
  },
  value_anchor: {
    title: "Buy this map in HD",
    subtitle: "This exact preview is already saved. Most first-time buyers start with one-time HD and only pay for this map.",
    singleCta: "Buy this map in HD",
    packCta: "Buy 3 HD exports",
    subscriptionCta: "Start unlimited",
    badgeLabel: "Repeat use",
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
  const [showMoreDigitalOptions, setShowMoreDigitalOptions] = useState(false);
  const [printUpsellHint, setPrintUpsellHint] = useState<string | null>(null);
  const supportEmail = getBusinessProfile().email;
  const shippingDisclosure = getPrintShippingDisclosure();
  const preferredVariant = preferredPrintVariant === "poster_unframed" ? "poster_unframed" : "poster_framed";
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

  useEffect(() => {
    if (!hasPrintOptions) {
      setActiveIntent("digital");
      return;
    }
    setActiveIntent(purchaseIntent === "print" ? "print" : "digital");
  }, [hasPrintOptions, purchaseIntent]);

  useEffect(() => {
    if (activeIntent === "digital") {
      setShowMoreDigitalOptions(false);
    }
  }, [activeIntent]);

  useEffect(() => {
    if (printShippingCountry) {
      setPrintUpsellHint(null);
    }
  }, [printShippingCountry]);

  useEffect(() => {
    if (!viewedListsRef.current.has("paywall_digital_primary")) {
      trackViewItemList({
        itemListId: "paywall_digital_primary",
        itemListName: "Paywall digital primary option",
        items: [{ plan: "single", orderType: "digital", index: 0 }],
      });
      viewedListsRef.current.add("paywall_digital_primary");
    }

    if (showMoreDigitalOptions && !viewedListsRef.current.has("paywall_digital_secondary")) {
      trackViewItemList({
        itemListId: "paywall_digital_secondary",
        itemListName: "Paywall digital secondary options",
        items: [
          { plan: "pack3", orderType: "digital", index: 0 },
          { plan: "subscription", orderType: "digital", index: 1 },
        ],
      });
      viewedListsRef.current.add("paywall_digital_secondary");
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
  }, [activeIntent, hasPrintOptions, printPriceLabels, showMoreDigitalOptions]);

  const handleDigitalCheckoutClick = (plan: CheckoutPlan) => {
    const listId = plan === "single" ? "paywall_digital_primary" : "paywall_digital_secondary";
    const listName = plan === "single" ? "Paywall digital primary option" : "Paywall digital secondary options";
    trackSelectItem({
      itemListId: listId,
      itemListName: listName,
      item: {
        plan,
        orderType: "digital",
        index: plan === "single" ? 0 : plan === "pack3" ? 0 : 1,
      },
    });
    onStartCheckout(plan);
  };

  const handleToggleMoreDigitalOptions = () => {
    setShowMoreDigitalOptions((prev) => {
      const next = !prev;
      track("paywall_more_digital_options_toggled", {
        expanded: next,
        activeIntent,
      });
      return next;
    });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25">
        <h3 className="text-lg font-semibold text-midnight">{copy.title}</h3>
        <p className="mt-2 text-xs text-neutral-700">
          {activeIntent === "print" && hasPrintOptions
            ? "Choose your print route. Framed + HD is the strongest gift path; unframed keeps the total lower."
            : copy.subtitle}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">File quality</p>
            <p className="mt-1 text-[11px] text-neutral-700">HD export up to 6000px with no watermark.</p>
          </div>
          <div className="rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">Checkout</p>
            <p className="mt-1 text-[11px] text-neutral-700">
              Secure Stripe checkout with card, Apple Pay, Google Pay, and Link on supported devices.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              {activeIntent === "print" ? "Print route" : "Delivery"}
            </p>
            <p className="mt-1 text-[11px] text-neutral-700">
              {activeIntent === "print"
                ? "Your saved map carries into print checkout, then fulfillment begins after payment."
                : "Instant HD download right after successful payment."}
            </p>
          </div>
        </div>
        {activeIntent === "digital" && (
          <p className="mt-3 rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2 text-[11px] font-medium text-neutral-700">
            Just need this one map? The one-time HD option is enough. Packs and unlimited only make sense for repeat exports.
          </p>
        )}

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
              Digital HD
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
                <p className="text-sm font-semibold">Choose your print format</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Physical delivery
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Your current map is attached automatically. Shipping is shown in Stripe checkout, then fulfillment
                processing begins after payment. {shippingDisclosure}
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
                      <p className="mt-1 text-[10px] text-amber-100/80">{printCheckoutCtaState.helperText}</p>
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
                  className="w-full rounded-full border border-amber-200/70 bg-amber-400/30 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : `Framed + HD file (recommended) • ${printPriceLabels.framed} + ${framedShippingLabel} + ${printPriceLabels.digitalAddOn}`}
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
                  className={`w-full rounded-full border px-4 py-2 text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_framed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : `Framed print • ${printPriceLabels.framed} + ${framedShippingLabel}`}
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
                  className={`w-full rounded-full border px-4 py-2 text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_unframed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  {checkoutInFlight
                    ? PRINT_CHECKOUT_REDIRECT_LABEL
                    : `Unframed print • ${printPriceLabels.unframed} + ${unframedShippingLabel}`}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-amber-100/80">{printCheckoutCtaState.helperText}</p>
            </div>
          )}

          <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-midnight">One HD export</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    One-time
                  </span>
                </div>
                <p className="text-xs text-neutral-600">1 print-ready download for this map • no subscription</p>
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
              {checkoutInFlight ? DIGITAL_CHECKOUT_REDIRECT_LABEL : copy.singleCta}
            </button>
            <p className="mt-2 text-[11px] text-neutral-600">
              {checkoutInFlight
                ? DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT
                : "Pay once for this saved design. The HD file unlocks right after payment."}
            </p>
            <button
              type="button"
              onClick={handleToggleMoreDigitalOptions}
              className="mt-2 text-[11px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
            >
              {showMoreDigitalOptions ? "Hide pack + unlimited plans" : "Need multiple exports? Show pack + unlimited plans"}
            </button>
          </div>

          {showMoreDigitalOptions && (
            <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-midnight">3-credit pack</p>
                  <p className="text-xs text-neutral-600">Use when you plan to make more maps, revisions, or gifts</p>
                </div>
                <div className="text-right text-sm font-semibold text-amber-800">
                  {priceLabels.pack3}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDigitalCheckoutClick("pack3")}
                disabled={checkoutInFlight}
                className="mt-3 w-full rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {checkoutInFlight ? DIGITAL_CHECKOUT_REDIRECT_LABEL : copy.packCta}
              </button>
              <p className="mt-2 text-[11px] text-neutral-600">Each HD export uses one credit from this pack.</p>
            </div>
          )}

          {showMoreDigitalOptions && (
            <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-midnight">Unlimited monthly</p>
                    <span className="rounded-full bg-amber-300/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-midnight">
                      {copy.badgeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-700">Unlimited HD exports for ongoing use • cancel anytime</p>
                </div>
                <div className="text-right text-sm font-semibold text-amber-900">
                  {priceLabels.subscription}
                  <span className="text-xs text-amber-900/70">/mo</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDigitalCheckoutClick("subscription")}
                disabled={checkoutInFlight}
                className="mt-3 w-full rounded-full bg-[#0b1433] px-4 py-2 text-sm font-semibold text-amber-100 shadow-md transition hover:-translate-y-[1px] hover:bg-[#0b1a40] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {checkoutInFlight ? DIGITAL_CHECKOUT_REDIRECT_LABEL : copy.subscriptionCta}
              </button>
            </div>
          )}

          {activeIntent !== "print" && onStartPrintCheckout && printPriceLabels && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Prefer a physical print?</p>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Switch to the print tab for framed or unframed checkout from this same saved design.
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
                See printed gift options
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 space-y-1 text-[11px] text-neutral-600">
          <p>Promo codes apply at checkout. Subscription can be canceled anytime.</p>
          <p>Questions before paying? Email {supportEmail}.</p>
        </div>
        {showReferralHint && (
          <p className="mt-1 text-[11px] text-neutral-600">
            If your referral code is eligible, the friend offer is applied automatically at checkout.
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
          >
            Not now
          </button>
        </div>
        {checkoutError && <p className="mt-2 text-sm font-semibold text-rose-700">{checkoutError}</p>}
      </div>
    </div>
  );
}
